"""Real trials as simulation inputs: arms, schedules, criteria, and the fixed list of contrasts.

Schedules come from each registry record's participant-flow text. Baseline targets come from its
baseline table. Held-out contrasts were written before any held-out outcome value was read.
"""
from __future__ import annotations

from dataclasses import dataclass

from .drugs import Dose, Regimen  # noqa: F401  (validate.py reuses these names)
from .population import Criteria

MMOL_TO_MGDL = 18.016

_SEMA_05 = Dose("semaglutide", 0.5, ((4, 0.25),))
_SEMA_10 = Dose("semaglutide", 1.0, ((4, 0.25), (4, 0.5)))
_MET_2G_DUR = Dose("metformin", 2000, ((2, 1000), (2, 1500)))
_MET_1G_FACT = Dose("metformin", 1000, ((1, 500),))
_MET_2G_FACT = Dose("metformin", 2000, ((1, 500), (1, 1000), (1, 1500)))
_SITA = Dose("sitagliptin", 100)
_EMPA10 = Dose("empagliflozin", 10)
_EMPA25 = Dose("empagliflozin", 25)
PLACEBO = Regimen("Placebo")


@dataclass(frozen=True)
class TrialSpec:
    nct: str
    name: str
    weeks: int
    criteria: Criteria
    arms: dict[str, Regimen]  # registry arm title to regimen


def _reg(*doses: Dose) -> Regimen:
    return Regimen("+".join(f"{d.drug} {d.mg:g}" for d in doses), tuple(doses))


TRAIN_SPECS = (
    TrialSpec(
        "NCT02054897", "SUSTAIN 1", 30,
        Criteria(background="naive", target_a1c=8.05, target_fpg=9.75 * MMOL_TO_MGDL, target_weight=91.93, target_age=53.7),
        {"Placebo": PLACEBO, "Semaglutide 0.5 mg": _reg(_SEMA_05), "Semaglutide 1.0 mg": _reg(_SEMA_10)},
    ),
    TrialSpec(
        "NCT01177813", "EMPA-REG MONO", 24,
        # The registry baseline table has no HbA1c for this trial, so only eligibility and age are matched.
        Criteria(background="naive", bmi_max=45, egfr_range=(50, 400), target_age=55.0),
        {"Placebo": PLACEBO, "Empagliflozin10 mg": _reg(_EMPA10), "Empagliflozin 25 mg": _reg(_EMPA25), "Sitagliptin 100 mg": _reg(_SITA)},
    ),
    TrialSpec(
        "NCT00676338", "DURATION-4", 26,
        Criteria(a1c_range=(7.1, 11.0), bmi_min=23, bmi_max=45, background="naive", target_a1c=8.5, target_weight=87.0, target_age=53.7),
        {"Metformin": _reg(_MET_2G_DUR), "Sitagliptin": _reg(_SITA)},
    ),
)

_SITA_ARM = "Sitagliptin + Semaglutide Placebo"
HELD_OUT_SPECS = (
    TrialSpec(
        "NCT01930188", "SUSTAIN 2", 56,
        Criteria(a1c_range=(7.0, 10.5), egfr_range=(60, 400), background="metformin_only", target_a1c=8.07, target_fpg=9.4 * MMOL_TO_MGDL, target_weight=89.48, target_age=55.1),
        {"Semaglutide 0.5 mg + Sitagliptin Placebo": _reg(_SEMA_05), "Semaglutide 1.0 mg + Sitagliptin Placebo": _reg(_SEMA_10), _SITA_ARM: _reg(_SITA)},
    ),
    TrialSpec(
        "NCT00696657", "Semaglutide phase 2", 12,
        Criteria(weight_range=(60, 110), background="metformin_or_none", target_a1c=8.1, target_age=55.0),
        {
            "Placebo": PLACEBO,
            "Semaglutide 0.1 mg": _reg(Dose("semaglutide", 0.1)),
            "Semaglutide 0.2 mg": _reg(Dose("semaglutide", 0.2)),
            "Semaglutide 0.4 mg": _reg(Dose("semaglutide", 0.4)),
            "Semaglutide 0.8 mg": _reg(Dose("semaglutide", 0.8)),
            "Semaglutide 0.8 mg (With Titration)": _reg(Dose("semaglutide", 0.8, ((1, 0.4),))),
            "Semaglutide 1.6 mg (With Titration)": _reg(Dose("semaglutide", 1.6, ((1, 0.4), (1, 0.8)))),
        },
    ),
    TrialSpec(
        "NCT01164501", "EMPA-REG RENAL mild", 24, Criteria(bmi_max=45, egfr_range=(60, 90), fpg_max=240, target_age=63.9),
        {"Placebo": PLACEBO, "Empa 10mg": _reg(_EMPA10), "Empa 25mg": _reg(_EMPA25)},
    ),
    TrialSpec(
        "NCT01164501", "EMPA-REG RENAL moderate", 24,
        # Few real participants here, and insulin users cannot be twins. Reported separately and flagged thin.
        Criteria(bmi_max=45, egfr_range=(30, 60), fpg_max=240, target_age=63.9),
        {"Placebo": PLACEBO, "Empa 25mg": _reg(_EMPA25)},
    ),
    TrialSpec(
        "NCT01159600", "EMPA-REG MET", 24, Criteria(a1c_range=(7.0, 11.0), background="metformin_only", bmi_max=45, fpg_max=240, target_age=55.9),
        {"Met: Placebo": PLACEBO, "Met: Empa 10mg": _reg(_EMPA10), "Met: Empa 25mg": _reg(_EMPA25)},
    ),
    TrialSpec(
        "NCT00087516", "Sitagliptin monotherapy", 24, Criteria(background="naive", age_range=(18, 75), target_a1c=8.0, target_fpg=173.7, target_age=54.2),
        {"Placebo": PLACEBO, "Sitagliptin 100 mg": _reg(_SITA), "Sitagliptin 200 mg": _reg(Dose("sitagliptin", 200))},
    ),
    TrialSpec(
        "NCT00103857", "Sitagliptin + metformin factorial", 24, Criteria(a1c_range=(7.0, 11.0), background="naive", age_range=(18, 78), target_a1c=9.0, target_age=53.4),
        {
            "Placebo/Metformin 1000 mg b.i.d.": PLACEBO,
            "Sitagliptin 100 mg q.d.": _reg(_SITA),
            "Metformin 500 mg b.i.d.": _reg(_MET_1G_FACT),
            "Metformin 1000 mg b.i.d.": _reg(_MET_2G_FACT),
            "Sitagliptin 50 mg b.i.d. + Metformin 500 mg b.i.d.": _reg(_SITA, _MET_1G_FACT),
            "Sitagliptin 50 mg b.i.d + Metformin 1000 mg b.i.d.": _reg(_SITA, _MET_2G_FACT),
        },
    ),
)


