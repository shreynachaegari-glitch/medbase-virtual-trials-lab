"""AI Trial Designer: finds a study design that meets a stated goal, guided by a trained neural surrogate.

The surrogate screens hundreds of doses at once and proposes where to look. The simulator then checks
that proposal and has the last word: every number reported comes from it, so neither the network nor a
language model can alter what was found. Without a usable surrogate the search falls back to bisection.

Goal: the lowest dose reaching a target placebo-adjusted HbA1c effect, then the smallest arm size
that detects it with the target power.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from . import drugs, labels, population as pop, trial
from .agent import surrogate, track_record

_RANGE = labels.DOSE_RANGE
_UNIT = {"semaglutide": "mg/week"}
SIZES = (25, 50, 100, 200, 400)
MAX_DOSE_STEPS = 7
RELATIVE_DOSE_PRECISION = 0.10
WIDENING_FACTORS = (1.11, 1.25, 1.6, 2.5)  # steps away from a proposal grow until the target is bracketed


@dataclass(frozen=True)
class Goal:
    drug: str
    target_effect: float = 1.0  # HbA1c points below placebo
    weeks: int = 26
    background: str = "any"
    target_power: float = 0.8

    def __post_init__(self) -> None:
        if self.drug not in _RANGE:
            raise ValueError(f"unknown drug {self.drug}; choose from {sorted(_RANGE)}")
        if not 0.1 <= self.target_effect <= 3.0:
            raise ValueError("target effect must be between 0.1 and 3 HbA1c points")
        if not trial.MIN_WEEKS <= self.weeks <= trial.MAX_WEEKS:
            raise ValueError(f"weeks must be between {trial.MIN_WEEKS} and {trial.MAX_WEEKS}")
        if not 0.5 <= self.target_power < 1:
            raise ValueError("target power must be between 0.5 and 0.99")


def _regimen(drug: str, mg: float) -> drugs.Regimen:
    return drugs.Regimen(f"{drug} {mg:g}", (drugs.standard_dose(drug, mg),))


def _design(goal: Goal, mg: float, n: int = 100) -> trial.Design:
    arms = (trial.Arm("Placebo", drugs.Regimen("Placebo")), trial.Arm(f"{goal.drug} {mg:g}", _regimen(goal.drug, mg)))
    criteria = pop.Criteria(background=goal.background, min_pool=15)
    return trial.Design(arms=arms, weeks=goal.weeks, n_per_arm=n, criteria=criteria, posterior_draws=8, replicates=8)


def _effect(goal: Goal, mg: float) -> dict:
    result = trial.run_trial(_design(goal, mg))
    hba1c = result["contrasts"][f"{goal.drug} {mg:g}"]["hba1c"]
    enrolment = result["enrolment"]
    return {"mg": round(mg, 3), "effect": hba1c["effect"], "interval95": hba1c["interval95"],
            "enrolment": {"thin_pool": enrolment["thin_pool"], "eligible_real_participants": enrolment["eligible_real_participants"]}}


def _round_up(mg: float) -> float:
    """Two significant figures, upward, so rounding cannot drop a dose below the target it was chosen for."""
    magnitude = 10 ** (math.floor(math.log10(mg)) - 1)
    return math.ceil(mg / magnitude - 1e-9) * magnitude


def _guide(goal: Goal) -> dict | None:
    criteria = pop.Criteria(background=goal.background, min_pool=15)
    baseline = float(pop.eligible(trial.labs(), criteria)["LBXGH"].mean())
    return surrogate.propose(goal.drug, goal.target_effect, goal.weeks, baseline)


def _try(goal: Goal, steps: list[dict], mg: float, unit: str, action: str, wanted: float) -> dict:
    result = _effect(goal, mg)
    verdict = "reaches the target" if result["effect"] <= wanted else "falls short of the target"
    steps.append({"step": len(steps) + 1, "action": action.format(dose=f"{result['mg']:g} {unit}"), "result": result, "finding": f"Simulated effect {result['effect']} points against placebo, which {verdict}."})
    return result


def _narrow(goal: Goal, steps: list[dict], lo: float, hi: float, best: dict, unit: str, wanted: float) -> dict:
    """Bisects on a log scale, since dose response is roughly log-shaped."""
    for _ in range(MAX_DOSE_STEPS):
        if (hi - lo) / hi < RELATIVE_DOSE_PRECISION:
            break
        mid = (lo * hi) ** 0.5
        result = _try(goal, steps, mid, unit, "Narrow the range: try {dose}", wanted)
        if result["effect"] <= wanted:
            hi, best = mid, result
        else:
            lo = mid
    return best


def _bisection_search(goal: Goal, steps: list[dict], unit: str, wanted: float) -> dict | None:
    low, high = _RANGE[goal.drug]
    ceiling = _try(goal, steps, high, unit, "Try the highest modelled dose, {dose}", wanted)
    if ceiling["effect"] > wanted:
        return None
    floor = _try(goal, steps, low, unit, "Try the lowest modelled dose, {dose}", wanted)
    return floor if floor["effect"] <= wanted else _narrow(goal, steps, low, high, ceiling, unit, wanted)


def _guided_search(goal: Goal, steps: list[dict], unit: str, wanted: float, proposed: float) -> dict | None:
    """Starts at the surrogate's proposal and widens outward until the simulator brackets the target."""
    low, high = _RANGE[goal.drug]
    first = _try(goal, steps, proposed, unit, "Highest modelled dose, {dose}, since the surrogate expects nothing lower to reach the target" if proposed >= high else "Check the surrogate's proposal in the simulator, {dose}", wanted)
    met = first["effect"] <= wanted
    if not met and proposed >= high:
        return None
    if met and proposed <= low:
        return first
    best, mg = (first, proposed) if met else (None, proposed)
    for factor in (*WIDENING_FACTORS, *[WIDENING_FACTORS[-1]] * MAX_DOSE_STEPS):
        next_mg = max(low, mg / factor) if met else min(high, mg * factor)
        result = _try(goal, steps, next_mg, unit, "Look lower: try {dose}" if met else "Look higher: try {dose}", wanted)
        reached = result["effect"] <= wanted
        if met and not reached:
            return _narrow(goal, steps, next_mg, mg, best, unit, wanted)
        if not met and reached:
            return _narrow(goal, steps, mg, next_mg, result, unit, wanted)
        best, mg = (result if met else best), next_mg
        if met and mg <= low:
            return best
        if not met and mg >= high:
            return None
    return best


