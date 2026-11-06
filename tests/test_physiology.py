import numpy as np
import pytest
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

from medlab import params, physiology as ph

P = params.defaults()


def _balance(prod, si=0.3, sec=12000.0, thr=240.0, gfr=90.0, w=90.0, net=1.0):
    return ph.Balance(np.atleast_1d(float(prod)), np.atleast_1d(float(si)), np.atleast_1d(float(sec)),
                      np.atleast_1d(float(thr)), np.atleast_1d(float(gfr)), np.atleast_1d(float(w)), net)


@pytest.mark.parametrize("prod,thr", [(864, 240), (1500, 240), (1500, 90), (500, 60), (3000, 90)])
def test_solver_matches_brentq(prod, thr):
    b = _balance(prod, thr=thr)
    got = ph.solve_glucose(b, P)[0]

    def f(g):
        g = np.atleast_1d(g)
        i = ph.insulin_from_glucose(g, b.secretion, P)
        return (b.production - (P["E"] + b.si * i) * g - ph.renal_excretion_rate(g, b.threshold, b.gfr, b.weight, P))[0]

    assert got == pytest.approx(brentq(f, 1e-6, 1e5), abs=1e-4)


def test_solver_is_vectorised_and_converges_across_extremes():
    n = 5000
    rng = np.random.default_rng(0)
    b = ph.Balance(rng.uniform(300, 4000, n), rng.uniform(0.01, 2, n), rng.uniform(200, 60000, n),
                   rng.uniform(40, 300, n), rng.uniform(15, 150, n), rng.uniform(40, 200, n), rng.uniform(0.1, 1, n))
    g = ph.solve_glucose(b, P)
    res, _ = ph._residual_and_slope(g, b, P)
    assert np.all(np.abs(res) < 1e-3)


def test_near_zero_secretion_is_not_silently_capped():
    # A failing pancreas gives glucose far above any fixed cap; the true root must still be found.
    g = ph.solve_glucose(_balance(4000, si=0.01, sec=1.0, thr=240, gfr=90), P)[0]
    res, _ = ph._residual_and_slope(np.atleast_1d(g), _balance(4000, si=0.01, sec=1.0, thr=240, gfr=90), P)
    assert abs(res[0]) < 1e-3


def test_lower_threshold_lowers_glucose_and_lower_gfr_weakens_it():
    high_gfr = ph.solve_glucose(_balance(1500, thr=240, gfr=90), P)[0] - ph.solve_glucose(_balance(1500, thr=90, gfr=90), P)[0]
    low_gfr = ph.solve_glucose(_balance(1500, thr=240, gfr=40), P)[0] - ph.solve_glucose(_balance(1500, thr=90, gfr=40), P)[0]
    assert high_gfr > low_gfr > 0


def test_adag_round_trip_and_published_anchor():
    assert ph.mean_glucose_from_a1c(np.array(7.0), P) == pytest.approx(154.2, abs=0.01)  # ADAG table: 7% is 154 mg/dL
    assert ph.a1c_from_mean_glucose(ph.mean_glucose_from_a1c(np.array(8.3), P), P) == pytest.approx(8.3)


def test_egfr_published_examples():
    # 50-year-old, creatinine 1.0: about 91 (male); female higher at the same creatinine is not expected
    male = ph.egfr_ckd_epi_2021(np.array(1.0), np.array(50), np.array(False))
    female = ph.egfr_ckd_epi_2021(np.array(1.0), np.array(50), np.array(True))
    assert 88 < male < 95 and 65 < female < 72


def test_topp_core_matches_biomodels_sbml_in_independent_solver():
    """Check V1: our right-hand side against BIOMD0000000341 in libRoadRunner."""
    roadrunner = pytest.importorskip("roadrunner")
    from pathlib import Path
    sbml = Path(__file__).resolve().parent.parent / "data" / "raw" / "biomodels" / "topp.xml"
    if not sbml.exists():
        pytest.skip("BioModels file not downloaded")
    rr = roadrunner.RoadRunner(str(sbml))
    y0 = [float(rr["[G]"]), float(rr["[I]"]), float(rr["[B]"])]
    t_end = 100.0
    rr_out = rr.simulate(0, t_end, 201, ["time", "[G]", "[I]", "[B]"])
    sol = solve_ivp(lambda _t, y: ph.topp_rhs(y, P), (0, t_end), y0, method="LSODA", rtol=1e-9, atol=1e-9, t_eval=rr_out[:, 0])
    assert sol.success
    rel = np.abs(sol.y.T - rr_out[:, 1:]) / np.maximum(np.abs(rr_out[:, 1:]), 1e-9)
    assert rel.max() < 0.01, f"max relative error {rel.max():.4f}"
