"""Sealed validation in two separate steps, so predictions exist before any outcome is read.

  python -m medlab.validate freeze   predict, check the data parses without showing it, hash the code
  python -m medlab.validate unseal   verify the hash, then read outcomes and score once

If code, spec or posterior change after freezing, unsealing refuses. Re-freezing after an opening is
recorded and the report says the trials are no longer blind.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
from scipy import stats

from . import calibrate, params, population as pop, registry, simulate as sim, trials
from .ioutil import write_atomic

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "results"
UNSEAL_LOG = RESULTS / "unseal_log.json"
PREDICTIONS = RESULTS / "predictions.json"
PREDICTION_N = 300
N_DRAWS = 120
BASE_SEED = 777
_Z = {50: 0.6745, 80: 1.2816, 95: 1.96}


def code_hash() -> str:
    """Covers everything that could change a held-out prediction or a pass mark."""
    digest = hashlib.sha256()
    for path in sorted((ROOT / "medlab").rglob("*.py")):
        # The assistant and its web layers cannot change a prediction, and they keep evolving after a freeze.
        if "__pycache__" not in str(path) and path.parent.name != "agent" and path.name not in {"api.py", "service.py", "browser.py", "designer.py", "safety.py", "labels.py"}:
            digest.update(path.read_bytes())
    digest.update(calibrate.POSTERIOR.read_bytes())
    return digest.hexdigest()


def _key(c: trials.Contrast) -> str:
    return f"{c.trial}|{c.arm}|{c.reference}"


def predict_contrasts(names: list[str], draws: np.ndarray, n: int = PREDICTION_N, n_draws: int = N_DRAWS, seed: int = BASE_SEED) -> dict:
    """Prediction per contrast, per posterior draw, with the real participant pool resampled each time."""
    labs = pop.load_labs()
    base = params.defaults()
    rng = np.random.default_rng(seed)
    chosen = rng.choice(len(draws), size=min(n_draws, len(draws)), replace=False)
    out: dict[str, list[float]] = {}
    reports: dict[str, dict] = {}
    specs = sorted({c.trial for c in trials.HELD_OUT_CONTRASTS})
    change = lambda t: float((t.a1c[-1] - t.a1c[0]).mean())  # noqa: E731
    for d, draw in enumerate(chosen):
        p = params.with_theta(dict(zip(names, draws[draw])))
        for i, name in enumerate(specs):
            spec = trials.spec_by_name(name)
            cohort, report = pop.enroll(labs, spec.criteria, n, base, seed + 1000 * d + i, bootstrap_pool=True)
            reports.setdefault(name, pop.enroll(labs, spec.criteria, n, base, seed + i)[1])
            arms = {arm: sim.simulate(cohort, regimen, spec.weeks, p) for arm, regimen in spec.arms.items()}
            for c in (c for c in trials.HELD_OUT_CONTRASTS if c.trial == name):
                out.setdefault(_key(c), []).append(change(arms[c.arm]) - change(arms[c.reference]))
    return {"predictions": out, "reports": reports}


def assumption_sensitivity(names: list[str], draws: np.ndarray) -> dict:
    """How far fixed assumptions move each contrast, without refitting. Uses no outcome."""
    median = dict(zip(names, np.median(draws, axis=0)))
    labs = pop.load_labs()
    change = lambda t: float((t.a1c[-1] - t.a1c[0]).mean())  # noqa: E731
    variants = {"rtg0=200": {"rtg0": 200.0}, "si_weight_power=2.5": {"si_weight_power": 2.5}, "sita_ed50=50": {"sita_ed50": 50.0}, "hgp_fpg_slope=0.3": {"hgp_fpg_slope": 0.3}}

    def run(extra: dict) -> dict[str, float]:
        p = {**params.with_theta(median), **extra}
        result = {}
        for name in sorted({c.trial for c in trials.HELD_OUT_CONTRASTS}):
            spec = trials.spec_by_name(name)
            cohort, _ = pop.enroll(labs, spec.criteria, PREDICTION_N, {**params.defaults(), **extra}, BASE_SEED)
            arms = {arm: sim.simulate(cohort, regimen, spec.weeks, p) for arm, regimen in spec.arms.items()}
            for c in (c for c in trials.HELD_OUT_CONTRASTS if c.trial == name):
                result[_key(c)] = change(arms[c.arm]) - change(arms[c.reference])
        return result

    baseline = run({})
    return {label: {"largest_shift": round(max(abs(v - baseline[k]) for k, v in run(extra).items()), 3)} for label, extra in variants.items()}


def renal_precheck(names: list[str], draws: np.ndarray) -> dict:
    """Unsealed comparison of urinary glucose by kidney function, for context on the kidney check."""
    p = params.with_theta(dict(zip(names, np.median(draws, axis=0))))
    labs = pop.load_labs()
    reg = trials.Regimen("e", (trials.Dose("empagliflozin", 25),))
    out = {}
    for label, band in (("normal", (90, 400)), ("mild", (60, 90)), ("moderate", (30, 60))):
        cohort, _ = pop.enroll(labs, pop.Criteria(egfr_range=band), 300, params.defaults(), 3)
        t = sim.simulate(cohort, reg, 4, p)
        out[label] = float((t.uge_g_day[-1] - t.uge_g_day[0]).mean())
    return {"model_ratio_mild": round(out["mild"] / out["normal"], 2), "model_ratio_moderate": round(out["moderate"] / out["normal"], 2),
            "reference": "Sarashina 2014 reported about 0.83 and 0.77 after one dose in Japanese patients (from a search summary, not read in full)."}


def observed_contrast(c: trials.Contrast) -> tuple[float, float]:
    """(difference, its SE) from the registry. Reads sealed data; call only inside freeze's parse check or unseal."""
    spec = trials.spec_by_name(c.trial)
    outcome = next(o for o in registry.read_outcomes(spec.nct, unseal=True) if o.title == c.outcome_title and {c.arm, c.reference} <= {a.arm for a in o.arms})
    a = next(x for x in outcome.arms if x.arm == c.arm)
    b = next(x for x in outcome.arms if x.arm == c.reference)
    return a.value - b.value, math.hypot(calibrate.arm_se(a, outcome.dispersion), calibrate.arm_se(b, outcome.dispersion))


