"""E3 and E4: exercise every route in-process against the real posterior and save what came back."""
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient

from medlab import api

client = TestClient(api.app)
out: dict = {}


def call(name, method, path, **kw):
    t0 = time.time()
    response = getattr(client, method)(path, **kw)
    body = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text[:200]
    out[name] = {"status": response.status_code, "seconds": round(time.time() - t0, 2), "body": body}
    print(f"{name:26s} {response.status_code} {out[name]['seconds']}s")
    return body


TRIAL = {"weeks": 30, "n_per_arm": 200, "arms": [{"drug": "semaglutide", "mg": 1.0}, {"drug": "empagliflozin", "mg": 25}]}
for name, path in (("health", "/api/health"), ("validation", "/api/validation"), ("calibration", "/api/calibration"), ("parameters", "/api/parameters"), ("drugs", "/api/drugs"), ("safety_sema", "/api/safety/semaglutide"), ("safety_empa", "/api/safety/empagliflozin")):
    call(name, "get", path)
call("trial", "post", "/api/trial", json=TRIAL)
call("trial_candidate", "post", "/api/trial", json={"weeks": 26, "arms": [{"candidate": {"name": "Candidate X", "mechanism": "hgp", "half_life_h": 12, "volume_l": 70, "emax": 0.3, "ec50_nmol": 100, "mg_per_day": 50}}]})
call("trial_kidney", "post", "/api/trial", json={"weeks": 24, "egfr_min": 30, "egfr_max": 60, "arms": [{"drug": "empagliflozin", "mg": 25}]})
call("power", "post", "/api/power", json={"weeks": 26, "arms": [{"drug": "sitagliptin", "mg": 100}]})
call("responders", "post", "/api/responders", json={"weeks": 26, "arms": [{"drug": "empagliflozin", "mg": 25}]})
QUESTIONS = ["Compare semaglutide 1 mg and empagliflozin 25 mg over 30 weeks", "How many patients do I need for sitagliptin 100 mg?", "Who responds to empagliflozin?",
             "What are the side effects of semaglutide?", "How accurate is this lab?", "My HbA1c is 9, should I stop metformin?"]
out["assistant"] = []
for q in QUESTIONS:
    api._hits.clear()
    t0 = time.time()
    r = client.post("/api/assistant", json={"question": q})
    body = r.json()
    out["assistant"].append({"question": q, "status": r.status_code, "seconds": round(time.time() - t0, 2), "source": body["source"], "text": body["text"], "tools": [c["tool"] for c in body["tool_calls"]]})
    print(f"Q: {q}\n  [{body['source']}] {body['text']}\n")
Path("results/smoke.json").write_text(json.dumps(out, indent=1, default=str))
