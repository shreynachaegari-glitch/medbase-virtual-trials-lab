"""Where the blind held-out test held up and where it missed, read from results/validation.json.

Added after the blind run, and it changes no prediction: it looks up the published record for a drug so a
reader sees it beside a simulated result. It is a description of past errors, not a correction.
"""
from __future__ import annotations

import json
import re

from .. import drugs, trial, trials

_TOKENS = {"semaglutide": "semaglutide", "empagliflozin": "empa", "sitagliptin": "sitagliptin", "metformin": "metformin"}
HOLDS_MAE = 0.25  # the pre-registered V3 marks, applied per trial
HOLDS_WITHIN = 0.70
MISSES_SHOWN = 5
NEAR_DOSE_RATIO = 1.5
NOTE = "From the blind test on real trials. It describes past error and does not adjust this simulated number."
NONE = {"available": False, "sentence": "No held-out record exists for this regimen."}


def validation_sentence(status: dict) -> str:
    """One written account of the blind test, so nothing has to read the raw pass flags."""
    if not status.get("available"):
        return "Held-out validation has not been run, so treat this as unvalidated."
    word = lambda ok: "passed" if ok else "FAILED"  # noqa: E731
    blind = "" if status.get("blind") else " These held-out trials are no longer blind."
    rival = "beat" if status.get("beats_null") else "did not beat"
    return (f"Validation on {status['n_contrasts']} held-out real results: mean HbA1c error {status['mae']} points. "
            f"Accuracy check {word(status['V3_pass'])}, interval coverage {word(status['V4_pass'])}, kidney check {word(status['V5_pass'])}, and it {rival} a simple rival with no physiology.{blind}")


def _report() -> dict | None:
    path = trial.RESULTS / "validation.json"
    return json.loads(path.read_text()) if path.exists() else None


def rows_for(drug: str) -> list[dict]:
    """Contrasts whose tested arm contains the drug. 'Sitagliptin Placebo' means no sitagliptin."""
    report = _report()
    if report is None or drug not in _TOKENS:
        return []
    return [r for r in report["contrasts"] if _TOKENS[drug] in re.sub(r"\b\w+ placebo\b", "", r["arm"].lower())]


def _summarise(name: str, rows: list[dict]) -> dict:
    errors = [r["error"] for r in rows]
    mae = sum(abs(e) for e in errors) / len(errors)
    within = sum(r["within_0_30"] for r in rows) / len(rows)
    mean_error = sum(errors) / len(errors)
    return {"trial": name, "weeks": trials.spec_by_name(rows[0]["trial"]).weeks, "results": len(rows), "mae": round(mae, 2), "mean_error": round(mean_error, 2),
            "held_up": bool(mae <= HOLDS_MAE and within >= HOLDS_WITHIN)}


def _phrase(t: dict) -> str:
    verdict = "held up" if t["held_up"] else "missed"
    head = f"{t['trial']} ({t['weeks']} weeks, {t['results']} results)"
    if t["mean_error"] == 0:
        return f"{head} had no net bias: {verdict}"
    direction = "over-predicted" if t["mean_error"] < 0 else "under-predicted"
    return f"{head} {direction} the HbA1c benefit by {abs(t['mean_error']):.2f} on average: {verdict}"


def for_regimen(regimen: drugs.Regimen, weeks: int) -> dict:
    """The record for the first drug in a regimen, closest trial length first."""
    if not regimen.doses:
        return dict(NONE)
    drug = regimen.doses[0].drug
    rows = rows_for(drug)
    if not rows:
        return dict(NONE)
    names = sorted({r["trial_base"] for r in rows})
    by_trial = [_summarise(n, [r for r in rows if r["trial_base"] == n]) for n in names]
    by_trial.sort(key=lambda t: (abs(t["weeks"] - weeks), t["trial"]))
    return {"available": True, "drug": drug, "closest": by_trial[0], "by_trial": by_trial, "note": NOTE,
            "sentence": f"Blind test record for {drug}: " + "; ".join(_phrase(t) for t in by_trial) + "."}


