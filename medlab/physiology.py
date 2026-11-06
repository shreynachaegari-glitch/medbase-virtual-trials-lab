"""Fast glucose-insulin balance built on Topp 2000, solved at quasi-steady state."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

_DL_PER_DAY_PER_ML_MIN = 14.4  # 1 mL/min = 1440 mL/day = 14.4 dL/day


def topp_rhs(y: np.ndarray, p: dict[str, float]) -> np.ndarray:
    """Full three-state Topp model [G, I, beta]; used for the BioModels cross-check."""
    g, i, b = y
    return np.array([
        p["R0"] - (p["E"] + p["SI"] * i) * g,
        b * p["sigma"] * g**2 / (p["alpha"] + g**2) - p["k"] * i,
        (-p["d0"] + p["r1"] * g - p["r2"] * g**2) * b,
    ])


def insulin_from_glucose(g: np.ndarray, secretion: np.ndarray, p: dict[str, float]) -> np.ndarray:
    return secretion * g**2 / (p["alpha"] + g**2) / p["k"]


def renal_excretion_rate(g: np.ndarray, threshold: np.ndarray, gfr: np.ndarray, weight: np.ndarray, p: dict[str, float]) -> np.ndarray:
    """Urinary glucose loss as a plasma rate (mg/dL/day): filtered load above the renal threshold."""
    excess = np.maximum(g - threshold, 0.0)
    return gfr * _DL_PER_DAY_PER_ML_MIN * excess / (p["Vg"] * weight)


def urinary_glucose_g_per_day(g: np.ndarray, threshold: np.ndarray, gfr: np.ndarray) -> np.ndarray:
    return gfr * _DL_PER_DAY_PER_ML_MIN * np.maximum(g - threshold, 0.0) / 1000.0


@dataclass(frozen=True)
class Balance:
    """Inputs of the glucose balance, one array element per patient."""
    production: np.ndarray  # hepatic output plus meal appearance, mg/dL/day
    si: np.ndarray
    secretion: np.ndarray  # beta mass times sigma, uU/mL/day
    threshold: np.ndarray
    gfr: np.ndarray
    weight: np.ndarray
    renal_net_fraction: np.ndarray | float = 1.0  # share of urinary loss not offset by raised EGP


def _residual_and_slope(g: np.ndarray, b: Balance, p: dict[str, float]) -> tuple[np.ndarray, np.ndarray]:
    a, k = p["alpha"], p["k"]
    hill = g**2 / (a + g**2)
    dhill = 2 * g * a / (a + g**2) ** 2
    i = b.secretion * hill / k
    di = b.secretion * dhill / k
    renal_coef = b.renal_net_fraction * b.gfr * _DL_PER_DAY_PER_ML_MIN / (p["Vg"] * b.weight)
    above = g > b.threshold
    residual = b.production - (p["E"] + b.si * i) * g - renal_coef * np.where(above, g - b.threshold, 0.0)
    slope = -(p["E"] + b.si * i) - b.si * di * g - renal_coef * above
    return residual, slope


def solve_glucose(b: Balance, p: dict[str, float], guess: np.ndarray | None = None, tol: float = 1e-6, max_iter: int = 60) -> np.ndarray:
    """Root of the glucose balance for each patient.

    Production is constant and disposal rises strictly with glucose, so each patient has exactly
    one root. Disposal is at least E * G, so the root lies in (0, production / E]; that bracket is
    valid for every patient, and Newton stays inside it as it shrinks.
    """
    if np.any(b.production <= 0):
        raise ValueError("glucose production must be positive")
    lo = np.zeros_like(b.production, dtype=float)
    hi = b.production / p["E"]
    g = np.clip(guess, lo, hi) if guess is not None else np.minimum(np.full_like(hi, 150.0), hi)
    for _ in range(max_iter):
        residual, slope = _residual_and_slope(g, b, p)
        lo = np.where(residual > 0, g, lo)
        hi = np.where(residual <= 0, g, hi)
        step = g - residual / slope
        outside = (step <= lo) | (step >= hi)
        g_new = np.where(outside, 0.5 * (lo + hi), step)
        if np.max(np.abs(g_new - g)) < tol:
            return g_new
        g = g_new
    residual, _ = _residual_and_slope(g, b, p)
    worst = float(np.max(np.abs(residual)))
    if worst > 1e-2:
        raise ArithmeticError(f"glucose solve did not converge; worst residual {worst:.3g}")
    return g


def mean_glucose(g_fast: np.ndarray, g_fed: np.ndarray, p: dict[str, float]) -> np.ndarray:
    w = p["frac_fasting"]
    return w * g_fast + (1 - w) * g_fed


def a1c_from_mean_glucose(g_mean: np.ndarray, p: dict[str, float]) -> np.ndarray:
    return (g_mean - p["adag_intercept"]) / p["adag_slope"]


def mean_glucose_from_a1c(a1c: np.ndarray, p: dict[str, float]) -> np.ndarray:
    return p["adag_slope"] * a1c + p["adag_intercept"]


def egfr_ckd_epi_2021(scr: np.ndarray, age: np.ndarray, female: np.ndarray) -> np.ndarray:
    """CKD-EPI 2021 race-free creatinine equation (Inker et al., NEJM 2021)."""
    kappa = np.where(female, 0.7, 0.9)
    alpha = np.where(female, -0.241, -0.302)
    ratio = scr / kappa
    return 142 * np.minimum(ratio, 1) ** alpha * np.maximum(ratio, 1) ** -1.2 * 0.9938**age * np.where(female, 1.012, 1.0)
