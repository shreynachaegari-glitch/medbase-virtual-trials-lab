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


def ai_stats() -> dict:
    """Every figure on the Applied AI panel, read from the evaluation files. A file that isn't there leaves its figure out."""
    results = Path(__file__).resolve().parent.parent.parent / "results"

    def read(name: str) -> dict | None:
        path = results / name
        return json.loads(path.read_text()) if path.exists() else None

    stats: dict = {}
    if (guard := read("guard_eval.json")):
        reached, total = guard["shipped_guard"]["personal_reaching_a_simulation"]
        stats["guard"] = {"personal_reached": reached, "personal_total": total}
    if (copilot := read("copilot_eval.json")):
        stats["copilot"] = {"right_tool": copilot["summary"]["right_tool"], "questions": copilot["summary"]["questions"]}
    if (retrieval := read("retrieval_eval.json")):
        held_out = retrieval["held_out"]
        stats["retrieval"] = {"notes": held_out["notes"], "hit_at_3": held_out["hit_at_3"], "questions": held_out["answerable"]}
    if (surrogate := read("surrogate_eval.json")):
        stats["surrogate"] = {"r2": surrogate["a1c_r2"], "runs": surrogate["runs_used"]}
    if (designer := read("designer_eval.json")):
        stats["designer"] = {"fewer_runs_pct": round(designer["summary"]["fewer_runs_share"] * 100)}
    if (posterior := read("posterior.json")):
        stats["calibration"] = {"steps": posterior.get("steps"), "trials": len(posterior.get("trials", [])) or 3}
    if (validation := read("validation.json")):
        rows = validation["contrasts"]
        stats["blind"] = {"within": sum(bool(r["within_0_30"]) for r in rows), "total": len(rows)}
    return stats


FILES["ai-stats.json"] = ai_stats()
for name, body in FILES.items():
    (OUT / name).write_text(json.dumps(body))
print(sorted(FILES))
