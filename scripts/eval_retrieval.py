"""Scores the copilot's routing and vector search on question lists written blind, from the note titles only.

No language model is called. The first run is kept as `first_blind_run`. Anything changed after it was tuned on
these lists, so later figures are reported as not held out.

Run from the project root: .venv/bin/python scripts/eval_retrieval.py
"""
import json
import os
from pathlib import Path

import numpy as np

from medlab.agent import assistant, knowledge

ROOT = Path(__file__).resolve().parent.parent
LISTS = ROOT / "tests" / "retrieval_lists" / "blind_questions.json"
OUT = ROOT / "results" / "retrieval_eval.json"
DECLINED = {"scope", "refusal", "emergency", "language", "unsupported"}


def query_vectors(questions: list[str]) -> dict[str, np.ndarray]:
    """Embeds every question in one go, as the page would one at a time. Without a key the keyword index is scored."""
    if not os.environ.get("MEDLAB_EVAL_KEY"):
        return {}
    import embed_notes  # noqa: PLC0415
    os.environ["NVIDIA_API_KEY"] = os.environ["MEDLAB_EVAL_KEY"]
    try:
        rows = embed_notes.embed(questions, "query")
    finally:
        os.environ.pop("NVIDIA_API_KEY", None)
    return dict(zip(questions, rows))


VECTORS: dict[str, np.ndarray] = {}


def route(question: str) -> tuple[str, str]:
    """(where it went, source): "model" means it would reach a language model."""
    session = assistant.BrowserSession(question, wants_vector=question in VECTORS)
    started = session.start()
    if "embed" in started:
        session.vector = VECTORS[question]
        session.embedded = True
        started = session.start()
    if "messages" in started:
        return "model", ""
    return "fixed", started["done"]["source"]


def score() -> dict:
    lists = json.loads(LISTS.read_text())
    answerable, misses, declined = lists["answerable"], [], []
    hit1 = hit3 = reciprocal = 0.0
    for row in answerable:
        titles = [p["title"] for p in knowledge.search(row["question"], vector=VECTORS.get(row["question"]))]
        ranks = [titles.index(t) + 1 for t in row["expected"] if t in titles]
        best = min(ranks) if ranks else None
        hit1 += best == 1
        hit3 += best is not None
        reciprocal += 1 / best if best else 0
        if best is None:
            misses.append({"question": row["question"], "expected": row["expected"], "found": titles})
        where, source = route(row["question"])
        if where == "fixed" and source in DECLINED:
            declined.append({"question": row["question"], "source": source})
    off_topic_answered = []
    for question in lists["off_topic"]:
        where, source = route(question)
        if where == "model" or source not in DECLINED | {"intent-model"}:
            off_topic_answered.append({"question": question, "went_to": where, "source": source, "found": [p["title"] for p in knowledge.search(question, vector=VECTORS.get(question))]})
    not_refused = []
    for question in lists["must_refuse"]:
        where, source = route(question)
        if where == "model" or source not in DECLINED:
            not_refused.append({"question": question, "went_to": where, "source": source})
    n = len(answerable)
    return {
        "notes": len(knowledge._notes()), "answerable": n, "hit_at_1": round(hit1 / n, 3), "hit_at_3": round(hit3 / n, 3), "mrr": round(reciprocal / n, 3),
        "answerable_declined": len(declined), "off_topic": len(lists["off_topic"]), "off_topic_answered": len(off_topic_answered),
        "must_refuse": len(lists["must_refuse"]), "must_refuse_not_refused": len(not_refused),
        "retrieval_misses": misses, "declined": declined, "off_topic_failures": off_topic_answered, "refusal_failures": not_refused,
    }


if __name__ == "__main__":
    for key in ("NVIDIA_API_KEY", "ANTHROPIC_API_KEY"):
        os.environ.pop(key, None)
    lists = json.loads(LISTS.read_text())
    VECTORS.update(query_vectors([r["question"] for r in lists["answerable"]] + lists["off_topic"] + lists["must_refuse"]))
    current = {**score(), "retrieval": "neural" if VECTORS else "keyword"}
    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    report = {**current, "written_by": lists["written_by"], "first_blind_run": previous.get("first_blind_run") or current, "tuned_after_first_run": bool(previous)}
    if "held_out" in previous:
        report["held_out"] = previous["held_out"]
    OUT.write_text(json.dumps(report, indent=1))
    print(json.dumps({k: v for k, v in current.items() if not isinstance(v, list)}))
