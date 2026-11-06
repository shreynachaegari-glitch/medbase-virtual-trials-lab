"""Drug regimens: dose to exposure (PK), exposure to physiological effect (PD).

Each regimen yields weekly effect multipliers per patient. Mechanisms stay separate so that
combinations add through physiology, not by summing HbA1c shifts.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import labels

REF_EGFR = 90.0
WEEK_H = 168.0


@dataclass(frozen=True)
class Dose:
    drug: str
    mg: float  # maintenance dose; per day for oral drugs, per week for semaglutide
    escalation: tuple[tuple[int, float], ...] = ()  # (weeks at this dose, mg) before maintenance

    def mg_at_week(self, week: int) -> float:
        elapsed = 0
        for weeks, mg in self.escalation:
            elapsed += weeks
            if week < elapsed:
                return mg
        return self.mg


_TITRATION = {"semaglutide": ((4, 0.25), (4, 0.5), (4, 1.0)), "metformin": ((2, 1000.0), (2, 1500.0))}


def standard_dose(drug: str, mg: float) -> Dose:
    """A dose with its usual step-up: every titration step below the target. One rule for every caller."""
    return Dose(drug, mg, tuple((weeks, step) for weeks, step in _TITRATION.get(drug, ()) if step < mg))


@dataclass(frozen=True)
class Candidate:
    """A hypothetical molecule. Effects are user assumptions; it is never a real drug's prediction."""
    name: str
    half_life_h: float
    volume_l: float
    mechanism: str  # "hgp", "secretion", "sensitizer", "renal"
    emax: float
    ec50_nmol: float
    mw: float = 500.0
    bioavailability: float = 1.0
    renal_fraction: float = 0.0
    kcal_max: float = 0.0

    def __post_init__(self) -> None:
        if self.mechanism not in {"hgp", "secretion", "sensitizer", "renal"}:
            raise ValueError(f"unknown mechanism {self.mechanism}")
        if self.half_life_h <= 0 or self.volume_l <= 0 or self.ec50_nmol <= 0 or self.mw <= 0:
            raise ValueError("half-life, volume, EC50 and molecular weight must be positive")
        if any(real in self.name.lower() for real in labels.REAL_NAMES):
            raise ValueError("a hypothetical molecule cannot use the name of a real medicine or placebo")
        if not 0 <= self.bioavailability <= 1 or not 0 <= self.renal_fraction <= 1:
            raise ValueError("bioavailability and renal fraction must be between 0 and 1")
        limit = 0.9 if self.mechanism in {"hgp", "renal"} else 10.0
        if not 0 <= self.emax <= limit:
            raise ValueError(f"emax for {self.mechanism} must be between 0 and {limit}")


@dataclass(frozen=True)
class Regimen:
    name: str
    doses: tuple[Dose, ...] = ()
    candidates: tuple[tuple[Candidate, float], ...] = field(default=())  # (molecule, mg/day)


@dataclass
class Effects:
    """Weekly per-patient effect sizes, combined across all drugs in the regimen."""
    hgp_factor: np.ndarray
    secretion_factor: np.ndarray
    si_factor: np.ndarray
    threshold: np.ndarray
    renal_net: np.ndarray
    kcal_deficit: np.ndarray
    glucosuric_energy_comp: np.ndarray
    fluid_kg: np.ndarray


def _emax(x: np.ndarray, ec50: float) -> np.ndarray:
    return x / (x + ec50)


def renal_exposure_factor(egfr: np.ndarray, renal_fraction: float) -> np.ndarray:
    """Effective exposure from renal clearance, capped at the normal-kidney level.

    Real exposure does rise as clearance falls, but no toxicity is modelled here. Letting it raise
    efficacy would show drugs working better in kidney disease and hide the reason labels restrict them.
    """
    clearance = (1 - renal_fraction) + renal_fraction * np.minimum(egfr / REF_EGFR, 1.5)
    return np.minimum(1.0 / clearance, 1.0)


def empagliflozin_cavg_nmol(mg_per_day: float, cl_l_h: float) -> float:
    """Average steady-state concentration from apparent oral clearance (MW 450.9 g/mol)."""
    return mg_per_day * 1e6 / 450.9 / (cl_l_h * 24.0)