def design_study(goal: Goal, use_surrogate: bool = True) -> dict:
    """Runs the search and returns every step it took, including when no design meets the goal."""
    low, high = _RANGE[goal.drug]
    unit = _UNIT.get(goal.drug, "mg/day")
    steps: list[dict] = []
    wanted = -abs(goal.target_effect)
    guide = _guide(goal) if use_surrogate else None
    used = guide or {"used": False}
    best = _guided_search(goal, steps, unit, wanted, guide["proposed_mg"]) if guide else _bisection_search(goal, steps, unit, wanted)
    if best is None:
        return _finish(goal, steps, None, f"No dose in the modelled range reached {goal.target_effect} points in this population. The simulated maximum was {steps[-1]['result']['effect']}.", used)

    dose = round(min(_round_up(best["mg"]), high), 3)
    final = _effect(goal, dose)
    steps.append({"step": len(steps) + 1, "action": f"Re-run at the rounded dose, {dose:g} {unit}", "result": final, "finding": f"Simulated effect {final['effect']} points against placebo."})
    power = trial.power_curve(_design(goal, dose), sizes=SIZES)
    chosen = next((c for c in power["curve"] if c["power"] >= goal.target_power), None)
    steps.append({"step": len(steps) + 1, "action": f"Estimate power at {dose:g} {unit} across arm sizes", "result": {"curve": power["curve"]},
                  "finding": f"{goal.target_power:.0%} power is first reached at {chosen['n_per_arm']} per arm." if chosen else f"{goal.target_power:.0%} power was not reached up to {SIZES[-1]} per arm."})
    if chosen is None:
        return _finish(goal, steps, None, f"{dose:g} {unit} reaches the effect, but no tested size reached the target power.", used)
    simulated_design = {"drug": goal.drug, "dose_mg": dose, "unit": unit, "n_per_arm": chosen["n_per_arm"], "power": chosen["power"], "weeks": goal.weeks,
                        "expected_effect": final["effect"], "effect_interval95": final["interval95"]}
    return _finish(goal, steps, simulated_design, "Lowest simulated dose meeting the target, and the smallest tested arm size with the target power.", used)


def _finish(goal: Goal, steps: list[dict], simulated_design: dict | None, reason: str, guide: dict) -> dict:
    final_mg = simulated_design["dose_mg"] if simulated_design else _RANGE[goal.drug][1]
    flags = _design(goal, final_mg).context_flags()
    runs = [s["result"] for s in steps if "effect" in s["result"]]
    return {
        "notice": "A simulated study design for research and learning. It is not a dosing recommendation for anyone, and a real study needs clinical, statistical and ethics review.",
        "goal": {"drug": goal.drug, "target_effect": goal.target_effect, "weeks": goal.weeks, "background": goal.background, "target_power": goal.target_power},
        "steps": steps, "simulated_design": simulated_design, "reason": reason, "surrogate": guide, "simulator_runs": sum("effect" in s["result"] for s in steps), "track_record": track_record.for_regimen(_regimen(goal.drug, final_mg), goal.weeks), "dose_evidence": track_record.for_dose(goal.drug, final_mg) if simulated_design else None,
        "label_flags": flags["label_flags"], "validation_scope": flags["validation_scope"], "enrolment": runs[-1]["enrolment"], "validation": trial.validation_status(), "not_modelled": list(labels.NOT_MODELLED),
    }
