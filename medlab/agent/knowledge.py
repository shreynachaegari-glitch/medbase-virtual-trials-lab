"""A small vector index over reviewed notes, for retrieval-augmented answers to ordinary questions.

Each note becomes a TF-IDF vector over words and character trigrams, so misspellings still land near the right
note. A question is matched by cosine similarity. It is in-memory and numpy-only, so it needs no server or account
and runs in the browser too. Retrieved notes are all a language model may use; if the model fails, the top note is shown.
"""
from __future__ import annotations

import re
from collections import Counter
from functools import lru_cache

import numpy as np

from .. import trial
from . import reference, track_record

MIN_SCORE = 0.13
STRONG_SCORE = 0.25  # enough to trust letter overlap alone, which is what catches a misspelling
_STOP_WORDS = frozenset("what whats when where which about tell that this does mean with from have your some thing things there their would could should today please explain something anything know like just really".split())
TOP_K = 3
_EXTRA_NOTES = (
    ("Non-inferiority", "A non-inferiority trial asks whether a new treatment is not worse than a comparator by more than a pre-set margin. It differs from a superiority trial, which asks whether a treatment is better."),
    ("P value", "A p value is the probability of seeing a result at least this extreme if there were truly no effect. It is not the probability that a treatment works, and it says nothing about how large the effect is."),
    ("Effect size", "An effect size says how large a difference is. In this lab the main one is the change in HbA1c against a comparator, in percentage points. A result can be statistically clear and still small."),
    ("Mean absolute error", "Mean absolute error averages how far predictions were from the real results, ignoring direction. The lab's blind test used it, in HbA1c points, as one of its pre-registered checks."),
    ("Trial analysis", "Each simulated trial enrols virtual patients, randomises them, adds assay noise and analyses the result with ANCOVA, adjusting for baseline, the way many real trials do. Baselines are matched to a study population by entropy balancing."),
    ("Not modelled", "The lab does not model hypoglycaemia, cardiovascular outcomes, kidney outcomes, serious adverse events, sulfonylureas or insulin. Adverse events shown on the safety tab come from real trial reports and are not simulated."),
    ("Using the lab", "You can ask the copilot to simulate a trial, compare drugs, estimate sample size or see who responds in the model. The AI Trial Designer takes a goal and searches for a study design. The Proof tab shows every blind prediction against the real result."),
    ("Limits", "The lab predicts average HbA1c effects in study populations and says nothing about an individual. Its virtual patients come from a US survey. It is for research and education, is not clinically validated, and gives no dosing guidance."),
    ("Why simulate trials", "Trials take years and large sums. A simulator lets a student or researcher explore how a study might behave before it exists, and see how far to trust the answer. It does not replace a real trial."),
    ("Safety guard", "A rule-based guard runs before any model. Only questions framed as research reach a simulation, personal medical questions are refused, and messages that look urgent get emergency contacts."),
    ("Digital twin", "A digital twin here means a virtual patient: model parameters derived from one real person's survey lab values. It is used only in groups for trials and is never a model of a person who asks a question."),
)
_WORD = re.compile(r"[a-z0-9]+")


def _notes() -> list[tuple[str, str]]:
    notes = [(name.capitalize(), text) for name, text in reference._DRUGS.items()]
    notes += [(keys[0], text) for keys, text in reference._TERMS]
    notes += list(_EXTRA_NOTES)
    report = track_record.overview()
    if report.get("available"):
        notes.append(("Blind test result", track_record.validation_sentence(trial.validation_status()) + f" Held up in: {', '.join(report['held_up_in'])}. Missed in: {', '.join(report['missed_in'])}."))
    return notes


def _terms(text: str) -> Counter:
    words = _WORD.findall(text.lower())
    grams = [w[i:i + 3] for w in words if len(w) > 3 for i in range(len(w) - 2)]
    return Counter(words + grams)


@lru_cache(maxsize=1)
def _index() -> tuple[list[tuple[str, str]], dict[str, int], np.ndarray, np.ndarray]:
    notes = _notes()
    counts = [_terms(f"{title} {title} {text}") for title, text in notes]
    vocabulary = {term: i for i, term in enumerate(sorted({t for c in counts for t in c}))}
    idf = np.zeros(len(vocabulary))
    for count in counts:
        for term in count:
            idf[vocabulary[term]] += 1
    idf = np.log((1 + len(notes)) / (1 + idf)) + 1
    matrix = np.zeros((len(notes), len(vocabulary)))
    for row, count in enumerate(counts):
        for term, n in count.items():
            matrix[row, vocabulary[term]] = (1 + np.log(n)) * idf[vocabulary[term]]
    return notes, vocabulary, idf, matrix / np.linalg.norm(matrix, axis=1, keepdims=True)


def search(question: str, k: int = TOP_K) -> list[dict]:
    """The closest notes above the score floor, best first."""
    notes, vocabulary, idf, matrix = _index()
    vector = np.zeros(len(vocabulary))
    for term, n in _terms(question).items():
        if term in vocabulary:
            vector[vocabulary[term]] = (1 + np.log(n)) * idf[vocabulary[term]]
    length = np.linalg.norm(vector)
    if length == 0:
        return []
    scores = matrix @ (vector / length)
    best = [i for i in np.argsort(scores)[::-1][:k] if scores[i] >= MIN_SCORE]
    asked = {w for w in _WORD.findall(question.lower()) if len(w) > 3 and w not in _STOP_WORDS}
    hits = [i for i in best if scores[i] >= STRONG_SCORE or asked & set(_WORD.findall(f"{notes[i][0]} {notes[i][1]}".lower()))]
    return [{"title": notes[i][0], "text": notes[i][1], "score": round(float(scores[i]), 3)} for i in hits]
