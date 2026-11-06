"""Virtual trial engine: build arms, simulate, analyse like a real trial, propagate uncertainty.

Effects from calibration already include the adherence of the real trials they came from, so
`adherence=1.0` means "as in those trials". Lower values are a what-if, not a measured quantity.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import stats
from sklearn.tree import DecisionTreeRegressor, _tree

from . import calibrate, drugs, labels, params, population as pop, simulate as sim

RESULTS = Path(__file__).resolve().parent.parent / "results"
ENDPOINTS = ("hba1c", "fpg", "weight")
MAX_N_PER_ARM = 500
MAX_WEEKS = 156
MAX_ARMS = 5
MIN_WEEKS = 4
SIM_POOL = 600  # minimum patients simulated per arm; each replicate draws disjoint arms from this pool


def _pool_size(n_per_arm: int) -> int:
    return max(SIM_POOL, 2 * n_per_arm + 50)


def _split(rng: np.random.Generator, pool: int, n: int) -> tuple[np.ndarray, np.ndarray]:
    """Disjoint patient samples for two arms. A patient in both arms would understate the variance."""
    order = rng.permutation(pool)
    return order[:n], order[n:2 * n]


@lru_cache(maxsize=1)
def labs():
    return pop.load_labs()


@dataclass(frozen=True)
class Arm:
    name: str
    regimen: drugs.Regimen


@dataclass(frozen=True)
class Design:
    arms: tuple[Arm, ...]  # the first arm is the control
    weeks: int = 26
    n_per_arm: int = 200
    criteria: pop.Criteria = field(default_factory=pop.Criteria)
    dropout: float = 0.0  # a what-if: calibration and validation ran without added dropout
    adherence: float = 1.0
    alpha: float = 0.05
    seed: int = 1
    posterior_draws: int = 16
    replicates: int = 40

    def __post_init__(self) -> None:
        if len(self.arms) < 2:
            raise ValueError("a trial needs a control arm and at least one other arm")
        if len(self.arms) > MAX_ARMS:
            raise ValueError(f"a trial can have at most {MAX_ARMS} arms")
        if not MIN_WEEKS <= self.weeks <= MAX_WEEKS:
            raise ValueError(f"weeks must be between {MIN_WEEKS} and {MAX_WEEKS}")
        if not 10 <= self.n_per_arm <= MAX_N_PER_ARM:
            raise ValueError(f"n_per_arm must be between 10 and {MAX_N_PER_ARM}")
        if not 0 <= self.dropout <= 0.8 or not 0.1 <= self.adherence <= 1.0:
            raise ValueError("dropout must be 0-0.8 and adherence 0.1-1")
        if not 0 < self.alpha < 0.5:
            raise ValueError("alpha must be between 0 and 0.5")
        if len({a.name for a in self.arms}) != len(self.arms):
            raise ValueError("arm names must be unique")
        for arm in self.arms:
            for dose in arm.regimen.doses:
                blocked, _ = labels.renal_review(dose.drug, dose.mg, *self.criteria.egfr_range)
                if blocked:
                    raise ValueError(blocked)

    def context_flags(self) -> dict:
        """Warnings that must travel with any result from this design."""
        flags: list[str] = []
        drugs_in_run: list[str] = []
        for arm in self.arms:
            for dose in arm.regimen.doses:
                drugs_in_run.append(dose.drug)
                flags.extend(labels.renal_review(dose.drug, dose.mg, *self.criteria.egfr_range)[1])
        has_candidate = any(arm.regimen.candidates for arm in self.arms)
        return {
            "label_flags": sorted(set(flags)),
            "validation_scope": labels.validation_scope(drugs_in_run, self.criteria.egfr_range[0], has_candidate),
            "not_modelled": list(labels.NOT_MODELLED),
            "arm_kinds": {a.name: "hypothetical" if a.regimen.candidates else ("control" if not a.regimen.doses else "real drug") for a in self.arms},
        }


def ancova(y_end: np.ndarray, baseline: np.ndarray, treated: np.ndarray) -> tuple[float, float, float]:
    """Treatment effect on change from baseline, adjusted for baseline: (effect, SE, two-sided p)."""
    change = y_end - baseline
    x = np.column_stack([np.ones_like(change), treated.astype(float), baseline - baseline.mean()])
    xtx_inv = np.linalg.inv(x.T @ x)
    beta = xtx_inv @ x.T @ change
    residual = change - x @ beta
    dof = len(change) - x.shape[1]
    sigma2 = float(residual @ residual) / dof
    se = float(np.sqrt(sigma2 * xtx_inv[1, 1]))
    p_value = float(2 * stats.t.sf(abs(beta[1]) / se, dof))
    return float(beta[1]), se, p_value


def _discontinuation(rng: np.random.Generator, n: int, weeks: int, dropout: float, adherence: float) -> np.ndarray:
    """Weekly on-drug fraction. Stop times are uniform across the trial for those who stop."""
    on = np.full((weeks, n), adherence)
    stops = rng.random(n) < dropout
    stop_week = rng.integers(1, weeks, n)
    for i in np.where(stops)[0]:
        on[stop_week[i]:, i] = 0.0
    return on


def _draw_parameters(k: int, seed: int) -> list[dict[str, float]]:
    names, draws, _ = calibrate.load_posterior()
    rng = np.random.default_rng(seed)
    chosen = rng.choice(len(draws), size=min(k, len(draws)), replace=False)
    return [params.with_theta(dict(zip(names, draws[i]))) for i in chosen]


def validation_status() -> dict:
    """What the validation run found, attached to every result so it cannot be separated from it."""
    path = RESULTS / "validation.json"
    if not path.exists():
        return {"available": False, "note": "Held-out validation has not been run."}
    report = json.loads(path.read_text())
    return {"available": True, "blind": report["blind"], **report["score"]}


def _measure(rng: np.random.Generator, series: np.ndarray, sd: float) -> np.ndarray:
    return series + rng.normal(0, sd, series.shape)


def run_trial(design: Design) -> dict:
    """Simulate a trial across posterior draws; each draw yields replicate trials to analyse."""
    base = params.defaults()
    cohort, enrolment = pop.enroll(labs(), design.criteria, _pool_size(design.n_per_arm), base, design.seed)
    rng = np.random.default_rng(design.seed + 1)
    on_drug = {a.name: _discontinuation(rng, cohort.n, design.weeks, design.dropout, design.adherence) for a in design.arms}
    noise = {"hba1c": base["noise_a1c"], "fpg": base["noise_fpg"], "weight": base["noise_weight"]}

    control = design.arms[0].name
    per_arm: dict[str, list[dict[str, np.ndarray]]] = {a.name: [] for a in design.arms}
    time_course: dict[str, list[np.ndarray]] = {a.name: [] for a in design.arms}
    uge: dict[str, list[float]] = {a.name: [] for a in design.arms}
    organs: dict[str, list[dict[str, float]]] = {a.name: [] for a in design.arms}
    for p in _draw_parameters(design.posterior_draws, design.seed):
        for arm in design.arms:
            t = sim.simulate(cohort, arm.regimen, design.weeks, p, on_drug_by_week=on_drug[arm.name])
            per_arm[arm.name].append({"hba1c": t.a1c, "fpg": t.fpg, "weight": t.weight})
            time_course[arm.name].append(t.a1c.mean(axis=1))
            uge[arm.name].append(float(t.uge_g_day[-1].mean()))
            organs[arm.name].append({
                "liver_glucose_output_change_pct": 100 * (float(t.liver_output_factor[-1]) - 1),
                "insulin_secretion_capacity_change_pct": 100 * (float(t.secretion_factor[-1]) - 1),
                "urinary_glucose_change_g_day": float((t.uge_g_day[-1] - t.uge_g_day[0]).mean()),
                "fasting_glucose_change_mg_dl": float((t.fpg[-1] - t.fpg[0]).mean()),
                "weight_change_kg": float((t.weight[-1] - t.weight[0]).mean()),
            })

    contrasts: dict[str, dict] = {}
    for arm in design.arms[1:]:
        result: dict[str, dict] = {}
        for endpoint in ENDPOINTS:
            effects, ses, significant = [], [], []
            for draw in range(len(per_arm[control])):
                for _ in range(design.replicates):
                    pick_a, pick_c = _split(rng, cohort.n, design.n_per_arm)
                    series_a = per_arm[arm.name][draw][endpoint]
                    series_c = per_arm[control][draw][endpoint]
                    baseline = np.concatenate([series_a[0, pick_a], series_c[0, pick_c]])
                    baseline = _measure(rng, baseline, noise[endpoint])
                    end = _measure(rng, np.concatenate([series_a[-1, pick_a], series_c[-1, pick_c]]), noise[endpoint])
                    treated = np.concatenate([np.ones(design.n_per_arm), np.zeros(design.n_per_arm)])
                    effect, se, p_value = ancova(end, baseline, treated)
                    effects.append(effect)
                    ses.append(se)
                    significant.append(p_value < design.alpha and effect < 0)
            effects_arr = np.array(effects)
            result[endpoint] = {
                "effect": round(float(effects_arr.mean()), 3),
                "interval95": [round(float(x), 3) for x in np.percentile(effects_arr, [2.5, 97.5])],
                "typical_trial_se": round(float(np.mean(ses)), 3),
                "probability_significant_benefit": round(float(np.mean(significant)), 3),
            }
        contrasts[arm.name] = result

    arms_out = {}
    for arm in design.arms:
        stack = np.array(time_course[arm.name])
        ends = np.array([d["hba1c"][-1] for d in per_arm[arm.name]]).mean(axis=0)
        arms_out[arm.name] = {
            "a1c_by_week": [round(float(v), 3) for v in stack.mean(axis=0)],
            "a1c_low": [round(float(v), 3) for v in np.percentile(stack, 2.5, axis=0)],
            "a1c_high": [round(float(v), 3) for v in np.percentile(stack, 97.5, axis=0)],
            "share_below_7": round(float(np.mean(ends < 7.0)), 3),
            "urinary_glucose_g_day": round(float(np.mean(uge[arm.name])), 1),
            "organ_signals": {key: round(float(np.mean([o[key] for o in organs[arm.name]])), 2) for key in organs[arm.name][0]},
        }
    return {
        "control": control, "weeks": design.weeks, "n_per_arm": design.n_per_arm,
        "contrasts": contrasts, "arms": arms_out, "enrolment": enrolment,
        "uncertainty": {"posterior_draws": len(per_arm[control]), "replicates_per_draw": design.replicates},
        "validation": validation_status(), **design.context_flags(),
        "notice": "Research simulation. Not medical advice and not evidence that a treatment works in any person.",
    }


def _one_active_arm(design: Design) -> None:
    if len(design.arms) != 2:
        raise ValueError("this analysis compares one arm with placebo, so choose a single drug")


def power_curve(design: Design, sizes: tuple[int, ...] = (25, 50, 100, 200, 300, 400, 500), endpoint: str = "hba1c") -> dict:
    """Probability of a significant benefit by arm size, including parameter uncertainty."""
    _one_active_arm(design)
    if endpoint not in ENDPOINTS:
        raise ValueError(f"unknown endpoint {endpoint}")
    base = params.defaults()
    cohort, enrolment = pop.enroll(labs(), design.criteria, _pool_size(max(sizes)), base, design.seed)
    rng = np.random.default_rng(design.seed + 2)
    noise = {"hba1c": base["noise_a1c"], "fpg": base["noise_fpg"], "weight": base["noise_weight"]}[endpoint]
    on_drug = {a.name: _discontinuation(rng, cohort.n, design.weeks, design.dropout, design.adherence) for a in design.arms[:2]}
    a_name, c_name = design.arms[1].name, design.arms[0].name
    pick = lambda t: {"hba1c": t.a1c, "fpg": t.fpg, "weight": t.weight}[endpoint]  # noqa: E731
    sims = [
        (pick(sim.simulate(cohort, design.arms[1].regimen, design.weeks, p, on_drug_by_week=on_drug[a_name])),
         pick(sim.simulate(cohort, design.arms[0].regimen, design.weeks, p, on_drug_by_week=on_drug[c_name])))
        for p in _draw_parameters(design.posterior_draws, design.seed)
    ]
    curve = []
    for size in sizes:
        wins = []
        for series_a, series_c in sims:
            for _ in range(design.replicates):
                pa, pc = _split(rng, cohort.n, size)
                baseline = _measure(rng, np.concatenate([series_a[0, pa], series_c[0, pc]]), noise)
                end = _measure(rng, np.concatenate([series_a[-1, pa], series_c[-1, pc]]), noise)
                effect, _, p_value = ancova(end, baseline, np.concatenate([np.ones(size), np.zeros(size)]))
                wins.append(p_value < design.alpha and effect < 0)
        curve.append({"n_per_arm": size, "power": round(float(np.mean(wins)), 3)})
    enough = next((c["n_per_arm"] for c in curve if c["power"] >= 0.8), None)
    return {"arm": a_name, "control": c_name, "endpoint": endpoint, "curve": curve, "smallest_size_reaching_80pct": enough,
            "enrolment": enrolment, "validation": validation_status(), **design.context_flags(),
            "notice": "Planning aid only. Real trials need a biostatistician and a real effect estimate."}


_FEATURES = {"baseline HbA1c": "a1c", "baseline fasting glucose": "fpg", "fasting insulin": "insulin", "BMI": "bmi", "eGFR": "egfr", "age": "age", "weight": "weight", "insulin sensitivity": "si"}


def responders(design: Design, max_depth: int = 3, endpoint: str = "hba1c") -> dict:
    """Who benefits in the model: the same virtual patient run on both arms, summarised by a small tree."""
    _one_active_arm(design)
    base = params.defaults()
    cohort, enrolment = pop.enroll(labs(), design.criteria, SIM_POOL, base, design.seed)
    p = params.with_theta(dict(zip(*_posterior_median())))
    rng = np.random.default_rng(design.seed + 3)
    on_drug = _discontinuation(rng, cohort.n, design.weeks, design.dropout, design.adherence)
    drug = sim.simulate(cohort, design.arms[1].regimen, design.weeks, p, on_drug_by_week=on_drug)
    ctrl = sim.simulate(cohort, design.arms[0].regimen, design.weeks, p, on_drug_by_week=on_drug)
    pick = lambda t: {"hba1c": t.a1c, "fpg": t.fpg, "weight": t.weight}[endpoint]  # noqa: E731
    individual = pick(drug)[-1] - pick(ctrl)[-1]
    names = list(_FEATURES)
    x = np.column_stack([getattr(cohort, _FEATURES[n]) for n in names])
    tree = DecisionTreeRegressor(max_depth=max_depth, min_samples_leaf=max(20, cohort.n // 20), random_state=0).fit(x, individual)
    order = np.argsort(-tree.feature_importances_)
    return {
        "arm": design.arms[1].name, "control": design.arms[0].name, "endpoint": endpoint,
        "mean_individual_effect": round(float(individual.mean()), 3),
        "spread_sd": round(float(individual.std()), 3),
        "drivers": [{"feature": names[i], "importance": round(float(tree.feature_importances_[i]), 3)} for i in order if tree.feature_importances_[i] > 0.01],
        "subgroups": _leaves(tree, names),
        "fit_r2": round(float(tree.score(x, individual)), 3),
        "enrolment": enrolment, "validation": validation_status(), **design.context_flags(),
        "notice": "Hypothesis only. This describes the simulator's structure, so it cannot discover biology the model does not contain.",
    }


def _posterior_median() -> tuple[list[str], np.ndarray]:
    names, draws, _ = calibrate.load_posterior()
    return names, np.median(draws, axis=0)


def _leaves(tree: DecisionTreeRegressor, names: list[str]) -> list[dict]:
    t = tree.tree_
    out: list[dict] = []

    def walk(node: int, rules: list[str]) -> None:
        if t.children_left[node] == _tree.TREE_LEAF:
            out.append({"rule": " and ".join(rules) or "all patients", "patients": int(t.n_node_samples[node]), "mean_effect": round(float(t.value[node][0][0]), 3)})
            return
        name, cut = names[t.feature[node]], round(float(t.threshold[node]), 1)
        walk(t.children_left[node], [*rules, f"{name} <= {cut}"])
        walk(t.children_right[node], [*rules, f"{name} > {cut}"])

    walk(0, [])
    return sorted(out, key=lambda r: r["mean_effect"])
