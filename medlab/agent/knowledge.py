"""A small vector index over the lab's own notes, for retrieval-augmented answers to ordinary questions.

Two kinds of vector. Neural: each note has a saved embedding from an NVIDIA model, and a question's embedding finds
notes by meaning. Keyword: TF-IDF over words and character trigrams, which needs no network, so it is the fallback.
Both are matched by cosine similarity, in memory, with numpy only, so no server or account is needed and it runs in
the browser. Retrieved notes are all a language model may use; if the model fails, the top note is shown.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

import numpy as np

from .. import trial
from . import notes as general_notes
from . import reference, track_record

EMBED_MODEL = "nvidia/nemotron-3-embed-1b"
VECTORS = Path(__file__).with_name("note_vectors.json")
NEURAL_MIN = 0.2  # off-topic questions mostly score below this, and the model can still reply NOT_COVERED
MAX_EMBEDDED = 500  # the proxy refuses anything longer
NEURAL_TITLE_BONUS = 0.05
CLOSE_MATCH = {"neural": 0.3, "keyword": 0.6}  # a note this close answers the question by itself
MIN_SCORE = 0.13
STRONG_SCORE = 0.3  # enough to trust letter overlap alone, which is what catches a misspelling
TITLE_BONUS = 0.25
WORD_BONUS = 0.1
_STOP_WORDS = frozenset("the and for are was you can how why who not but its has did use used what whats when where which about tell that this does mean with from have your some thing things there their would could should today please explain something anything know like just really work works here does its get got any more much many".split())
_TITLES = {"hba1c": "HbA1c", "egfr": "eGFR", "glp-1": "GLP-1", "sglt2": "SGLT2", "dpp-4": "DPP-4", "nhanes": "NHANES", "this lab": "This lab", "my data": "Privacy"}
TOP_K = 3
_EXTRA_NOTES = (
    ("Non-inferiority", "A non-inferiority trial asks whether a new treatment is not worse than a comparator by more than a pre-set margin. It differs from a superiority trial, which asks whether a treatment is better."),
    ("P value", "A p value is the probability of seeing a result at least this extreme if there were truly no effect. It is not the probability that a treatment works, and it says nothing about how large the effect is."),
    ("Effect size", "An effect size, such as a mean difference or Cohen's d, says how large a difference is. In this lab the main one is the change in HbA1c against a comparator, in percentage points. A result can be statistically clear and still small."),
    ("Mean absolute error", "Mean absolute error averages how far predictions were from the real results, ignoring direction. The lab's blind test used it, in HbA1c points, as one of its pre-registered checks."),
    ("Trial analysis", "Each simulated trial enrols virtual patients, randomises them, adds assay noise and analyses the result with ANCOVA, adjusting for baseline, the way many real trials do. Baselines are matched to a study population by entropy balancing."),
    ("Not modelled", "The lab does not model hypoglycaemia, cardiovascular outcomes, kidney outcomes, serious adverse events, sulfonylureas or insulin. Adverse events shown on the safety tab come from real trial reports and are not simulated."),
    ("Using the lab", "To start, type a request into the copilot or press a preset in the trial builder. The copilot can simulate a trial, compare drugs, estimate sample size or explore response patterns in the model. The AI Trial Designer takes a goal and searches for a study design. The Proof tab shows every blind prediction against the real result."),
    ("Limits", "The lab's weak points: it predicts average HbA1c effects in study populations and says nothing about an individual. Its virtual patients come from a US survey. It is for research and education, is not clinically validated, and gives no dosing guidance."),
    ("Why simulate trials", "Trials take years and large sums. A simulator lets a student or researcher explore how a study might behave before it exists, and see how far to trust the answer. It does not replace a real trial."),
    ("Safety guard", "A rule-based guard runs before any model. Only questions framed as research reach a simulation, personal medical questions are refused, and messages that look urgent get emergency contacts."),
    ("Digital twin", "A digital twin here means a virtual patient: model parameters derived from one real person's survey lab values. It is used only in groups for trials and is never a model of a person who asks a question."),
)
_WORD = re.compile(r"[a-z0-9]+")


def _notes() -> list[tuple[str, str]]:
    notes = [(name.capitalize(), text) for name, text in reference._DRUGS.items()]
    notes += [(_TITLES.get(keys[0], keys[0].capitalize()), text) for keys, text in reference._TERMS if keys[0] != "my data"]
    notes += list(_EXTRA_NOTES) + list(general_notes.ALL_NOTES)
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


def _asked_words(question: str) -> list[str]:
    """The words that carry the question: short ones only if they look like a name, such as AI or V3."""
    words = _WORD.findall(question.lower())
    return [w for w in words if w not in _STOP_WORDS and (len(w) > 2 or w == "ai" or any(c.isdigit() for c in w))]


def embedded_text(title: str, text: str) -> str:
    """A note as its embedding sees it: the wording people ask in, then the note."""
    asked = general_notes.ASKED_AS.get(title, "")
    return f"{title}. {asked} {text}" if asked else f"{title}. {text}"


def fingerprint() -> str:
    """Changes whenever a note does, so saved embeddings can't silently describe old text."""
    return hashlib.sha256("\n".join(embedded_text(title, text) for title, text in _notes()).encode()).hexdigest()[:16]


