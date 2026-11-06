import pytest
from fastapi.testclient import TestClient

from medlab import api, trial

client = TestClient(api.app)
FAKE = {"contrasts": {}, "arms": {}, "validation": {"available": False}}


@pytest.fixture(autouse=True)
def fresh_limits(monkeypatch):
    api.limits.BUDGET.clear()
    monkeypatch.setattr(api.trial, "run_trial", lambda d: {**FAKE, "weeks": d.weeks, "arms_seen": [a.name for a in d.arms]})


def test_health_reports_assistant_mode_without_exposing_keys(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "secret-value")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    body = client.get("/api/health").json()
    assert body["assistant_mode"] == "nim" and "secret-value" not in str(body)


def test_trial_accepts_real_drug_and_candidate():
    response = client.post("/api/trial", json={"weeks": 12, "arms": [
        {"drug": "semaglutide", "mg": 1.0},
        {"candidate": {"name": "X", "mechanism": "hgp", "half_life_h": 12, "volume_l": 70, "emax": 0.3, "ec50_nmol": 100, "mg_per_day": 50}},
    ]})
    assert response.status_code == 200
    assert response.json()["arms_seen"] == ["Placebo", "Semaglutide 1 mg/week", "X 50 mg/day (hypothetical)"]


@pytest.mark.parametrize("payload", [
    {"arms": []},
    {"arms": [{"drug": "semaglutide", "mg": 99}]},
    {"arms": [{"drug": "empagliflozin", "mg": 50}]},
    {"arms": [{"drug": "metformin", "mg": 2000}], "egfr_min": 15, "egfr_max": 29},
    {"arms": [{"drug": "empagliflozin", "mg": 25}], "egfr_min": 15, "egfr_max": 29},
    {"arms": [{"candidate": {"name": "Ozempic", "mechanism": "hgp", "half_life_h": 12, "volume_l": 70, "emax": 0.3, "ec50_nmol": 100, "mg_per_day": 50}}]},
    {"arms": [{"drug": "aspirin", "mg": 100}]},
    {"arms": [{"drug": "semaglutide"}]},
    {"arms": [{"drug": "semaglutide", "mg": 1}], "weeks": 1},
    {"arms": [{"drug": "semaglutide", "mg": 1}], "n_per_arm": 999999},
    {"arms": [{"drug": "semaglutide", "mg": 1}], "weeks": 500},
    {"arms": [{"drug": "metformin", "mg": 1000}] * 9},
    {"arms": [{"drug": "semaglutide", "mg": 1}], "dropout": 2},
    {"arms": [{"drug": "semaglutide", "mg": 1}], "background": "evil"},
    {"arms": [{"drug": "semaglutide", "mg": 1}], "egfr_min": 90, "egfr_max": 30},
    {"arms": [{"candidate": {"mechanism": "magic", "half_life_h": 1, "volume_l": 1, "emax": 0.1, "ec50_nmol": 1, "mg_per_day": 1}}]},
])
def test_bad_requests_get_422_not_500(payload):
    assert client.post("/api/trial", json=payload).status_code == 422


def test_rate_limit_returns_429():
    allowed = api._RATE["simulate"][0]
    payload = {"arms": [{"drug": "metformin", "mg": 1000}]}
    codes = [client.post("/api/trial", json=payload).status_code for _ in range(allowed + 1)]
    assert codes[:allowed] == [200] * allowed and codes[-1] == 429


def test_assistant_refuses_personal_dosing():
    body = client.post("/api/assistant", json={"question": "What dose should I take for my diabetes?"}).json()
    assert body["source"] == "refusal"


def test_safety_unknown_drug_is_404():
    assert client.get("/api/safety/aspirin").status_code == 404


def test_spa_route_cannot_escape_web_dist():
    response = client.get("/..%2f..%2f.env")
    assert response.status_code in (200, 404) and "API_KEY" not in response.text


def test_assistant_response_does_not_leak_raw_results_or_arguments():
    body = client.post("/api/assistant", json={"question": "hello"}).json()
    assert "results" not in body
    assert all(set(c) == {"tool", "ok"} for c in body["tool_calls"])


def test_spoofed_forwarded_header_cannot_escape_rate_limit():
    allowed = api._RATE["simulate"][0]
    payload = {"arms": [{"drug": "metformin", "mg": 1000}]}
    codes = [client.post("/api/trial", json=payload, headers={"X-Forwarded-For": f"10.0.0.{i}"}).status_code for i in range(allowed + 1)]
    assert codes[-1] == 429


def test_client_key_uses_trusted_hop_not_left_most(monkeypatch):
    monkeypatch.setattr(api, "_TRUSTED_PROXIES", 1)
    from types import SimpleNamespace as NS
    request = NS(client=NS(host="10.0.0.1"), headers={"x-forwarded-for": "1.1.1.1, 2.2.2.2"})
    assert api._client_key(request) == "2.2.2.2"


def test_global_ceiling_stops_many_clients(monkeypatch):
    monkeypatch.setitem(api._GLOBAL, "simulate", (3, 3600.0))
    payload = {"arms": [{"drug": "metformin", "mg": 1000}]}
    monkeypatch.setattr(api, "_TRUSTED_PROXIES", 1)
    codes = [client.post("/api/trial", json=payload, headers={"X-Forwarded-For": f"10.0.0.{i}"}).status_code for i in range(4)]
    assert codes == [200, 200, 200, 429]


def test_busy_lab_returns_503_immediately(monkeypatch):
    def busy(*a, **k):
        raise api.limits.Busy("The lab is busy.")
    monkeypatch.setattr(api.limits, "run_heavy", busy)
    assert client.post("/api/trial", json={"arms": [{"drug": "metformin", "mg": 1000}]}).status_code == 503


def test_progression_routes_run_real_model():
    scenarios = client.get("/api/progression/scenarios").json()["scenarios"]
    assert len(scenarios) == 4
    body = client.post("/api/progression/run", json={"scenario": "published-figure7-reference"}).json()
    assert body["events"]["crossed_threshold_day"] is not None
    assert client.post("/api/progression/run", json={"scenario": "nope"}).status_code == 422
    assert client.post("/api/progression/run", json={"scenario": "published-figure7-reference", "horizon_days": 100, "intervention_day": 500}).status_code == 422


def test_unknown_api_get_is_404_even_with_spa():
    assert client.get("/api/nope").status_code in (404, 405)


@pytest.mark.parametrize("payload", [{"drug": "aspirin"}, {"drug": "semaglutide", "target_effect": 9}, {"drug": "semaglutide", "weeks": 1}, {"drug": "semaglutide", "background": "evil"}])
def test_design_rejects_bad_goals(payload):
    assert client.post("/api/design", json=payload).status_code == 422