@dataclass(frozen=True)
class Contrast:
    trial: str  # TrialSpec.name
    arm: str
    reference: str
    outcome_title: str  # registry outcome title, exact
    group: str = "efficacy"


_S2 = "Change in HbA1c (Glycosylated Haemoglobin) From Baseline"
_MILD = "HbA1c Change From Baseline in Patients With Mild Renal Impairment"
_MOD = "HbA1c Change From Baseline in Patients With Moderate Renal Impairment"
_MET = "HbA1c Change From Baseline"
_SITA24 = "Change From Baseline in A1C at Week 24"
_FACT24 = "Change From Baseline in HbA1c (Hemoglobin A1C) at Week 24"
_P = "Placebo/Metformin 1000 mg b.i.d."

HELD_OUT_CONTRASTS = (
    Contrast("SUSTAIN 2", "Semaglutide 0.5 mg + Sitagliptin Placebo", _SITA_ARM, _S2),
    Contrast("SUSTAIN 2", "Semaglutide 1.0 mg + Sitagliptin Placebo", _SITA_ARM, _S2),
    *(Contrast("Semaglutide phase 2", a, "Placebo", "HbA1c") for a in (
        "Semaglutide 0.1 mg", "Semaglutide 0.2 mg", "Semaglutide 0.4 mg", "Semaglutide 0.8 mg",
        "Semaglutide 0.8 mg (With Titration)", "Semaglutide 1.6 mg (With Titration)")),
    Contrast("EMPA-REG RENAL mild", "Empa 10mg", "Placebo", _MILD, "renal"),
    Contrast("EMPA-REG RENAL mild", "Empa 25mg", "Placebo", _MILD, "renal"),
    Contrast("EMPA-REG RENAL moderate", "Empa 25mg", "Placebo", _MOD, "renal"),
    Contrast("EMPA-REG MET", "Met: Empa 10mg", "Met: Placebo", _MET),
    Contrast("EMPA-REG MET", "Met: Empa 25mg", "Met: Placebo", _MET),
    Contrast("Sitagliptin monotherapy", "Sitagliptin 100 mg", "Placebo", _SITA24),
    Contrast("Sitagliptin monotherapy", "Sitagliptin 200 mg", "Placebo", _SITA24),
    *(Contrast("Sitagliptin + metformin factorial", a, _P, _FACT24) for a in (
        "Sitagliptin 100 mg q.d.", "Metformin 500 mg b.i.d.", "Metformin 1000 mg b.i.d.",
        "Sitagliptin 50 mg b.i.d. + Metformin 500 mg b.i.d.", "Sitagliptin 50 mg b.i.d + Metformin 1000 mg b.i.d.")),
)

# Pre-registered pass marks (design spec sections 3 and 8), fixed before held-out values were read.
PASS_MAE = 0.25
PASS_WITHIN_030_FRACTION = 0.70
PASS_COVERAGE = 0.85  # 17 of 20; easier marks pass too often when true coverage is poor
RENAL_TOLERANCE = 0.30
STRUCTURAL_SD = 0.12  # model error added to prediction intervals, chosen before unsealing


def spec_by_name(name: str) -> TrialSpec:
    for spec in (*TRAIN_SPECS, *HELD_OUT_SPECS):
        if spec.name == name:
            return spec
    raise KeyError(name)
