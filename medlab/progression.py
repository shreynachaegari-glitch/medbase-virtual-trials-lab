"""Disease progression module, kept separate from the drug-trial engine.

From the MedBase T2D foundation package (medbase-t2d-virtual-lab). Independent Python implementation of a published human T2D pathogenesis model.

Scientific basis:
  Ha J, Satin LS, Sherman AS. Endocrinology. 2016;157(2):624-635.
  DOI: 10.1210/en.2015-1564

The parameter preset below reproduces the authors' Figure 7 human-early parameter set
from their public supplementary model archive. This module does not vendor or execute
the original XPPAUT file. It implements the published state equations independently.

Important scope:
  * This is a mechanistic research/education model, not a patient digital twin.
  * The parameter preset reproduces one published model scenario; it is not a clinical
    population calibration and cannot predict an individual's course.
  * Intervention controls perturb insulin sensitivity (Si). They are not drug doses,
    treatment recommendations, or evidence of a specific intervention's efficacy.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import scipy
from scipy.integrate import solve_ivp


MODEL_ID = "ha-satin-sherman-t2d-human-2016-fig7"
MODEL_VERSION = "0.1.0"
SOLVER_METHOD = "BDF"
SOLVER_RTOL = 1e-9
SOLVER_ATOL = 1e-9
SOLVER_MAX_STEP_DAYS = 10.0
MODEL_REFERENCE = {
    "authors": "Ha J, Satin LS, Sherman AS",
    "title": "A Mathematical Model of the Pathogenesis, Prevention, and Reversal of Type 2 Diabetes",
    "journal": "Endocrinology",
    "year": 2016,
    "volume": "157(2)",
    "pages": "624-635",
    "doi": "10.1210/en.2015-1564",
    "pmid": "26709417",
    "pmcid": "PMC4733125",
    "supplementary_model": "https://github.com/artielbm/artielbm.github.io/tree/master/Models/Pathogenesis",
    "parameter_preset": "fig7_human_early.set",
}


@dataclass(frozen=True)
class T2DParameters:
    # Parameters transcribed from the authors' Figure 7 human-early parameter set.
    eg0: float = 1.44
    insulin_clearance: float = 700.0
    glucose_appearance: float = 864.0
    beta_volume: float = 5.0

    m_max: float = 1.0
    alpha_m: float = 150.0
    k_m: float = 2.0
    alpha_isr: float = 1.2
    k_isr: float = 2.0

    p_max: float = 4.55
    k_p: float = 4.0
    alpha_p: float = 41.77
    a_max: float = 9.0
    alpha_a: float = 0.44
    k_a: float = 6.0
    a_b: float = 0.8
    tau_b: float = 8570.0

    g_bar: float = 0.2
    g_s: float = 99.9
    g_n: float = 1.0
    g_shift: float = 0.1
    tau_gamma: float = 2.14

    sigma_g_shift: float = 75.0
    isri_bar: float = 600.0
    isri_s: float = 0.1
    isri_n: float = 0.1
    isri_k: float = 1.0
    sigma_b: float = 3.0
    mi_bar: float = 1.0
    mi_k: float = 0.2
    mi_s: float = 0.2
    mi_n: float = 0.02
    tau_sigma: float = 249.9

    # Figure-specific insulin-sensitivity forcing.
    si_rate_before: float = 0.00756
    si_target_before: float = 0.18
    si_rate_after: float = 0.014
    si_target_after: float = 0.468


@dataclass(frozen=True)
class T2DInitialState:
    glucose_mg_dl: float = 99.7664
    insulin_model_state: float = 9.025
    beta_cell_state: float = 1000.423
    gamma_state: float = -0.00666
    sigma_state: float = 536.67
    insulin_sensitivity: float = 0.8

    def vector(self) -> np.ndarray:
        return np.asarray(
            [
                self.glucose_mg_dl,
                self.insulin_model_state,
                self.beta_cell_state,
                self.gamma_state,
                self.sigma_state,
                self.insulin_sensitivity,
            ],
            dtype=float,
        )


@dataclass(frozen=True)
class SimulationConfig:
    horizon_days: int = 1800
    intervention_day: int = 1100
    target_si_before: float = 0.18
    target_si_after: float = 0.468
    si_rate_before: float = 0.00756
    si_rate_after: float = 0.014
    output_interval_days: int = 1

    def validate(self) -> None:
        if not 1 <= self.horizon_days <= 3650:
            raise ValueError("horizon_days must be between 1 and 3650")
        if not 0 <= self.intervention_day <= self.horizon_days:
            raise ValueError("intervention_day must fall within the simulation horizon")
        for name, value in (
            ("target_si_before", self.target_si_before),
            ("target_si_after", self.target_si_after),
        ):
            if not 0.01 <= value <= 1.5:
                raise ValueError(f"{name} must be between 0.01 and 1.5")
        for name, value in (
            ("si_rate_before", self.si_rate_before),
            ("si_rate_after", self.si_rate_after),
        ):
            if not 0.0001 <= value <= 0.1:
                raise ValueError(f"{name} must be between 0.0001 and 0.1")
        if not 1 <= self.output_interval_days <= 30:
            raise ValueError("output_interval_days must be between 1 and 30")


def _sigmoid(value: float) -> float:
    # Numerically stable sigmoid with the same practical behavior over the model range.
    z = float(np.clip(value, -80.0, 80.0))
    return 1.0 / (1.0 + np.exp(-z))


def _derived_states(y: np.ndarray, p: T2DParameters) -> dict[str, float]:
    glucose, _insulin, _beta, gamma, sigma, _si = map(float, y)
    m = p.m_max * glucose**p.k_m / (p.alpha_m**p.k_m + glucose**p.k_m)
    isr = sigma * (m + gamma) ** p.k_isr / (
        p.alpha_isr**p.k_isr + (m + gamma) ** p.k_isr
    )
    p_isr = p.p_max * isr**p.k_p / (p.alpha_p**p.k_p + isr**p.k_p)
    a_m = p.a_max * m**p.k_a / (p.alpha_a**p.k_a + m**p.k_a) + p.a_b
    return {"metabolic_rate": float(m), "insulin_secretion_rate": float(isr),
            "beta_cell_proliferation": float(p_isr), "beta_cell_apoptosis": float(a_m)}


def _rhs(
    _time_days: float,
    y: np.ndarray,
    p: T2DParameters,
    target_si: float,
    si_rate: float,
) -> list[float]:
    glucose, insulin, beta, gamma, sigma, si = map(float, y)

    d = _derived_states(y, p)
    m = d["metabolic_rate"]
    isr = d["insulin_secretion_rate"]
    proliferation = d["beta_cell_proliferation"]
    apoptosis = d["beta_cell_apoptosis"]

    gamma_inf = p.g_bar * _sigmoid((glucose - p.g_s) / p.g_n) - p.g_shift

    shifted_m_glucose = glucose - p.sigma_g_shift
    m_shifted = p.m_max * shifted_m_glucose**p.k_m / (
        p.alpha_m**p.k_m + shifted_m_glucose**p.k_m
    )
    isr_shifted = sigma * (m_shifted + gamma) ** p.k_isr / (
        p.alpha_isr**p.k_isr + (m_shifted + gamma) ** p.k_isr
    )

    sigma_isri = p.isri_bar / (
        1.0 + p.isri_k * np.exp(np.clip(-(isr_shifted - p.isri_s) / p.isri_n, -80, 80))
    )
    sigma_mi = 1.0 - p.mi_bar / (
        1.0 + p.mi_k * np.exp(np.clip(-(m_shifted - p.mi_s) / p.mi_n, -80, 80))
    )
    sigma_inf = sigma_mi * sigma_isri + p.sigma_b

    return [
        p.glucose_appearance - (p.eg0 + si * insulin) * glucose,
        beta * isr / p.beta_volume - p.insulin_clearance * insulin,
        (proliferation - apoptosis) * beta / p.tau_b,
        (gamma_inf - gamma) / p.tau_gamma,
        (sigma_inf - sigma) / p.tau_sigma,
        -si_rate * (si - target_si),
    ]


def _integrate_segment(
    start: float,
    end: float,
    y0: np.ndarray,
    t_eval: np.ndarray,
    p: T2DParameters,
    target_si: float,
    si_rate: float,
) -> tuple[np.ndarray, np.ndarray]:
    if end <= start:
        return np.asarray([], dtype=float), np.empty((6, 0), dtype=float)
    keep = (t_eval >= start - 1e-10) & (t_eval <= end + 1e-10)
    eval_segment = t_eval[keep]
    if eval_segment.size == 0 or eval_segment[0] > start + 1e-10:
        eval_segment = np.insert(eval_segment, 0, start)
    if eval_segment[-1] < end - 1e-10:
        eval_segment = np.append(eval_segment, end)

    sol = solve_ivp(
        lambda t, y: _rhs(t, y, p, target_si, si_rate),
        (start, end),
        y0,
        method=SOLVER_METHOD,
        t_eval=eval_segment,
        rtol=SOLVER_RTOL,
        atol=SOLVER_ATOL,
        max_step=SOLVER_MAX_STEP_DAYS,
    )
    if not sol.success:
        raise RuntimeError(f"ODE solver failed: {sol.message}")
    return sol.t, sol.y


def simulate_t2d(
    config: SimulationConfig | None = None,
    params: T2DParameters | None = None,
    initial: T2DInitialState | None = None,
) -> dict[str, Any]:
    """Run one mechanistic virtual experiment and return model state trajectories."""
    config = config or SimulationConfig()
    params = params or T2DParameters()
    initial = initial or T2DInitialState()
    config.validate()

    interval = config.output_interval_days
    requested_times = np.arange(0, config.horizon_days + 1, interval, dtype=float)
    if requested_times[-1] < config.horizon_days:
        requested_times = np.append(requested_times, float(config.horizon_days))

    # Split at the discontinuity. This avoids asking an adaptive solver to step across
    # a sudden intervention change and makes the event day explicit in the time series.
    day = float(config.intervention_day)
    first_times = requested_times[requested_times <= day]
    second_times = requested_times[requested_times >= day]
    if first_times.size == 0:
        first_times = np.asarray([0.0])
    if second_times.size == 0:
        second_times = np.asarray([float(config.horizon_days)])
    if first_times[-1] < day:
        first_times = np.append(first_times, day)
    if second_times[0] > day:
        second_times = np.insert(second_times, 0, day)

    t1, y1 = _integrate_segment(
        0.0, day, initial.vector(), first_times, params,
        config.target_si_before, config.si_rate_before,
    )
    y_at_event = y1[:, -1] if y1.shape[1] else initial.vector()

    if config.horizon_days > day:
        t2, y2 = _integrate_segment(
            day, float(config.horizon_days), y_at_event, second_times, params,
            config.target_si_after, config.si_rate_after,
        )
        skip_duplicate = 1 if t1.size else 0  # with a day-0 intervention there is no first segment to overlap
        times = np.concatenate([t1, t2[skip_duplicate:]])
        states = np.concatenate([y1, y2[:, skip_duplicate:]], axis=1)
    else:
        times, states = t1, y1

    # Numerical integration can include explicit event endpoints; sort/deduplicate.
    order = np.argsort(times)
    times = times[order]
    states = states[:, order]
    unique_times, unique_indices = np.unique(np.round(times, 10), return_index=True)
    states = states[:, unique_indices]

    rows: list[dict[str, float]] = []
    for idx, t in enumerate(unique_times):
        state = states[:, idx]
        derived = _derived_states(state, params)
        rows.append({
            "day": float(t),
            "year": float(t / 365.25),
            "glucose_mg_dl": float(state[0]),
            "insulin_model_state": float(state[1]),
            "beta_cell_state": float(state[2]),
            "gamma_state": float(state[3]),
            "sigma_state": float(state[4]),
            "insulin_sensitivity": float(state[5]),
            **derived,
        })

    glucose_values = [r["glucose_mg_dl"] for r in rows]
    event_row = min(rows, key=lambda r: abs(r["day"] - config.intervention_day))
    final = rows[-1]
    return {
        "model_id": MODEL_ID,
        "model_version": MODEL_VERSION,
        "reference": MODEL_REFERENCE,
        "config": asdict(config),
        "model_parameters": asdict(params),
        "initial_state": asdict(initial),
        "solver": {
            "method": SOLVER_METHOD,
            "rtol": SOLVER_RTOL,
            "atol": SOLVER_ATOL,
            "max_step_days": SOLVER_MAX_STEP_DAYS,
            "scipy_version": scipy.__version__,
            "numpy_version": np.__version__,
        },
        "time_unit": "days",
        "state_unit_notes": {
            "glucose_mg_dl": "mg/dL, as represented by the published model state",
            "insulin_model_state": "source-model state; unit not normalized here",
            "beta_cell_state": "relative/source-model state; not a measured cell count",
            "gamma_state": "dimensionless/source-model state",
            "sigma_state": "source-model secretory-capacity state",
            "insulin_sensitivity": "source-model parameter/state (Si)",
        },
        "summary": {
            "initial_glucose_mg_dl": rows[0]["glucose_mg_dl"],
            "glucose_at_intervention_mg_dl": event_row["glucose_mg_dl"],
            "final_glucose_mg_dl": final["glucose_mg_dl"],
            "min_glucose_mg_dl": float(min(glucose_values)),
            "max_glucose_mg_dl": float(max(glucose_values)),
            "final_insulin_sensitivity": final["insulin_sensitivity"],
            "final_beta_cell_state": final["beta_cell_state"],
            "horizon_days": config.horizon_days,
        },
        "trajectory": rows,
        "limitations": [
            "Mechanistic model reproduction, not a clinically validated individual digital twin.",
            "The baseline preset reproduces one published Figure 7 human model scenario.",
            "Changing intervention timing or Si targets creates an exploratory model perturbation, not a drug effect estimate.",
            "No pharmacokinetics, drug exposure, adherence, adverse-event, comorbidity, or competing-risk model is included.",
        ],
    }


def model_metadata() -> dict[str, Any]:
    return {
        "model_id": MODEL_ID,
        "version": MODEL_VERSION,
        "name": "Ha–Satin–Sherman Type 2 diabetes pathogenesis model (human Figure 7 preset)",
        "scope": "Mechanistic glucose, insulin, beta-cell and insulin-sensitivity dynamics",
        "reference": MODEL_REFERENCE,
        "default_parameters": asdict(T2DParameters()),
        "initial_state": asdict(T2DInitialState()),
        "default_experiment": asdict(SimulationConfig()),
        "validation_target": {
            "day": 1800,
            "glucose_mg_dl": 104.0787909256388,
            "insulin_model_state": 14.66191678911286,
            "beta_cell_state": 854.7991010481144,
            "gamma_state": 0.09707400622592101,
            "sigma_state": 545.3436604478447,
            "insulin_sensitivity": 0.4679840352312949,
            "source": "fig7_human_early.set ending state in the authors' supplementary model archive",
        },
    }


GLUCOSE_DIABETES_THRESHOLD = 126.0  # mg/dL; the usual fasting threshold, applied here to a model state


def threshold_events(rows: list[dict[str, float]]) -> dict[str, float | None]:
    """First day the model's glucose crosses the threshold, and the first day it returns below it."""
    onset = next((r["day"] for r in rows if r["glucose_mg_dl"] >= GLUCOSE_DIABETES_THRESHOLD), None)
    recovery = None
    if onset is not None:
        recovery = next((r["day"] for r in rows if r["day"] > onset and r["glucose_mg_dl"] < GLUCOSE_DIABETES_THRESHOLD), None)
    return {"crossed_threshold_day": onset, "returned_below_day": recovery}
