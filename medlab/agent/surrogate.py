"""Runs the trained neural surrogate of the simulator with numpy alone, so it also works in the browser.

It learned the simulator, not reality, and it only proposes. Every number a person sees is then
computed by the simulator. Trained and tested by scripts/train_surrogate.py.
"""
from __future__ import annotations

import json
import time
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_PATH = Path(__file__).with_name("surrogate_model.json")
GRID_POINTS = 400
EGFR_BAND = (45.0, 150.0)  # the broad band in its training data; the designer's own cohort is checked by the simulator


@lru_cache(maxsize=1)
def _model() -> dict | None:
    return json.loads(MODEL_PATH.read_text()) if MODEL_PATH.exists() else None


def _forward(net: dict, x: np.ndarray) -> np.ndarray:
    """scikit-learn's MLPRegressor forward pass: tanh hidden layers, linear output, standardised both ends."""
    h = (x - np.array(net["mean_x"])) / np.array(net["std_x"])
    layers = list(zip(net["weights"], net["biases"]))
    for weights, bias in layers[:-1]:
        h = np.tanh(h @ np.array(weights) + np.array(bias))
    weights, bias = layers[-1]
    return (h @ np.array(weights) + np.array(bias)) * np.array(net["std_y"]) + np.array(net["mean_y"])


def propose(drug: str, target_effect: float, weeks: int, baseline_a1c: float) -> dict | None:
    """The lowest dose predicted to reach the target, or None when the question is outside its training range."""
    net = _model()
    if net is None or drug not in net["drugs"]:
        return None
    if not net["ranges"]["weeks"][0] <= weeks <= net["ranges"]["weeks"][1]:
        return None
    started = time.perf_counter()
    low, high = net["dose_ranges"][drug]
    positions = np.linspace(0.0, 1.0, GRID_POINTS)
    onehot = np.tile(np.eye(len(net["drugs"]))[net["drugs"].index(drug)], (GRID_POINTS, 1))
    a1c = float(np.clip(baseline_a1c, *net["ranges"]["target_a1c"]))
    rest = np.column_stack([positions, np.full(GRID_POINTS, weeks), np.full(GRID_POINTS, a1c), np.full(GRID_POINTS, EGFR_BAND[0]), np.full(GRID_POINTS, EGFR_BAND[1])])
    predicted = _forward(net, np.hstack([onehot, rest]))[:, net["outputs"].index("hba1c_vs_placebo")]
    meets = np.flatnonzero(predicted <= -abs(target_effect))
    reachable = bool(meets.size)
    index = int(meets[0]) if reachable else GRID_POINTS - 1
    dose = float(np.exp(np.log(low) + positions[index] * (np.log(high) - np.log(low))))
    return {"used": True, "reachable": reachable, "proposed_mg": high if index == GRID_POINTS - 1 else float(f"{dose:.3g}"), "predicted_effect": round(float(predicted[index]), 3),
            "screened": GRID_POINTS, "milliseconds": round((time.perf_counter() - started) * 1000, 1), "test_mae_vs_simulator": net["evaluation"]["a1c_mae"], "test_r2_vs_simulator": net["evaluation"]["a1c_r2"]}
