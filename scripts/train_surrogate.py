"""Trains a small neural network on simulator runs, for instant what-if sliders that load with the page.

It learns the simulator, not reality: its accuracy is measured against simulator runs it never saw, and
every output stays labelled as an approximation of the simulator. Cohort-level only, by design: inputs
describe a study population, never one person's labs.

Run after calibration: python scripts/train_surrogate.py --runs 2400
"""
import argparse
import json
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from sklearn.neural_network import MLPRegressor

from medlab import calibrate, drugs, labels, params, population as pop, simulate as sim

DRUGS = tuple(labels.DOSE_RANGE)
COHORT_N = 200
FEATURES = ("log_dose_position", "weeks", "target_a1c", "egfr_low", "egfr_high")
_LABS = None
_DRAWS = None
_NAMES = None


def _init() -> None:
    global _LABS, _DRAWS, _NAMES
    _LABS = pop.load_labs()
    _NAMES, _DRAWS, _ = calibrate.load_posterior()


def _dose_position(drug: str, mg: float) -> float:
    low, high = labels.DOSE_RANGE[drug]
    return (np.log(mg) - np.log(low)) / (np.log(high) - np.log(low))


def one_run(seed: int) -> list[float] | None:
    rng = np.random.default_rng(seed)
    drug = DRUGS[seed % len(DRUGS)]
    low, high = labels.DOSE_RANGE[drug]
    mg = float(np.exp(rng.uniform(np.log(low), np.log(high))))
    weeks = int(rng.integers(8, 105))
    target = float(rng.uniform(7.3, 9.5))
    egfr_low, egfr_high = [(30.0, 60.0), (60.0, 90.0), (90.0, 400.0), (45.0, 400.0)][rng.integers(4)]
    if drug == "metformin" and egfr_low < 45:
        egfr_low = 45.0
    theta = params.with_theta(dict(zip(_NAMES, _DRAWS[seed % len(_DRAWS)])))
    criteria = pop.Criteria(a1c_range=(7.0, 10.5), egfr_range=(egfr_low, egfr_high), target_a1c=target)
    try:
        cohort, report = pop.enroll(_LABS, criteria, COHORT_N, params.defaults(), seed)
    except ValueError:
        return None
    regimen = drugs.Regimen("d", (drugs.standard_dose(drug, mg),))
    change = lambda t, s: float((s[-1] - s[0]).mean())  # noqa: E731
    active = sim.simulate(cohort, regimen, weeks, theta)
    control = sim.simulate(cohort, drugs.Regimen("p"), weeks, theta)
    return [DRUGS.index(drug), _dose_position(drug, mg), weeks, report["matched"]["a1c"], egfr_low, min(egfr_high, 150.0),
            change(active, active.a1c) - change(control, control.a1c), change(active, active.weight) - change(control, control.weight)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=2400)
    parser.add_argument("--processes", type=int, default=16)
    args = parser.parse_args()
    with Pool(args.processes, initializer=_init) as pool:
        rows = [r for r in pool.imap_unordered(one_run, range(args.runs), chunksize=8) if r is not None]
    data = np.array(rows)
    onehot = np.eye(len(DRUGS))[data[:, 0].astype(int)]
    x = np.hstack([onehot, data[:, 1:6]])
    y = data[:, 6:8]
    mean_x, std_x, mean_y, std_y = x.mean(0), x.std(0) + 1e-9, y.mean(0), y.std(0) + 1e-9
    order = np.random.default_rng(0).permutation(len(x))
    split = int(0.8 * len(x))
    train, test = order[:split], order[split:]
    net = MLPRegressor(hidden_layer_sizes=(48, 48), activation="tanh", max_iter=4000, early_stopping=True, random_state=0)
    net.fit((x[train] - mean_x) / std_x, (y[train] - mean_y) / std_y)
    predicted = net.predict((x[test] - mean_x) / std_x) * std_y + mean_y
    errors = predicted - y[test]
    r2 = 1 - (errors**2).sum(0) / ((y[test] - y[test].mean(0)) ** 2).sum(0)
    report = {"runs_used": len(x), "test_runs": len(test), "a1c_mae": round(float(np.abs(errors[:, 0]).mean()), 3), "a1c_r2": round(float(r2[0]), 3), "weight_mae_kg": round(float(np.abs(errors[:, 1]).mean()), 3), "weight_r2": round(float(r2[1]), 3)}
    payload = {
        "drugs": list(DRUGS), "dose_ranges": {d: labels.DOSE_RANGE[d] for d in DRUGS}, "features": list(DRUGS) + list(FEATURES),
        "mean_x": mean_x.round(5).tolist(), "std_x": std_x.round(5).tolist(), "mean_y": mean_y.round(5).tolist(), "std_y": std_y.round(5).tolist(),
        "weights": [w.round(5).tolist() for w in net.coefs_], "biases": [b.round(5).tolist() for b in net.intercepts_], "activation": "tanh",
        "outputs": ["hba1c_vs_placebo", "weight_kg_vs_placebo"], "evaluation": report,
        "ranges": {"weeks": [8, 104], "target_a1c": [7.3, 9.5], "egfr_bands": [[30, 60], [60, 90], [90, 150], [45, 150]]},
        "notice": "A fast neural approximation of the simulator, tested only against simulator runs it did not train on. It is not a separate source of evidence.",
    }
    out = Path("web/public/surrogate.json")
    out.write_text(json.dumps(payload, separators=(",", ":")))
    Path("results/surrogate_eval.json").write_text(json.dumps(report, indent=1))
    print(report, out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
