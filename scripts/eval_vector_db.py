"""Runs the real vector database and checks it against the numpy search on every question list.

Starts PostgreSQL with pgvector (PGlite, under Node), loads the note embeddings, and asks it each question. It must
return the same top notes as numpy, so the retrieval scores measured with numpy also describe the database.
Spends a few NVIDIA embedding calls. Run from the project root: PYTHONPATH=.:scripts .venv/bin/python scripts/eval_vector_db.py
"""
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np

import embed_notes
from medlab.agent import knowledge

ROOT = Path(__file__).resolve().parent.parent
LISTS = [ROOT / "tests" / "retrieval_lists" / name for name in ("blind_questions.json", "held_out_questions.json")]
OUT = ROOT / "results" / "vector_db_eval.json"


def questions() -> list[str]:
    found: list[str] = []
    for path in LISTS:
        lists = json.loads(path.read_text())
        found += [row["question"] for row in lists["answerable"]] + lists["off_topic"]
    return list(dict.fromkeys(found))


if __name__ == "__main__":
    asked = questions()
    vectors = embed_notes.embed(asked, "query")
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "queries.json"
        path.write_text(json.dumps({"questions": asked, "vectors": vectors.round(6).tolist()}))
        run = subprocess.run(["node", "web/scripts/run_vector_db.mjs", str(path)], capture_output=True, text=True, cwd=ROOT, check=True, timeout=300)
    database = json.loads(run.stdout)
    same_order = same_top3 = 0
    largest_gap = 0.0
    for question, vector, scores in zip(asked, vectors, database["scores"]):
        vector = np.asarray(vector)
        plain = [p["title"] for p in knowledge.search(question, vector=vector)]
        stored = [p["title"] for p in knowledge.search(question, vector=vector, scores=scores)]
        same_order += plain == stored
        same_top3 += set(plain) == set(stored)
        saved = knowledge._note_vectors() @ (vector / np.linalg.norm(vector))
        titles = [title for title, _ in knowledge._notes()]
        largest_gap = max(largest_gap, float(np.abs(saved - np.array([scores[t] for t in titles])).max()))
    report = {
        "database": database["version"], "pgvector": database["pgvector"], "notes": database["notes"], "questions": len(asked),
        "same_notes_as_numpy": same_top3, "same_order_as_numpy": same_order, "largest_score_difference": round(largest_gap, 5),
        "start_and_load_ms": round(database["load_ms"]), "median_query_ms": round(float(np.median(database["query_ms"])), 2), "ran_under": "Node, the same WebAssembly build the browser loads",
    }
    OUT.write_text(json.dumps(report, indent=1))
    print(json.dumps(report))
