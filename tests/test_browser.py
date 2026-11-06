"""The browser entry point, run natively. A separate Pyodide run proves the same code works in WebAssembly."""
import json

import pytest

from medlab import browser, limits


def call(method, path, body=None):
    reply = json.loads(browser.handle(method, path, json.dumps(body) if body is not None else None))
    return reply["status"], reply["body"]


def test_health_says_browser_and_offline():
    status, body = call("GET", "/api/health")
    assert status == 200 and body["engine"] == "browser" and body["assistant_mode"] == "offline"


@pytest.mark.parametrize("payload", [{"arms": []}, {"arms": [{"drug": "semaglutide", "mg": 99}]}, {"arms": [{"drug": "metformin", "mg": 2000}], "egfr_min": 15, "egfr_max": 29}])
def test_bad_input_gets_422_like_the_server(payload):
    from fastapi.testclient import TestClient
    from medlab import api
    limits.BUDGET.clear()
    assert call("POST", "/api/trial", payload)[0] == 422
    assert TestClient(api.app).post("/api/trial", json=payload).status_code == 422


def test_unknown_paths_and_safety():
    assert call("GET", "/api/nope")[0] == 404
    assert call("GET", "/api/safety/aspirin")[0] == 404


def test_assistant_refuses_in_the_browser_too():
    status, body = call("POST", "/api/assistant", {"question": "What dose of metformin for a 55-year-old with HbA1c 9?"})
    assert status == 200 and body["source"] == "refusal" and not body["sent_to_provider"]


def _start(q):
    return json.loads(browser.session_start(q))


def test_session_refuses_personal_questions_before_the_model_sees_them():
    assert _start("What dose of metformin for a 55-year-old?")["done"]["source"] == "refusal"
    assert _start("मुझे मेटफॉर्मिन बंद करनी है")["done"]["source"] == "language"


def test_session_answers_small_talk_itself_and_asks_the_model_for_research():
    assert _start("hello")["done"]["source"] == "intent-model"
    started = _start("compare semaglutide 1 mg with placebo")
    assert "done" not in started and started["messages"][0]["role"] == "system" and started["tools"]


def test_session_guard_blocks_invented_numbers_and_advice():
    _start("compare semaglutide 1 mg with placebo")
    assert json.loads(browser.session_finish("It lowered HbA1c by 9.9 points."))["done"]["source"] == "planner"
    _start("compare semaglutide 1 mg with placebo")
    assert json.loads(browser.session_finish("You should take semaglutide."))["done"]["source"] == "refusal"


def test_session_failure_falls_back_with_a_clear_note():
    _start("how accurate is this lab")
    reply = json.loads(browser.session_finish(None, failed=True))["done"]
    assert reply["source"] == "planner" and "unavailable" in reply["guard_note"]


def test_session_passes_a_grounded_reply_and_strips_thinking():
    _start("how accurate is this lab")
    reply = json.loads(browser.session_finish("<think>9.9</think>Validation has not been run yet."))["done"]
    assert reply["source"] == "nim" and reply["text"] == "Validation has not been run yet."


def test_session_tool_cannot_search_in_the_browser_and_handles_bad_json():
    _start("compare semaglutide 1 mg with placebo")
    assert "unavailable" in browser.session_tool("search_literature", "{}")
    assert "not valid JSON" in browser.session_tool("run_virtual_trial", "{oops")
