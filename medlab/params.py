"""The model's named parameters, with where each came from. A few numerical constants live in the
code beside the equation they serve (for example jitter widths in population.py).

kind:
  published  - read from a cited source, fixed.
  calibrated - fitted to TRAIN trials; `prior` holds (log-mean, log-sd) of a log-normal prior.
  assumed    - no direct source found. Listed so its influence can be tested, never hidden.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Kind = Literal["published", "calibrated", "assumed"]


@dataclass(frozen=True)
class Param:
    name: str
    value: float
    unit: str
    kind: Kind
    source: str
    prior_sd: float | None = None  # log-sd for calibrated parameters; prior median is `value`


TOPP = "Topp et al. 2000, J Theor Biol 206:605 (BioModels BIOMD0000000341)"
SEMA_LABEL = "FDA label, Ozempic (semaglutide) section 12.3"
EMPA_LABEL = "FDA label, Jardiance (empagliflozin) sections 12.2-12.3"
SITA_LABEL = "FDA label, Januvia (sitagliptin) section 12.3"
MET_LABEL = "FDA label, metformin section 12.3"

_ALL = [
    # Topp core (glucose and insulin fast dynamics)
    Param("E", 1.44, "1/day", "published", TOPP),
    Param("alpha", 20000.0, "mg2/dL2", "published", TOPP),
    Param("k", 432.0, "1/day", "published", TOPP),
    Param("R0", 864.0, "mg/dL/day", "published", TOPP),
    Param("sigma", 43.2, "uU/mL/mg/day", "published", TOPP),
    Param("SI", 0.72, "mL/uU/day", "published", TOPP),
    Param("d0", 0.06, "1/day", "published", TOPP),
    Param("r1", 0.00084, "dL/mg/day", "published", TOPP),
    Param("r2", 2.4e-6, "dL2/mg2/day", "published", TOPP),
    # Glucose to HbA1c
    Param("adag_slope", 28.7, "mg/dL per %", "published", "Nathan et al. 2008, Diabetes Care 31:1473 (ADAG)"),
    Param("adag_intercept", -46.7, "mg/dL", "published", "Nathan et al. 2008, Diabetes Care 31:1473 (ADAG)"),
    Param("tau_a1c", 45.0, "days", "calibrated", "Prior from red-cell turnover; only weakly identified at 24+ weeks", 0.25),
    Param("frac_fasting", 1 / 3, "fraction of day", "assumed", "8 of 24 hours treated as fasting"),
    Param("hgp_fpg_slope", 0.72, "fraction per 100 mg/dL above 140", "published", "Derived from Hundal 2000: glucose production twice control at fasting glucose 15.5 mmol/L (279 mg/dL). Shape from DeFronzo 1989"),
    # Kidney
    Param("Vg", 1.88, "dL/kg", "published", "Dalla Man et al. 2007 (BioModels BIOMD0000000379)"),
    Param("rtg0", 240.0, "mg/dL", "assumed", "Raised renal threshold in T2D. No direct T2D source found; sensitivity is reported with validation"),
    # Empagliflozin
    Param("empa_cl", 10.6, "L/h", "published", EMPA_LABEL),
    Param("empa_rtg_min", 90.0, "mg/dL", "calibrated", "Effective fitted value that reproduces label UGE of 64 and 78 g/day. Not a physiological threshold", 0.5),
    Param("empa_ec50", 30.0, "nmol/L", "calibrated", "Fitted to label UGE at 10 and 25 mg", 1.0),
    Param("sglt2_egp_comp", 0.5, "fraction", "calibrated", "Scaling term offsetting urinary loss. Motivated by raised EGP in Ferrannini 2014, but not a direct estimate of it", 0.5),
    Param("sglt2_energy_comp", 0.71, "fraction", "published", "Ferrannini 2015: 29 +/- 41% of predicted weight loss achieved, one dose, n=86. Imprecise"),
    Param("sglt2_fluid_kg", 1.0, "kg", "calibrated", "Early fluid loss on SGLT2 inhibition, not energy; fitted to EMPA-REG MONO weight", 0.8),
    # Metformin
    Param("met_hgp_max", 0.30, "fraction", "calibrated", "Prior from Hundal 2000: glucose production -24% on metformin", 0.35),
    Param("met_ed50", 1500.0, "mg/day", "calibrated", "Prior from Garber 1997: 500 mg gave about 23% of the 2000 mg fasting glucose effect, a nearly linear shape", 0.5),
    Param("met_weight_kcal", 60.0, "kcal/day at Emax", "calibrated", "Fitted to DURATION-4 weight change", 0.8),
    # Semaglutide
    Param("sema_cl", 0.05, "L/h", "published", SEMA_LABEL),
    Param("sema_v", 12.5, "L", "published", SEMA_LABEL),
    Param("sema_mw", 4113.6, "g/mol", "published", "Semaglutide molecular weight, PubChem"),
    Param("sema_ref_weight", 85.0, "kg", "published", SEMA_LABEL + " reference subject"),
    Param("sema_iiv", 0.15, "log-sd", "published", "Overgaard et al. 2019, Diabetes Ther: interindividual variation about 15%"),
    Param("sema_sec_max", 1.2, "fold over baseline", "calibrated", "Fitted to SUSTAIN 1. Prior centred after that trial was seen, so it is deliberately wide", 1.0),
    Param("sema_ec50", 8.0, "nmol/L", "calibrated", "Fitted to SUSTAIN 1 at 0.5 and 1 mg; held-out phase 2 tests the range. Wide prior", 1.0),
    Param("sema_hgp_max", 0.15, "fraction", "calibrated", "Glucagon suppression lowers hepatic output; fitted to SUSTAIN 1 FPG. Wide prior", 0.8),
    Param("sema_kcal_max", 400.0, "kcal/day at Emax", "calibrated", "Fitted to SUSTAIN 1 weight change. Wide prior", 0.8),
    # Sitagliptin
    Param("sita_sec_max", 0.35, "fold over baseline", "calibrated", "Fitted to EMPA-REG MONO and DURATION-4. Wide prior", 1.0),
    Param("sita_ed50", 25.0, "mg/day", "assumed", "Near-saturating DPP-4 inhibition at 100 mg per label; the 200 mg held-out arm tests the plateau"),
    Param("sita_hgp_max", 0.05, "fraction", "assumed", "Glucagon suppression, smaller than GLP-1 agonists. Fixed because trial data cannot separate it from secretion"),
    # Weight dynamics
    Param("kcal_per_kg", 22.0, "kcal/day per kg", "published", "Hall et al. 2011, Lancet: about 10 kcal/day per lb at new steady state"),
    Param("tau_weight", 526.0, "days", "published", "Hall et al. 2011, Lancet: half-time about 1 year"),
    Param("kcal_per_g_glucose", 4.0, "kcal/g", "published", "Atwater factor"),
    Param("si_weight_power", 1.0, "exponent", "assumed", "Insulin sensitivity rises as weight falls"),
    # Disease and trial context
    Param("secretion_decline", 0.05, "fraction/year", "calibrated", "Slow beta-cell decline; Topp's own beta term grows at 150-250 mg/dL so it is not used here", 0.5),
    Param("placebo_meal", 0.08, "fraction of meal load", "calibrated", "Trial-participation effect; fitted to placebo arms", 0.8),
    Param("placebo_kcal", 25.0, "kcal/day", "calibrated", "Fitted to placebo weight change", 0.8),
    Param("pd_iiv", 0.30, "log-sd", "assumed", "Between-patient spread in drug response. Affects spread more than the mean"),
    Param("noise_a1c", 0.20, "% points", "assumed", "Assay and biological variation, added in the trial engine's statistics"),
    Param("noise_fpg", 15.0, "mg/dL", "assumed", "Day-to-day fasting glucose variation"),
    Param("noise_weight", 0.8, "kg", "assumed", "Scale and day-to-day variation"),
    # Numerics-only bounds, not physiology claims
    Param("rtg_floor", 40.0, "mg/dL", "assumed", "Lower bound on threshold for numerical safety"),
]

PARAMS: dict[str, Param] = {p.name: p for p in _ALL}
CALIBRATED: tuple[str, ...] = tuple(p.name for p in _ALL if p.kind == "calibrated")


def defaults() -> dict[str, float]:
    return {p.name: p.value for p in _ALL}


def with_theta(theta: dict[str, float] | None) -> dict[str, float]:
    """Defaults overlaid with fitted values. Rejects unknown names and non-calibrated overrides."""
    values = defaults()
    for name, value in (theta or {}).items():
        if name not in PARAMS:
            raise KeyError(f"unknown parameter {name}")
        if PARAMS[name].kind != "calibrated":
            raise ValueError(f"{name} is {PARAMS[name].kind}, not calibrated")
        values[name] = float(value)
    return values
