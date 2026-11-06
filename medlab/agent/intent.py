"""A small trained model that recognises conversational intent, such as a greeting or a status question.

Character n-gram TF-IDF with logistic regression, so typos still match. It only chooses which fixed or
computed reply to give, and cannot write text or numbers, so it cannot invent a medical claim.
Trained by scripts/train_intent.py. Inference needs only numpy and runs in a browser.
"""
from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_PATH = Path(__file__).with_name("intent_model.json")
CONFIDENCE = 0.5
_NGRAMS = (2, 3, 4)


@lru_cache(maxsize=1)
def load() -> dict:
    model = json.loads(MODEL_PATH.read_text())
    model["coef"] = np.array(model["coef"])
    model["intercept"] = np.array(model["intercept"])
    model["idf"] = np.array(model["idf"])
    return model


def _char_wb_counts(text: str) -> dict[str, int]:
    """The same features as scikit-learn's char_wb analyzer, without needing scikit-learn."""
    counts: dict[str, int] = {}
    for word in re.sub(r"\s+", " ", text.lower()).split():
        padded = f" {word} "
        for n in _NGRAMS:
            offset = 0
            ngram = padded[offset:offset + n]
            counts[ngram] = counts.get(ngram, 0) + 1
            while offset + n < len(padded):
                offset += 1
                ngram = padded[offset:offset + n]
                counts[ngram] = counts.get(ngram, 0) + 1
            if offset == 0:  # the word was shorter than n
                break
    return counts


def predict(text: str) -> dict:
    model = load()
    vector = np.zeros(len(model["idf"]))
    for gram, count in _char_wb_counts(text).items():
        index = model["vocabulary"].get(gram)
        if index is not None:
            vector[index] = (1 + math.log(count)) * model["idf"][index]
    norm = np.linalg.norm(vector)
    if norm:
        vector /= norm
    scores = model["coef"] @ vector + model["intercept"]
    probabilities = np.exp(scores - scores.max())
    probabilities /= probabilities.sum()
    best = int(np.argmax(probabilities))
    return {"intent": model["classes"][best], "confidence": float(probabilities[best]), "probabilities": probabilities.tolist()}
