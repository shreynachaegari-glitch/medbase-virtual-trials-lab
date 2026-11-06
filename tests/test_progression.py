"""Ha-Satin-Sherman module, checked directly against the authors' own files rather than copied claims."""
import re
from pathlib import Path

import pytest

from medlab import progression as hss
from medlab.progression_scenarios import SCENARIOS

SET = Path(__file__).resolve().parent.parent / "data" / "raw" / "sherman" / "fig7_human_early.set"
FIELDS = {"Eg0": "eg0", "k": "insulin_clearance", "BV": "beta_volume", "Mmax": "m_max", "alpha_M": "alpha_m", "kM": "k_m", "alpha_ISR": "alpha_isr", "kISR": "k_isr",
          "Pmax": "p_max", "kP": "k_p", "alpha_P": "alpha_p", "Amax": "a_max", "alpha_A": "alpha_a", "kA": "k_a", "A_b": "a_b", "tau_b": "tau_b", "G_bar": "g_bar", "Gs": "g_s", "Gn": "g_n", "Gshft": "g_shift",
          "tau_g": "tau_gamma", "sigma_Gsh": "sigma_g_shift", "ISRI_bar": "isri_bar", "ISRI_s": "isri_s", "ISRI_n": "isri_n", "ISRI_k": "isri_k", "sigma_b": "sigma_b", "MI_bar": "mi_bar", "MI_k": "mi_k", "MI_s": "mi_s", "MI_n": "mi_n", "tau_sigma": "tau_sigma"}


def _set_values():
    if not SET.exists():
        pytest.skip("authors' set file not downloaded")
    values = {}
    section = None
    for line in SET.read_text().splitlines():
        if line.startswith("#"):
            section = line
            continue
        m = re.match(r"^(\S+)\s+(\S+)$", line.strip())
        if m:
            try:
                values[(section, m.group(2))] = float(m.group(1))
            except ValueError:
                pass
    return values


def test_every_parameter_matches_the_authors_set_file():
    values = _set_values()
    params = {name: value for (section, name), value in values.items() if section and "Parameters" in section}
    defaults = hss.T2DParameters()
    mismatched = {k: (params[k], getattr(defaults, f)) for k, f in FIELDS.items() if k in params and params[k] != pytest.approx(getattr(defaults, f), rel=1e-6)}
    missing = [k for k in FIELDS if k not in params]
    assert not mismatched, mismatched
    assert not missing, missing


def test_endpoint_reproduces_authors_final_state():
    values = _set_values()
    ending = {name: value for (section, name), value in values.items() if section and "Ending" in section}
    final = hss.simulate_t2d(SCENARIOS["published-figure7-reference"].config)["trajectory"][-1]
    assert final["day"] == 1800
    for key, field, tol in (("G", "glucose_mg_dl", 2e-3), ("I", "insulin_model_state", 2e-3), ("B", "beta_cell_state", 2e-2), ("GAMMA", "gamma_state", 2e-4), ("SIGMA", "sigma_state", 2e-2), ("SI", "insulin_sensitivity", 2e-4)):
        assert final[field] == pytest.approx(ending[key], abs=tol), key


def test_later_recovery_gives_worse_or_equal_glucose_at_the_end():
    early = hss.simulate_t2d(SCENARIOS["earlier-sensitivity-transition"].config)["summary"]["final_glucose_mg_dl"]
    none = hss.simulate_t2d(SCENARIOS["no-sensitivity-recovery-control"].config)["summary"]["final_glucose_mg_dl"]
    assert early < none


def test_threshold_events():
    rows = [{"day": 0.0, "glucose_mg_dl": 100}, {"day": 1.0, "glucose_mg_dl": 130}, {"day": 2.0, "glucose_mg_dl": 120}]
    assert hss.threshold_events(rows) == {"crossed_threshold_day": 1.0, "returned_below_day": 2.0}
    assert hss.threshold_events(rows[:1]) == {"crossed_threshold_day": None, "returned_below_day": None}


def test_bad_config_is_rejected():
    with pytest.raises(ValueError):
        hss.simulate_t2d(hss.SimulationConfig(horizon_days=100, intervention_day=500))


def test_day_zero_intervention_keeps_day_zero():
    rows = hss.simulate_t2d(hss.SimulationConfig(intervention_day=0, horizon_days=60, output_interval_days=5))["trajectory"]
    assert rows[0]["day"] == 0 and rows[0]["glucose_mg_dl"] == pytest.approx(99.7664)