def freeze() -> dict:
    names, draws, posterior_hash = calibrate.load_posterior()
    meta = json.loads(calibrate.POSTERIOR.read_text())
    predicted = predict_contrasts(names, draws)
    for c in trials.HELD_OUT_CONTRASTS:  # parse check: a crash after opening would force a second opening
        value, se = observed_contrast(c)
        if not (math.isfinite(value) and math.isfinite(se) and se > 0):
            raise RuntimeError(f"cannot read a usable result for {_key(c)}")
    frozen = {
        "at": time.strftime("%Y-%m-%d %H:%M:%S"), "code_hash": code_hash(), "posterior_sha256": posterior_hash,
        "converged": meta.get("converged"), "max_split_rhat": meta.get("max_split_rhat"), "length_over_tau": meta.get("length_over_tau"),
        "structural_sd": trials.STRUCTURAL_SD, "predictions": predicted["predictions"], "populations": predicted["reports"],
        "assumption_sensitivity": assumption_sensitivity(names, draws), "renal_precheck": renal_precheck(names, draws),
    }
    write_atomic(PREDICTIONS, json.dumps(frozen, indent=1))
    print(f"frozen {len(frozen['predictions'])} contrasts; converged={frozen['converged']}; code {frozen['code_hash'][:12]}")
    return frozen


