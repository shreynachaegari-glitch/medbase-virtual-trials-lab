"""P3: saved runs for the page's offline mode, exactly as web/SNAPSHOTS.md specifies. Everything is a real response."""
import json
import re
from pathlib import Path

from fastapi.testclient import TestClient

from medlab import api, limits
from medlab.progression_scenarios import SCENARIOS

OUT = Path("web/public/snapshots")
OUT.mkdir(parents=True, exist_ok=True)
client = TestClient(api.app)
BASE = {"background": "any", "dropout": 0, "n_per_arm": 200}
GOAL = {"target_effect": 1.0, "weeks": 26, "background": "any", "target_power": 0.8}
SEMA = {"arms": [{"drug": "semaglutide", "mg": 1}], "weeks": 30, "egfr_min": 30, "egfr_max": 400}
CANDIDATE = {"name": "Candidate X", "mechanism": "hgp", "half_life_h": 24, "volume_l": 70, "emax": 0.3, "ec50_nmol": 100, "mg_per_day": 50}
GETS = {"validation": "/api/validation", "calibration": "/api/calibration", "parameters": "/api/parameters", "drugs": "/api/drugs", "progression-scenarios": "/api/progression/scenarios",
        **{f"safety-{d}": f"/api/safety/{d}" for d in ("semaglutide", "empagliflozin", "sitagliptin", "metformin")}}
POSTS = {
    "trial-sema-vs-empa-30wk": ("/api/trial", {**BASE, "arms": [{"drug": "semaglutide", "mg": 1}, {"drug": "empagliflozin", "mg": 25}], "weeks": 30, "egfr_min": 30, "egfr_max": 400}),
    "trial-kidney-egfr-30-60": ("/api/trial", {**BASE, "arms": [{"drug": "empagliflozin", "mg": 25}], "weeks": 26, "egfr_min": 30, "egfr_max": 60}),
    "trial-kidney-egfr-90-plus": ("/api/trial", {**BASE, "arms": [{"drug": "empagliflozin", "mg": 25}], "weeks": 26, "egfr_min": 90, "egfr_max": 400}),
    "trial-candidate": ("/api/trial", {**BASE, "arms": [{"candidate": CANDIDATE}], "weeks": 26, "egfr_min": 30, "egfr_max": 400}),
    "responders": ("/api/responders", {**BASE, **SEMA}),
    "power": ("/api/power", {**BASE, **SEMA}),
    **{f"design-{d}": ("/api/design", {"drug": d, **GOAL}) for d in ("semaglutide", "empagliflozin", "sitagliptin", "metformin")},
    **{f"progression-{s}": ("/api/progression/run", {"scenario": s}) for s in SCENARIOS},
}


def save(name: str, response) -> None:
    if response.status_code != 200:
        raise SystemExit(f"{name} failed with {response.status_code}: {response.text[:200]}")
    (OUT / f"{name}.json").write_text(response.text)
    print(f"{name}: {len(response.text) // 1024} KB")


for name, path in GETS.items():
    save(name, client.get(path))
for name, (path, body) in POSTS.items():
    limits.BUDGET.clear()
    save(name, client.post(path, json=body))

source = Path("web/SNAPSHOTS.md").read_text()
section = source.split("The starter questions", 1)[1]
starters = re.findall(r'^\s*[-*\d.]+\s*[`"“]?(.+?)[`"”]?\s*$', section, re.M)
if not starters:
    raise SystemExit("could not read starter questions from web/SNAPSHOTS.md")
answers = []
for question in starters:
    limits.BUDGET.clear()
    response = client.post("/api/assistant", json={"question": question})
    if response.status_code != 200:
        raise SystemExit(f"assistant failed on {question!r}")
    answers.append({"question": question, "reply": response.json()})
(OUT / "assistant-starters.json").write_text(json.dumps(answers))
print("starters:", len(answers))
