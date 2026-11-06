"""Weekly simulation of one regimen over one cohort. All physiology, no statistics."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import drugs, physiology as ph
from .population import Cohort

DAYS_PER_WEEK = 7.0


@dataclass
class Trajectory:
    weeks: np.ndarray
    a1c: np.ndarray  # (weeks + 1, patients)
    fpg: np.ndarray
    weight: np.ndarray
    uge_g_day: np.ndarray
    insulin: np.ndarray
    liver_output_factor: np.ndarray  # cohort mean by week, relative to untreated
    secretion_factor: np.ndarray  # cohort mean by week, relative to untreated


def _sema_exposure(regimen: drugs.Regimen, cohort: Cohort, weeks: int, p: dict[str, float]) -> np.ndarray | None:
    dose = next((d for d in regimen.doses if d.drug == "semaglutide"), None)
    if dose is None:
        return None
    schedule = np.array([dose.mg_at_week(w) for w in range(weeks)])
    return drugs.semaglutide_weekly_cavg(schedule, cohort.weight, cohort.sema_clearance, p)


def simulate(
    cohort: Cohort, regimen: drugs.Regimen, weeks: int, p: dict[str, float],
    on_drug_by_week: np.ndarray | None = None, participation: bool = True,
) -> Trajectory:
    """Advance a cohort one week at a time from its twin baseline.

    `on_drug_by_week` is (weeks, patients) in [0, 1], covering adherence and discontinuation.
    `participation` applies the trial-participation effect, which is what a placebo arm receives.
    """
    if weeks < 1:
        raise ValueError("weeks must be at least 1")
    n = cohort.n
    on_drug = np.ones((weeks, n)) if on_drug_by_week is None else on_drug_by_week
    a1c = np.zeros((weeks + 1, n))
    fpg = np.zeros((weeks + 1, n))
    weight = np.zeros((weeks + 1, n))
    uge = np.zeros((weeks + 1, n))
    insulin = np.zeros((weeks + 1, n))
    liver_factor = np.ones(weeks + 1)
    secretion_mean = np.ones(weeks + 1)

    a1c[0], fpg[0], weight[0], insulin[0] = cohort.a1c, cohort.fpg, cohort.weight, cohort.insulin
    current_a1c = cohort.a1c.copy()
    current_weight = cohort.weight.copy()
    secretion_base = cohort.secretion.copy()
    guess_fast, guess_fed = cohort.fpg.copy(), None
    sema = _sema_exposure(regimen, cohort, weeks, p)
    w_fast = p["frac_fasting"]

    # Untreated glucosuria already present at baseline is part of the patient's energy balance;
    # only the change from it is a new deficit.
    untreated_threshold = np.full(n, p["rtg0"])
    baseline_fed = ph.solve_glucose(
        ph.Balance(cohort.hgp + cohort.meal, cohort.si, cohort.secretion, untreated_threshold, cohort.gfr, cohort.weight),
        p, cohort.fpg * 1.1,
    )
    baseline_uge = (
        w_fast * ph.urinary_glucose_g_per_day(cohort.fpg, untreated_threshold, cohort.gfr)
        + (1 - w_fast) * ph.urinary_glucose_g_per_day(baseline_fed, untreated_threshold, cohort.gfr)
    )
    uge[0] = baseline_uge

    decline_per_week = p["secretion_decline"] / 52.0
    relax_a1c = 1 - np.exp(-DAYS_PER_WEEK / p["tau_a1c"])
    relax_weight = 1 - np.exp(-DAYS_PER_WEEK / p["tau_weight"])
    relax_fluid = 1 - np.exp(-1.0)  # fluid shifts settle within weeks, on the order of the time step
    current_fluid = np.zeros(n)
    meal_factor = 1 - p["placebo_meal"] if participation else 1.0
    base_kcal = p["placebo_kcal"] if participation else 0.0

    for week in range(weeks):
        e = drugs.effects_for_week(regimen, week, cohort, p, sema, on_drug[week])
        secretion = secretion_base * e.secretion_factor
        si = cohort.si * e.si_factor * (cohort.weight / current_weight) ** p["si_weight_power"]
        hgp = cohort.hgp * e.hgp_factor
        fasting = ph.Balance(hgp, si, secretion, e.threshold, cohort.gfr, current_weight, e.renal_net)
        fed = ph.Balance(hgp + cohort.meal * meal_factor, si, secretion, e.threshold, cohort.gfr, current_weight, e.renal_net)
        g_fast = ph.solve_glucose(fasting, p, guess_fast)
        g_fed = ph.solve_glucose(fed, p, guess_fed if guess_fed is not None else g_fast * 1.3)
        guess_fast, guess_fed = g_fast, g_fed

        a1c_target = ph.a1c_from_mean_glucose(ph.mean_glucose(g_fast, g_fed, p), p) + cohort.glycation_gap
        current_a1c = current_a1c + relax_a1c * (a1c_target - current_a1c)

        uge_now = w_fast * ph.urinary_glucose_g_per_day(g_fast, e.threshold, cohort.gfr) + (1 - w_fast) * ph.urinary_glucose_g_per_day(g_fed, e.threshold, cohort.gfr)
        glucosuric_kcal = (uge_now - baseline_uge) * p["kcal_per_g_glucose"] * (1 - e.glucosuric_energy_comp)
        kcal = e.kcal_deficit + glucosuric_kcal + base_kcal
        weight_target = cohort.weight - kcal / p["kcal_per_kg"]
        current_weight = current_weight + relax_weight * (weight_target - current_weight)
        secretion_base = secretion_base * (1 - decline_per_week)

        # Scale weight includes fluid; insulin sensitivity above follows only the energy-driven weight.
        current_fluid = current_fluid + relax_fluid * (e.fluid_kg - current_fluid)
        a1c[week + 1], fpg[week + 1], weight[week + 1] = current_a1c, g_fast, current_weight - current_fluid
        uge[week + 1] = uge_now
        insulin[week + 1] = ph.insulin_from_glucose(g_fast, secretion, p)
        liver_factor[week + 1] = float(e.hgp_factor.mean())
        secretion_mean[week + 1] = float(e.secretion_factor.mean())

    return Trajectory(np.arange(weeks + 1), a1c, fpg, weight, uge, insulin, liver_factor, secretion_mean)