def for_dose(drug: str, mg_per_day: float) -> dict:
    """The blind result at the tested dose nearest this one, since an average across doses can hide a miss at this one."""
    candidates = []
    for row in rows_for(drug):
        arm = re.sub(r"\b\w+ placebo\b", "", row["arm"], flags=re.I).strip(" +")
        dose = re.search(r"(\d+(?:\.\d+)?)\s*mg", arm, re.I)
        if "+" in arm or dose is None:
            continue  # a combination says nothing about this drug's dose alone
        per_day = float(dose.group(1)) * (2 if re.search(r"b\.?i\.?d", arm, re.I) else 1)
        ratio = max(per_day, mg_per_day) / min(per_day, mg_per_day)
        if ratio <= NEAR_DOSE_RATIO:
            candidates.append((round(ratio, 3), -abs(row["error"]), row))  # at equal distance, show the larger miss
    if not candidates:
        return {"tested": False, "sentence": f"No held-out trial tested a dose of {drug} near this one, so the blind test says nothing direct about it."}
    row = min(candidates, key=lambda c: c[:2])[2]
    direction = "over-predicted" if row["error"] < 0 else "under-predicted"
    weeks = trials.spec_by_name(row["trial"]).weeks
    return {"tested": True, "arm": row["arm"], "trial": row["trial"], "weeks": weeks, "predicted": row["predicted"], "observed": row["observed"], "error": row["error"],
            "sentence": f"At the nearest dose tested blind ({row['arm']}, {row['trial']}, {weeks} weeks) the simulator predicted {row['predicted']} and the trial observed {row['observed']}, so it {direction} the HbA1c benefit by {abs(row['error']):.2f}."}


def for_design(design: trial.Design) -> dict[str, dict]:
    return {arm.name: for_regimen(arm.regimen, design.weeks) for arm in design.arms[1:]}


def overview() -> dict:
    """Plain record of the blind run: every check, the largest misses, and which trials held up."""
    report = _report()
    if report is None:
        return {"available": False}
    s = report["score"]
    marks = report["pass_marks"]
    low, high = s["model_minus_null_ci95"]
    gap = "includes zero" if low <= 0 <= high else "lies below zero" if high < 0 else "lies above zero"
    checks = [{"check": "V3 accuracy", "passed": s["V3_pass"], "detail": f"mean error {s['mae']} (limit {marks['mae_max']}); {s['within_0_30']:.0%} within 0.30 (needs {marks['within_0_30_min']:.0%})"},
              {"check": "V4 interval coverage", "passed": s["V4_pass"], "detail": f"{s['coverage_95pi']:.0%} inside the 95% interval (needs {marks['coverage_95_min']:.0%}); only {s['coverage_80pi']:.0%} inside the 80% interval"},
              {"check": "V5 kidney effect", "passed": s["V5_pass"], "detail": f"each stratum within {marks['renal_tolerance']}" if s["V5_each_within"] else f"not every stratum was within {marks['renal_tolerance']}"},
              {"check": "V6 beat a rival with no physiology", "passed": s["beats_null"], "detail": f"mean error {s['mae']} against the rival's {s['null_mae']}; difference 95% interval {low} to {high} {gap}"}]
    worst = sorted(report["contrasts"], key=lambda r: -abs(r["error"]))[:MISSES_SHOWN]
    names = sorted({r["trial_base"] for r in report["contrasts"]})
    by_trial = [_summarise(n, [r for r in report["contrasts"] if r["trial_base"] == n]) for n in names]
    closer = sum(abs(r["error"]) < abs(r["null_error"]) for r in report["contrasts"])
    return {"available": True, "blind": report["blind"], "error_unit": "HbA1c percentage points", "checks": checks,
            "contrasts_total": len(report["contrasts"]), "contrasts_model_closer_than_rival": closer,
            "largest_misses": [{"trial": r["trial"], "arm": r["arm"], "compared_with": r["reference"], "predicted": r["predicted"], "observed": r["observed"], "error": r["error"]} for r in worst],
            "held_up_in": [t["trial"] for t in by_trial if t["held_up"]], "missed_in": [t["trial"] for t in by_trial if not t["held_up"]], "by_trial": by_trial}
