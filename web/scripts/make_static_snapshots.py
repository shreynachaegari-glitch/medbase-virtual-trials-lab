"""Writes the saved files that need no calibration, so Parameters and Safety work before the engine loads.

Every value comes from the real engine code: nothing is hand-written and nothing is sealed. Run from
the project root: .venv/bin/python web/scripts/make_static_snapshots.py
"""
import json
from pathlib import Path

from medlab import safety, service

OUT = Path(__file__).resolve().parent.parent / "public" / "snapshots"
OUT.mkdir(parents=True, exist_ok=True)
FILES = {
    "parameters.json": service.parameters(),
    "drugs.json": service.known_drugs(),
    "progression-scenarios.json": service.progression_scenarios(),
    **{f"safety-{drug}.json": service.drug_safety(drug) for drug in safety.SOURCES},
}
for name, body in FILES.items():
    (OUT / name).write_text(json.dumps(body))
print(sorted(FILES))
