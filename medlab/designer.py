"""AI Trial Designer: an automated search for a study design that meets a stated goal.

The search is ordinary, inspectable code and every step's numbers come from the simulator, so a
language model can request or narrate a design but cannot alter what was found.

Goal: the lowest dose reaching a target placebo-adjusted HbA1c effect, then the smallest arm size
that detects it with the target power. Doses are bisected, because the response rises with dose.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from . import drugs, labels, population as pop, trial

_RANGE = labels.DOSE_RANGE
_UNIT = {"semaglutide": "mg/week"}
SIZES = (25, 50, 100, 200, 400)
MAX_DOSE_STEPS = 7
RELATIVE_DOSE_PRECISION = 0.10


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
    return {"mg": round(mg, 3), "effect": hba1c["effect"], "interval95": hba1c["interval95"]}


def _round_up(mg: float) -> float:
    """Two significant figures, upward, so rounding cannot drop a dose below the target it was chosen for."""
    magnitude = 10 ** (math.floor(math.log10(mg)) - 1)
    return math.ceil(mg / magnitude - 1e-9) * magnitude


def design_study(goal: Goal) -> dict:
    """Runs the search and returns every step it took, including when no design meets the goal."""
    low, high = _RANGE[goal.drug]
    unit = _UNIT.get(goal.drug, "mg/day")
    steps: list[dict] = []
    wanted = -abs(goal.target_effect)

    ceiling = _effect(goal, high)
    steps.append({"step": len(steps) + 1, "action": f"Try the highest modelled dose, {high:g} {unit}", "result": ceiling,
                  "finding": f"Simulated effect {ceiling['effect']} points against placebo."})
    if ceiling["effect"] > wanted:
        return _finish(goal, steps, None, f"No dose in the modelled range reached {goal.target_effect} points in this population. The simulated maximum was {ceiling['effect']}.")

    floor = _effect(goal, low)
    steps.append({"step": len(steps) + 1, "action": f"Try the lowest modelled dose, {low:g} {unit}", "result": floor,
                  "finding": f"Simulated effect {floor['effect']} points against placebo."})
    best = floor if floor["effect"] <= wanted else ceiling
    if floor["effect"] > wanted:
        lo, hi = low, high
        for _ in range(MAX_DOSE_STEPS):
            if (hi - lo) / hi < RELATIVE_DOSE_PRECISION:
                break
            mid = (lo * hi) ** 0.5  # dose response is roughly log-shaped
            trial_dose = _effect(goal, mid)
            met = trial_dose["effect"] <= wanted
            steps.append({"step": len(steps) + 1, "action": f"Bisect: try {trial_dose['mg']:g} {unit}", "result": trial_dose,
                          "finding": f"Simulated effect {trial_dose['effect']}, so the target is {'met: search lower' if met else 'not met: search higher'}."})
            if met:
                hi, best = mid, trial_dose
            else:
                lo = mid

    dose = round(min(_round_up(best["mg"]), high), 3)
    final = _effect(goal, dose)
    steps.append({"step": len(steps) + 1, "action": f"Re-run at the rounded dose, {dose:g} {unit}", "result": final, "finding": f"Simulated effect {final['effect']} points against placebo."})
    power = trial.power_curve(_design(goal, dose), sizes=SIZES)
    chosen = next((c for c in power["curve"] if c["power"] >= goal.target_power), None)
    steps.append({"step": len(steps) + 1, "action": f"Estimate power at {dose:g} {unit} across arm sizes", "result": {"curve": power["curve"]},
                  "finding": f"{goal.target_power:.0%} power is first reached at {chosen['n_per_arm']} per arm." if chosen else f"{goal.target_power:.0%} power was not reached up to {SIZES[-1]} per arm."})
    if chosen is None:
        return _finish(goal, steps, None, f"{dose:g} {unit} reaches the effect, but no tested size reached the target power.")
    simulated_design = {"drug": goal.drug, "dose_mg": dose, "unit": unit, "n_per_arm": chosen["n_per_arm"], "power": chosen["power"], "weeks": goal.weeks,
                        "expected_effect": final["effect"], "effect_interval95": final["interval95"]}
    return _finish(goal, steps, simulated_design, "Lowest simulated dose meeting the target, and the smallest tested arm size with the target power.")


def _finish(goal: Goal, steps: list[dict], simulated_design: dict | None, reason: str) -> dict:
    return {
        "notice": "A simulated study design for research and learning. It is not a dosing recommendation for anyone, and a real study needs clinical, statistical and ethics review.",
        "goal": {"drug": goal.drug, "target_effect": goal.target_effect, "weeks": goal.weeks, "background": goal.background, "target_power": goal.target_power},
        "steps": steps, "simulated_design": simulated_design, "reason": reason, "validation": trial.validation_status(), "not_modelled": list(labels.NOT_MODELLED),
    }