def null_predictions() -> dict[str, float]:
    """A rival with no physiology: carry training-trial effects forward by drug and dose, added for combinations."""
    t = {(x.trial, x.arm, x.endpoint, x.reference): x.observed for x in calibrate.train_targets()}
    placebo_mono = t[("EMPA-REG MONO", "Placebo", "hba1c", None)]
    sita = t[("EMPA-REG MONO", "Sitagliptin 100 mg", "hba1c", None)] - placebo_mono
    met_2g = sita + t[("DURATION-4", "Metformin", "hba1c", "Sitagliptin")]
    sema = (0.0, t[("SUSTAIN 1", "Semaglutide 0.5 mg", "hba1c", None)] - t[("SUSTAIN 1", "Placebo", "hba1c", None)], t[("SUSTAIN 1", "Semaglutide 1.0 mg", "hba1c", None)] - t[("SUSTAIN 1", "Placebo", "hba1c", None)])

    def effect(regimen) -> float:
        total = 0.0
        for dose in regimen.doses:
            if dose.drug == "semaglutide":
                total += float(np.interp(dose.mg, (0.0, 0.5, 1.0), sema))
            elif dose.drug == "empagliflozin":
                total += float(np.interp(dose.mg, (10.0, 25.0), (t[("EMPA-REG MONO", "Empagliflozin10 mg", "hba1c", None)] - placebo_mono, t[("EMPA-REG MONO", "Empagliflozin 25 mg", "hba1c", None)] - placebo_mono)))
            elif dose.drug == "sitagliptin":
                total += sita
            elif dose.drug == "metformin":
                total += met_2g * dose.mg / 2000.0
        return total

    out = {}
    for c in trials.HELD_OUT_CONTRASTS:
        spec = trials.spec_by_name(c.trial)
        out[_key(c)] = effect(spec.arms[c.arm]) - effect(spec.arms[c.reference])
    return out


def score(rows: list[dict]) -> dict:
    errors = np.array([r["error"] for r in rows])
    within = float(np.mean(np.abs(errors) <= 0.30))
    coverage = {level: float(np.mean([abs(r["error"]) <= _Z[level] * r["sd"] for r in rows])) for level in _Z}
    mae = float(np.mean(np.abs(errors)))
    renal = {r["arm"] + " | " + r["trial"]: r for r in rows if r["group"] == "renal"}
    mild = renal["Empa 25mg | EMPA-REG RENAL mild"]
    moderate = renal["Empa 25mg | EMPA-REG RENAL moderate"]
    v5_order = mild["predicted"] < moderate["predicted"] and mild["observed"] < moderate["observed"]
    v5_each = abs(mild["error"]) <= trials.RENAL_TOLERANCE and abs(moderate["error"]) <= trials.RENAL_TOLERANCE
    null_errors = np.array([r["null_error"] for r in rows])
    trial_names = sorted({r["trial_base"] for r in rows})
    rng = np.random.default_rng(BASE_SEED)
    differences = []
    for _ in range(4000):  # by-trial cluster bootstrap: contrasts from one trial are not independent
        picks = rng.choice(trial_names, len(trial_names))
        chosen = np.concatenate([[i for i, r in enumerate(rows) if r["trial_base"] == name] for name in picks]).astype(int)
        differences.append(np.mean(np.abs(errors[chosen])) - np.mean(np.abs(null_errors[chosen])))
    low, high = np.percentile(differences, [2.5, 97.5])
    interval_score = float(np.mean([2 * 1.96 * r["sd"] + (2 / 0.05) * max(abs(r["error"]) - 1.96 * r["sd"], 0) for r in rows]))
    return {
        "n_contrasts": len(rows), "mae": round(mae, 3), "bias": round(float(errors.mean()), 3),
        "within_0_30": round(within, 3), "coverage_95pi": round(coverage[95], 3), "coverage_80pi": round(coverage[80], 3), "coverage_50pi": round(coverage[50], 3),
        "interval_score_95": round(interval_score, 3), "mean_pi95_width": round(float(np.mean([2 * 1.96 * r["sd"] for r in rows])), 3),
        "V3_pass": bool(mae <= trials.PASS_MAE and within >= trials.PASS_WITHIN_030_FRACTION),
        "V4_pass": bool(coverage[95] >= trials.PASS_COVERAGE),
        "V5_pass": bool(v5_order and v5_each), "V5_order_correct": bool(v5_order), "V5_each_within": bool(v5_each),
        "null_mae": round(float(np.mean(np.abs(null_errors))), 3), "model_minus_null_mae": round(mae - float(np.mean(np.abs(null_errors))), 3),
        "model_minus_null_ci95": [round(float(low), 3), round(float(high), 3)], "beats_null": bool(high < 0),
    }