def semaglutide_weekly_cavg(mg_by_week: np.ndarray, weight: np.ndarray, iiv: np.ndarray, p: dict[str, float]) -> np.ndarray:
    """Weekly mean nmol/L for a once-weekly dose: one-compartment superposition on apparent CL and V.

    Returns shape (weeks, patients). CL and V scale with weight (Overgaard 2019).
    """
    scale = weight / p["sema_ref_weight"]
    cl = p["sema_cl"] * scale * iiv  # L/h
    v = p["sema_v"] * scale
    ke = cl / v
    decay = np.exp(-ke * WEEK_H)
    mean_factor = (1 - decay) / (ke * WEEK_H)
    nmol_per_mg = 1e6 / p["sema_mw"]
    out = np.zeros((len(mg_by_week), len(weight)))
    trough = np.zeros(len(weight))
    for w, mg in enumerate(mg_by_week):
        peak = trough + mg * nmol_per_mg / v
        out[w] = peak * mean_factor
        trough = peak * decay
    return out


def effects_for_week(
    regimen: Regimen, week: int, cohort, p: dict[str, float], sema_cavg: np.ndarray | None, on_drug: np.ndarray,
) -> Effects:
    """Combine all drugs for one week. `on_drug` is 0 to 1 per patient (adherence, discontinuation)."""
    n = cohort.n
    hgp = np.ones(n)
    secretion = np.ones(n)
    si = np.ones(n)
    threshold = np.full(n, p["rtg0"])
    kcal = np.zeros(n)
    renal_net = np.ones(n)
    fluid = np.zeros(n)

    for dose in regimen.doses:
        mg = dose.mg_at_week(week)
        if dose.drug == "metformin":
            exposure = mg * renal_exposure_factor(cohort.egfr, 0.9) * on_drug
            effect = _emax(exposure, p["met_ed50"]) * cohort.resp_hgp
            hgp = hgp * (1 - np.minimum(p["met_hgp_max"] * effect, 0.9))
            kcal = kcal + p["met_weight_kcal"] * effect
        elif dose.drug == "empagliflozin":
            cavg = empagliflozin_cavg_nmol(mg, p["empa_cl"]) * on_drug
            occupancy = _emax(cavg, p["empa_ec50"])
            threshold = np.maximum(p["rtg0"] - (p["rtg0"] - p["empa_rtg_min"]) * occupancy * np.minimum(cohort.resp_renal, 1.3), p["rtg_floor"])
            # Compensation and fluid shifts follow the degree of transporter block, so they scale with dose and adherence.
            renal_net = 1 - p["sglt2_egp_comp"] * occupancy
            fluid = p["sglt2_fluid_kg"] * occupancy
        elif dose.drug == "semaglutide":
            if sema_cavg is None:
                raise ValueError("semaglutide regimen needs exposure")
            c = sema_cavg[week] * on_drug
            effect = _emax(c, p["sema_ec50"]) * cohort.resp_incretin
            secretion = secretion * (1 + p["sema_sec_max"] * effect)
            hgp = hgp * (1 - np.minimum(p["sema_hgp_max"] * effect, 0.9))
            kcal = kcal + p["sema_kcal_max"] * effect
        elif dose.drug == "sitagliptin":
            exposure = mg * renal_exposure_factor(cohort.egfr, 0.8) * on_drug
            effect = _emax(exposure, p["sita_ed50"]) * cohort.resp_incretin
            secretion = secretion * (1 + p["sita_sec_max"] * effect)
            hgp = hgp * (1 - np.minimum(p["sita_hgp_max"] * effect, 0.9))
        else:
            raise ValueError(f"unknown drug {dose.drug}")

    for molecule, mg_day in regimen.candidates:
        factor = renal_exposure_factor(cohort.egfr, molecule.renal_fraction)
        ke_per_h = np.log(2) / molecule.half_life_h
        cavg = molecule.bioavailability * mg_day * 1e6 / molecule.mw / (ke_per_h * molecule.volume_l * 24.0) * factor * on_drug
        effect = _emax(cavg, molecule.ec50_nmol) * cohort.resp_candidate
        if molecule.mechanism == "hgp":
            hgp = hgp * (1 - np.minimum(molecule.emax * effect, 0.9))
        elif molecule.mechanism == "secretion":
            secretion = secretion * (1 + molecule.emax * effect)
        elif molecule.mechanism == "sensitizer":
            si = si * (1 + molecule.emax * effect)
        else:  # renal
            threshold = np.minimum(threshold, np.maximum(p["rtg0"] * (1 - np.minimum(molecule.emax * effect, 0.9)), p["rtg_floor"]))
            renal_net = np.minimum(renal_net, 1 - p["sglt2_egp_comp"] * _emax(cavg, molecule.ec50_nmol))
        kcal = kcal + molecule.kcal_max * effect

    return Effects(hgp, secretion, si, threshold, renal_net, kcal, np.full(n, p["sglt2_energy_comp"]), fluid)
