"""Virtual patients built from real NHANES participants with diabetes (2013-14, 2015-16, 2017-March 2020).

Each participant's fasting labs are inverted through the Topp steady state into their own parameters.
Those labs are real. Sampling adds small jitter, hepatic output has an assumed spread, and drug
response has an assumed spread; these are stated in params.py and are not measured for a person.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from . import physiology as ph

NHANES_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "nhanes"
CACHE = NHANES_DIR / "pool.parquet"
# Fasting insulin outside this range is usually assay or fasting-status error in a survey setting.
INSULIN_RANGE = (2.0, 60.0)
EGFR_MIN = 15.0
THIN_POOL = 40  # below this, results lean on very few real people and say so


CYCLES = (
    # Survey cycles pooled so trials have more real people. (suffix, weight column, survey years)
    ("P_", "", "WTSAFPRP", 3.2),
    ("", "_I", "WTSAF2YR", 2.0),
    ("", "_H", "WTSAF2YR", 2.0),
)
_OTHER_AGENTS = "GLIMEPIRIDE|GLIPIZIDE|GLYBURIDE|GLICLAZIDE|TOLBUTAMIDE|PIOGLITAZONE|ROSIGLITAZONE|SITAGLIPTIN|SAXAGLIPTIN|LINAGLIPTIN|ALOGLIPTIN|LIRAGLUTIDE|EXENATIDE|DULAGLUTIDE|SEMAGLUTIDE|GLIFLOZIN|ACARBOSE|REPAGLINIDE|NATEGLINIDE"


def _read(name: str, cols: list[str]) -> pd.DataFrame:
    frame = pd.read_sas(NHANES_DIR / f"{name}.xpt", format="xport", encoding="latin-1")
    return frame.set_index("SEQN")[cols]


def _load_cycle(prefix: str, suffix: str, weight: str, years: float) -> pd.DataFrame:
    name = lambda base: f"{prefix}{base}{suffix}"  # noqa: E731
    glucose = _read(name("GLU"), ["LBXGLU", weight]).rename(columns={weight: "fasting_weight"})
    df = (
        _read(name("DEMO"), ["RIDAGEYR", "RIAGENDR", "RIDRETH3"])
        .join(_read(name("GHB"), ["LBXGH"]))
        .join(glucose)
        .join(_read(name("INS"), ["LBXIN"]))
        .join(_read(name("BMX"), ["BMXBMI", "BMXWT", "BMXHT"]))
        .join(_read(name("BIOPRO"), ["LBXSCR"]))
        .join(_read(name("DIQ"), ["DIQ010", "DIQ050", "DIQ070"]))
    )
    df["fasting_weight"] = df["fasting_weight"] * years
    rx = pd.read_sas(NHANES_DIR / f"{name('RXQ_RX')}.xpt", format="xport", encoding="latin-1")
    drug = rx["RXDDRUG"].fillna("").astype(str).str.upper()
    has = lambda text: rx.loc[drug.str.contains(text), "SEQN"].unique()  # noqa: E731
    df["on_metformin"] = df.index.isin(has("METFORMIN"))
    df["on_insulin_rx"] = df.index.isin(has("INSULIN"))
    df["on_other_agent"] = df.index.isin(has(_OTHER_AGENTS))
    return df


def load_labs() -> pd.DataFrame:
    """Adults with diabetes, complete labs, not on insulin. One row per real participant.

    Cycles with missing files are skipped, so the published 2017-2020 cycle alone still works.
    """
    frames = [_load_cycle(*c) for c in CYCLES if (NHANES_DIR / f"{c[0]}GHB{c[1]}.xpt").exists()]
    if not frames:
        raise FileNotFoundError("no NHANES files found; run scripts/fetch_data.py")
    df = pd.concat(frames)

    adult = df["RIDAGEYR"] >= 18
    diabetic = (df["DIQ010"] == 1) | (df["LBXGH"] >= 6.5) | (df["LBXGLU"] >= 126)
    no_insulin = (df["DIQ050"] != 1) & ~df["on_insulin_rx"]
    required = ["LBXGH", "LBXGLU", "LBXIN", "BMXBMI", "BMXWT", "BMXHT", "LBXSCR"]
    labs = df[adult & diabetic & no_insulin].dropna(subset=required).copy()
    labs = labs[labs["LBXIN"].between(*INSULIN_RANGE)]
    labs["female"] = labs["RIAGENDR"] == 2
    labs["egfr"] = ph.egfr_ckd_epi_2021(labs["LBXSCR"].to_numpy(), labs["RIDAGEYR"].to_numpy(), labs["female"].to_numpy())
    labs = labs[labs["egfr"] >= EGFR_MIN]
    # Absolute GFR for the renal load: Du Bois body surface area
    bsa = 0.007184 * labs["BMXWT"] ** 0.425 * labs["BMXHT"] ** 0.725
    labs["gfr"] = labs["egfr"] * bsa / 1.73
    labs["on_oral_agent"] = labs["DIQ070"] == 1
    labs["naive"] = ~labs["on_oral_agent"] & ~labs["on_metformin"] & ~labs["on_other_agent"]
    return labs


@dataclass
class Cohort:
    """Arrays with one element per virtual patient."""
    n: int
    age: np.ndarray
    female: np.ndarray
    bmi: np.ndarray
    weight: np.ndarray
    egfr: np.ndarray
    gfr: np.ndarray
    fpg: np.ndarray
    insulin: np.ndarray
    a1c: np.ndarray
    hgp: np.ndarray
    si: np.ndarray
    secretion: np.ndarray
    meal: np.ndarray
    glycation_gap: np.ndarray  # model residual per patient, not a measured quantity
    resp_hgp: np.ndarray
    resp_renal: np.ndarray
    resp_incretin: np.ndarray
    resp_candidate: np.ndarray
    sema_clearance: np.ndarray


def invert_twin(fpg: np.ndarray, insulin: np.ndarray, a1c: np.ndarray, weight: np.ndarray, gfr: np.ndarray, hgp: np.ndarray, p: dict[str, float]) -> dict[str, np.ndarray]:
    """Parameters that reproduce a participant's labs exactly at steady state.

    Fasting: k I = S G^2 / (alpha + G^2) gives S; H - renal = (E + SI I) G gives SI.
    Fed state: the meal term is whatever makes mean glucose match the ADAG value for this HbA1c.
    Where fasting glucose already exceeds that mean, the excursion is kept minimal and the difference
    becomes a per-patient residual, so measured HbA1c is still reproduced exactly. That residual
    absorbs model error as well as any real glycation difference, so it is not a measurement.
    """
    secretion = p["k"] * insulin * (p["alpha"] + fpg**2) / fpg**2
    threshold = np.full_like(fpg, p["rtg0"])
    renal_fast = ph.renal_excretion_rate(fpg, threshold, gfr, weight, p)
    # Raise hepatic output where needed so sensitivity stays positive at very high fasting glucose.
    floor = (p["E"] + 0.01 * insulin) * fpg + renal_fast
    hgp = np.maximum(hgp, floor)
    si = (hgp - renal_fast - p["E"] * fpg) / (insulin * fpg)

    w = p["frac_fasting"]
    mean_g = ph.mean_glucose_from_a1c(a1c, p)
    g_fed = np.maximum((mean_g - w * fpg) / (1 - w), fpg * 1.02)
    i_fed = ph.insulin_from_glucose(g_fed, secretion, p)
    renal_fed = ph.renal_excretion_rate(g_fed, threshold, gfr, weight, p)
    meal = np.maximum((p["E"] + si * i_fed) * g_fed + renal_fed - hgp, 1.0)
    # The meal floor can move fed glucose, so read it back from the balance before computing the gap.
    fed = ph.Balance(hgp + meal, si, secretion, threshold, gfr, weight)
    g_fed_actual = ph.solve_glucose(fed, p, g_fed)
    gap = a1c - ph.a1c_from_mean_glucose(ph.mean_glucose(fpg, g_fed_actual, p), p)
    return {"secretion": secretion, "si": si, "hgp": hgp, "meal": meal, "glycation_gap": gap}


def entropy_weights(features: np.ndarray, targets: np.ndarray, base: np.ndarray | None = None, ridge: float = 1e-3) -> np.ndarray:
    """Entropy balancing (Hainmueller 2012): least-distorting weights whose means hit `targets`.

    Solved through its convex dual. A published baseline may be unreachable from a small pool, so
    a small ridge keeps the problem well posed and the caller should report remaining imbalance.
    """
    if features.shape[1] != len(targets):
        raise ValueError("one target per feature column is required")
    scale = features.std(axis=0)
    scale[scale == 0] = 1.0
    z = (features - targets) / scale
    q = np.full(len(z), 1 / len(z)) if base is None else base / base.sum()

    def dual(lam: np.ndarray) -> tuple[float, np.ndarray]:
        exponent = z @ lam
        shift = exponent.max()
        w = q * np.exp(exponent - shift)
        total = w.sum()
        return float(np.log(total) + shift + 0.5 * ridge * lam @ lam), (w / total) @ z + ridge * lam

    result = minimize(dual, np.zeros(z.shape[1]), jac=True, method="BFGS", options={"maxiter": 500, "gtol": 1e-6})
    exponent = z @ result.x
    w = q * np.exp(exponent - exponent.max())
    return w / w.sum()


@dataclass(frozen=True)
class Criteria:
    """Inclusion rules and published baseline means of a trial."""
    a1c_range: tuple[float, float] = (7.0, 10.0)
    bmi_max: float = 60.0
    bmi_min: float = 0.0
    egfr_range: tuple[float, float] = (30.0, 400.0)
    weight_range: tuple[float, float] = (0.0, 500.0)
    age_range: tuple[float, float] = (18.0, 100.0)
    background: str = "any"  # any, naive, metformin, metformin_only or metformin_or_none
    fpg_max: float = 10000.0  # mg/dL
    target_a1c: float | None = None
    target_fpg: float | None = None  # mg/dL
    target_weight: float | None = None
    target_age: float | None = None
    target_a1c_sd: float | None = None
    min_pool: int = 25  # below this a trial is refused; lowered only with a stated reason


def eligible(labs: pd.DataFrame, c: Criteria) -> pd.DataFrame:
    mask = (
        labs["LBXGH"].between(*c.a1c_range) & labs["RIDAGEYR"].between(*c.age_range)
        & labs["BMXBMI"].between(c.bmi_min, c.bmi_max) & labs["egfr"].between(*c.egfr_range)
        & labs["BMXWT"].between(*c.weight_range) & (labs["LBXGLU"] <= c.fpg_max)
    )
    if c.background == "naive":
        mask &= labs["naive"]
    elif c.background == "metformin":
        mask &= labs["on_metformin"]
    elif c.background == "metformin_only":
        mask &= labs["on_metformin"] & ~labs["on_other_agent"]
    elif c.background == "metformin_or_none":
        mask &= ~labs["on_other_agent"]
    elif c.background != "any":
        raise ValueError(f"unknown background {c.background}")
    return labs[mask]


def enroll(labs: pd.DataFrame, c: Criteria, n: int, p: dict[str, float], seed: int, bootstrap_pool: bool = False) -> tuple[Cohort, dict]:
    """Sample a trial population from eligible real participants, matched to published baseline.

    `bootstrap_pool` resamples the eligible people first, which carries the uncertainty of having
    so few real participants into a prediction interval.
    """
    pool = eligible(labs, c)
    if len(pool) < c.min_pool:
        raise ValueError(f"only {len(pool)} eligible NHANES participants; relax the criteria")
    rng = np.random.default_rng(seed)
    eligible_count = len(pool)
    if bootstrap_pool:
        pool = pool.iloc[rng.integers(0, len(pool), len(pool))]

    columns, targets = [], []
    for column, target in (("LBXGH", c.target_a1c), ("LBXGLU", c.target_fpg), ("BMXWT", c.target_weight), ("RIDAGEYR", c.target_age)):
        if target is not None:
            columns.append(pool[column].to_numpy(float))
            targets.append(target)
    survey = pool["fasting_weight"].fillna(pool["fasting_weight"].median()).clip(lower=1.0).to_numpy(float)
    if columns:
        features = np.column_stack(columns)
        weights = entropy_weights(features, np.array(targets), base=survey)
    else:
        weights = survey / survey.sum()

    pick = rng.choice(len(pool), size=n, p=weights)
    row = pool.iloc[pick]
    jitter = lambda sd, m=n: rng.normal(0, sd, m)  # noqa: E731  smooth bootstrap, so repeats are not clones
    fpg = np.maximum(row["LBXGLU"].to_numpy(float) * np.exp(jitter(0.04)), 60.0)
    insulin = np.maximum(row["LBXIN"].to_numpy(float) * np.exp(jitter(0.08)), 1.0)
    a1c = np.maximum(row["LBXGH"].to_numpy(float) + jitter(0.12), 4.5)
    weight = row["BMXWT"].to_numpy(float) * np.exp(jitter(0.015))
    gfr = row["gfr"].to_numpy(float) * np.exp(jitter(0.04))
    egfr = row["egfr"].to_numpy(float) * np.exp(jitter(0.04))
    # Hepatic output rises with fasting glucose above about 140 mg/dL (DeFronzo 1989). Without this every
    # glucose difference would land on insulin sensitivity, and benefit would fall with baseline HbA1c.
    hgp = p["R0"] * (1 + p["hgp_fpg_slope"] * np.maximum(fpg - 140.0, 0.0) / 100.0) * np.exp(rng.normal(0, 0.10, n))
    twin = invert_twin(fpg, insulin, a1c, weight, gfr, hgp, p)
    iiv = p["pd_iiv"]
    response = lambda: np.exp(rng.normal(-0.5 * iiv**2, iiv, n))  # noqa: E731  mean 1 across patients

    cohort = Cohort(
        n=n, age=row["RIDAGEYR"].to_numpy(float), female=row["female"].to_numpy(bool),
        bmi=row["BMXBMI"].to_numpy(float), weight=weight, egfr=egfr, gfr=gfr, fpg=fpg, insulin=insulin,
        a1c=a1c, hgp=twin["hgp"], si=twin["si"], secretion=twin["secretion"], meal=twin["meal"],
        glycation_gap=twin["glycation_gap"],
        resp_hgp=response(), resp_renal=response(), resp_incretin=response(), resp_candidate=response(),
        sema_clearance=np.exp(rng.normal(0, p["sema_iiv"], n)),
    )
    ess = float(1.0 / np.sum(weights**2))
    report = {
        "eligible_real_participants": eligible_count, "effective_sample_size": round(ess, 1), "thin_pool": eligible_count < THIN_POOL,
        "matched": {"a1c": round(float(cohort.a1c.mean()), 2), "fpg": round(float(cohort.fpg.mean()), 1),
                    "weight": round(float(cohort.weight.mean()), 1), "age": round(float(cohort.age.mean()), 1),
                    "egfr": round(float(cohort.egfr.mean()), 1)},
        "targets": {"a1c": c.target_a1c, "fpg": c.target_fpg, "weight": c.target_weight, "age": c.target_age},
    }
    return cohort, report


def subset(cohort: Cohort, mask: np.ndarray) -> Cohort:
    """A cohort restricted to `mask`, keeping every array aligned."""
    fields = {k: v[mask] if isinstance(v, np.ndarray) else v for k, v in vars(cohort).items()}
    fields["n"] = int(mask.sum())
    return replace(cohort, **fields)