def _record_opening(code: str) -> dict:
    RESULTS.mkdir(exist_ok=True)
    log = json.loads(UNSEAL_LOG.read_text()) if UNSEAL_LOG.exists() else {"openings": []}
    log["openings"].append({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "code_hash": code})
    log["blind"] = len({o["code_hash"] for o in log["openings"]}) == 1
    write_atomic(UNSEAL_LOG, json.dumps(log, indent=1))
    return log


def unseal() -> dict:
    frozen = json.loads(PREDICTIONS.read_text())
    current = code_hash()
    if frozen["code_hash"] != current:
        raise SystemExit("Refusing to unseal: code or posterior changed since freezing. Freeze again; if already opened, the report will say so.")
    log = _record_opening(current)
    null = null_predictions()
    rows = []
    for c in trials.HELD_OUT_CONTRASTS:
        values = np.array(frozen["predictions"][_key(c)])
        observed, se = observed_contrast(c)
        mean = float(values.mean())
        sd = math.sqrt(float(values.var()) + trials.STRUCTURAL_SD**2 + se**2)
        rows.append({
            "trial": c.trial, "trial_base": c.trial.replace(" mild", "").replace(" moderate", ""), "arm": c.arm, "reference": c.reference, "group": c.group,
            "predicted": round(mean, 3), "predicted_sd_model": round(float(values.std()), 3), "sd": round(sd, 3),
            "pi95": [round(mean - 1.96 * sd, 3), round(mean + 1.96 * sd, 3)],
            "observed": round(observed, 3), "observed_se": round(se, 3), "error": round(mean - observed, 3),
            "covered": bool(abs(mean - observed) <= 1.96 * sd), "within_0_30": bool(abs(mean - observed) <= 0.30),
            "null_predicted": round(null[_key(c)], 3), "null_error": round(null[_key(c)] - observed, 3),
            "thin_pool": bool(frozen["populations"][c.trial]["thin_pool"]),
        })
    by_trial = {}
    for name in sorted({r["trial"] for r in rows}):
        group = [r for r in rows if r["trial"] == name]
        by_trial[name] = {"contrasts": len(group), "mae": round(float(np.mean([abs(r["error"]) for r in group])), 3), "null_mae": round(float(np.mean([abs(r["null_error"]) for r in group])), 3), "thin_pool": group[0]["thin_pool"]}
    report = {
        "blind": log["blind"], "openings": len(log["openings"]), "posterior_sha256": frozen["posterior_sha256"], "code_hash": current, "frozen_at": frozen["at"],
        "converged": frozen["converged"], "max_split_rhat": frozen["max_split_rhat"], "length_over_tau": frozen["length_over_tau"],
        "pass_marks": {"mae_max": trials.PASS_MAE, "within_0_30_min": trials.PASS_WITHIN_030_FRACTION, "coverage_95_min": trials.PASS_COVERAGE, "renal_tolerance": trials.RENAL_TOLERANCE},
        "score": score(rows), "by_trial": by_trial, "contrasts": rows, "populations": frozen["populations"],
        "assumption_sensitivity": frozen["assumption_sensitivity"], "renal_precheck": frozen["renal_precheck"],
        "structural_sd": frozen["structural_sd"], "n_draws": len(next(iter(frozen["predictions"].values()))), "prediction_n": PREDICTION_N,
        "reading_note": "V5's ordering is largely built into the structure, so only its size test carries information. These are famous trials, so the seal is mechanical: its author knew the literature in general.",
    }
    write_atomic(RESULTS / "validation.json", json.dumps(report, indent=1))
    return report


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "freeze":
        freeze()
    elif command == "unseal":
        result = unseal()
        print(json.dumps(result["score"], indent=1))
        for row in result["contrasts"]:
            flag = "ok  " if row["within_0_30"] else "MISS"
            print(f"{flag} {row['trial']:34s} {row['arm'][:44]:44s} pred {row['predicted']:+.2f} null {row['null_predicted']:+.2f} obs {row['observed']:+.2f} err {row['error']:+.2f}")
    else:
        raise SystemExit("usage: python -m medlab.validate freeze | unseal")
