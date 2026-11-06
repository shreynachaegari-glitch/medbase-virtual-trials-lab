"""Trains the assistant's intent model, checks it on phrases it never saw, and saves plain numbers.

Runs anywhere and ships as a small JSON file. Inference needs only numpy, so it also works in a browser.
"""
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

from medlab.agent import intent
from medlab.agent.intent_data import HOLD_OUT, TRAIN


def flatten(data: dict[str, list[str]]) -> tuple[list[str], list[str]]:
    return [p for ps in data.values() for p in ps], [k for k, ps in data.items() for _ in ps]


x, y = flatten(TRAIN)
vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), lowercase=True, sublinear_tf=True)
features = vectorizer.fit_transform(x)
model = LogisticRegression(C=30.0, max_iter=2000, class_weight="balanced").fit(features, y)

payload = {
    "classes": list(model.classes_), "vocabulary": {k: int(v) for k, v in vectorizer.vocabulary_.items()},
    "idf": [round(float(v), 5) for v in vectorizer.idf_],
    "coef": [[round(float(v), 4) for v in row] for row in model.coef_], "intercept": [round(float(v), 4) for v in model.intercept_],
}
intent.MODEL_PATH.write_text(json.dumps(payload, separators=(",", ":")))
intent.load.cache_clear()

hx, hy = flatten(HOLD_OUT)
sk_probabilities = model.predict_proba(vectorizer.transform(hx))
ours = [intent.predict(p) for p in hx]
matches = float(np.max(np.abs(sk_probabilities - np.array([o["probabilities"] for o in ours]))))
correct = [o["intent"] == t for o, t in zip(ours, hy)]
print(f"train phrases {len(x)}, held-out phrases {len(hx)}")
print(f"held-out accuracy {np.mean(correct):.3f}; largest gap vs scikit-learn {matches:.2e}; model file {intent.MODEL_PATH.stat().st_size // 1024} KB")
for phrase, truth, output, ok in zip(hx, hy, ours, correct):
    if not ok:
        print(f"  MISS {phrase!r}: expected {truth}, got {output['intent']} ({output['confidence']:.2f})")
Path("results/intent_eval.json").write_text(json.dumps({"train_phrases": len(x), "held_out_phrases": len(hx), "held_out_accuracy": round(float(np.mean(correct)), 3)}, indent=1))