@lru_cache(maxsize=1)
def _note_vectors() -> np.ndarray | None:
    if not VECTORS.exists():
        return None
    saved = json.loads(VECTORS.read_text())
    if saved["fingerprint"] != fingerprint():
        return None
    rows = np.frombuffer(base64.b64decode(saved["vectors"]), dtype="<f2").astype(np.float64).reshape(saved["shape"])
    return rows / np.linalg.norm(rows, axis=1, keepdims=True)


def parse_vector(raw: str) -> np.ndarray | None:
    """A question's embedding as the page received it, or None if it is unusable."""
    saved = _note_vectors()
    if saved is None or not raw:
        return None
    try:
        vector = np.array(json.loads(raw), dtype=np.float64)
    except (TypeError, ValueError):
        return None
    if vector.shape != (saved.shape[1],) or not np.isfinite(vector).all() or not np.linalg.norm(vector):
        return None
    return vector


def _search_neural(question: str, vector: np.ndarray, saved: np.ndarray, k: int) -> list[dict]:
    notes, *_ = _index()
    scores = saved @ (vector / np.linalg.norm(vector))
    asked = set(_asked_words(question))
    for row, (title, _) in enumerate(notes):
        if asked & set(_WORD.findall(title.lower())):
            scores[row] += NEURAL_TITLE_BONUS
    best = [i for i in np.argsort(scores)[::-1][:k] if scores[i] >= NEURAL_MIN]
    return [{"title": notes[i][0], "text": notes[i][1], "score": round(float(min(scores[i], 1.0)), 3)} for i in best]


def search(question: str, k: int = TOP_K, vector: np.ndarray | None = None) -> list[dict]:
    """The closest notes above the score floor, best first. A word from a note's title counts extra, as in a hybrid search."""
    saved = _note_vectors() if vector is not None else None
    if saved is not None and vector.shape == (saved.shape[1],):
        return _search_neural(question, vector, saved, k)
    notes, vocabulary, idf, matrix = _index()
    asked = _asked_words(question)
    vector = np.zeros(len(vocabulary))
    for term, n in _terms(" ".join(asked)).items():
        if term in vocabulary:
            vector[vocabulary[term]] = (1 + np.log(n)) * idf[vocabulary[term]]
    length = np.linalg.norm(vector)
    if length == 0:
        return []
    scores = matrix @ (vector / length)
    for row, (title, text) in enumerate(notes):
        if set(asked) & set(_WORD.findall(title.lower())):
            scores[row] += TITLE_BONUS
        elif set(asked) & set(_WORD.findall(text.lower())):
            scores[row] += WORD_BONUS  # a rare exact word, such as CKD, is lost in a long note's vector
    best = [i for i in np.argsort(scores)[::-1][:k] if scores[i] >= MIN_SCORE]
    hits = [i for i in best if scores[i] >= STRONG_SCORE or set(asked) & set(_WORD.findall(f"{notes[i][0]} {notes[i][1]}".lower()))]
    return [{"title": notes[i][0], "text": notes[i][1], "score": round(float(min(scores[i], 1.0)), 3)} for i in hits]
