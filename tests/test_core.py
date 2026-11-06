"""Population and simulator tests. Uses real NHANES files when present."""
import numpy as np
import pytest

from medlab import drugs, params, physiology as ph, population as pop, simulate as sim

P = params.defaults()


@pytest.fixture(scope="module")
def labs():
    if not (pop.NHANES_DIR / "P_GHB.xpt").exists():
        pytest.skip("NHANES not downloaded")
    return pop.load_labs()


@pytest.fixture(scope="module")
def cohort(labs):
    c, _ = pop.enroll(labs, pop.Criteria(target_a1c=8.2), 400, P, seed=1)
    return c


def test_twin_inversion_reproduces_the_labs_it_came_from():
    fpg = np.array([130.0, 170.0, 240.0, 320.0])
    ins = np.array([10.0, 15.0, 12.0, 6.0])
    a1c = np.array([7.0, 8.0, 10.0, 12.0])
    w = np.array([80.0, 95.0, 70.0, 88.0])
    gfr = np.array([90.0, 60.0, 110.0, 45.0])
    t = pop.invert_twin(fpg, ins, a1c, w, gfr, np.full(4, 864.0), P)
    thr = np.full(4, P["rtg0"])
    got_fast = ph.solve_glucose(ph.Balance(t["hgp"], t["si"], t["secretion"], thr, gfr, w), P)
    got_fed = ph.solve_glucose(ph.Balance(t["hgp"] + t["meal"], t["si"], t["secretion"], thr, gfr, w), P)
    assert got_fast == pytest.approx(fpg, abs=1e-3)
    assert ph.insulin_from_glucose(got_fast, t["secretion"], P) == pytest.approx(ins, rel=1e-6)
    rebuilt = ph.a1c_from_mean_glucose(ph.mean_glucose(got_fast, got_fed, P), P) + t["glycation_gap"]
    assert rebuilt == pytest.approx(a1c, abs=1e-3)
    assert np.all(t["si"] > 0)


def test_entropy_weights_hit_reachable_targets():
    x = np.random.default_rng(0).normal(0, 1, (500, 2))
    w = pop.entropy_weights(x, np.array([0.5, -0.2]))
    assert (w @ x) == pytest.approx([0.5, -0.2], abs=0.01)
    assert w.sum() == pytest.approx(1)


def test_nhanes_pool_excludes_insulin_users_and_has_real_size(labs):
    assert len(labs) > 500
    assert not labs["on_insulin_rx"].any()
    assert (labs["DIQ050"] != 1).all()


def test_enrol_refuses_impossible_criteria(labs):
    with pytest.raises(ValueError, match="eligible"):
        pop.enroll(labs, pop.Criteria(a1c_range=(14.5, 15.0), age_range=(18, 19)), 100, P, 0)


def test_no_treatment_no_participation_holds_baseline_apart_from_slow_decline(cohort):
    p = dict(P, secretion_decline=0.0)
    t = sim.simulate(cohort, drugs.Regimen("none"), 26, p, participation=False)
    assert np.abs(t.fpg[-1] - cohort.fpg).max() < 0.05
    assert np.abs(t.a1c[-1] - cohort.a1c).max() < 0.02
    assert np.abs(t.weight[-1] - cohort.weight).max() < 0.01


def test_drugs_act_through_their_own_mechanism(cohort):
    weeks = 26
    base = sim.simulate(cohort, drugs.Regimen("pbo"), weeks, P)
    met = sim.simulate(cohort, drugs.Regimen("m", (drugs.Dose("metformin", 2000),)), weeks, P)
    empa = sim.simulate(cohort, drugs.Regimen("e", (drugs.Dose("empagliflozin", 25),)), weeks, P)
    sema = sim.simulate(cohort, drugs.Regimen("s", (drugs.Dose("semaglutide", 1.0),)), weeks, P)
    for t in (met, empa, sema):
        assert t.a1c[-1].mean() < base.a1c[-1].mean() - 0.1
    assert empa.uge_g_day[-1].mean() - empa.uge_g_day[0].mean() > 30
    assert met.uge_g_day[-1].mean() <= met.uge_g_day[0].mean()
    assert sema.insulin[-1].mean() > met.insulin[-1].mean()
    assert sema.weight[-1].mean() < base.weight[-1].mean()


def test_stopping_a_drug_wears_off(cohort):
    weeks = 60
    on = np.ones((weeks, cohort.n))
    on[20:] = 0
    t = sim.simulate(cohort, drugs.Regimen("e", (drugs.Dose("empagliflozin", 25),)), weeks, P, on_drug_by_week=on)
    assert t.a1c[20].mean() < t.a1c[60].mean()


def test_semaglutide_exposure_matches_label_independently():
    """Check V2a: label says about 65 and 123 ng/mL at 0.5 and 1 mg. Nothing here was fitted."""
    w = np.array([85.0])
    iiv = np.array([1.0])
    for mg, label in ((0.5, 65.0), (1.0, 123.0)):
        c = drugs.semaglutide_weekly_cavg(np.full(30, mg), w, iiv, P)[-1, 0]
        ng_ml = c * P["sema_mw"] / 1000.0
        assert ng_ml == pytest.approx(label, rel=0.25)


def test_empagliflozin_exposure_matches_label_independently():
    """Check V2b: label AUC 1870 and 4740 nmol.h/L at 10 and 25 mg, from label clearance."""
    for mg, auc in ((10, 1870), (25, 4740)):
        assert drugs.empagliflozin_cavg_nmol(mg, P["empa_cl"]) * 24 == pytest.approx(auc, rel=0.25)


def test_candidate_rejects_nonsense():
    with pytest.raises(ValueError):
        drugs.Candidate("x", half_life_h=-1, volume_l=10, mechanism="hgp", emax=0.2, ec50_nmol=10)
    with pytest.raises(ValueError):
        drugs.Candidate("x", half_life_h=10, volume_l=10, mechanism="magic", emax=0.2, ec50_nmol=10)
    with pytest.raises(ValueError):
        drugs.Candidate("x", half_life_h=10, volume_l=10, mechanism="hgp", emax=5, ec50_nmol=10)


@pytest.mark.parametrize("drug,mg", [("semaglutide", 1.0), ("empagliflozin", 25.0), ("sitagliptin", 100.0), ("metformin", 2000.0)])
def test_benefit_grows_with_baseline_hba1c(labs, drug, mg):
    """Published pattern (DeFronzo 2010, Sherifali 2010). Fails if a change flips the direction again."""
    cohort, _ = pop.enroll(labs, pop.Criteria(a1c_range=(7.0, 10.5)), 1500, P, seed=2)
    regimen = drugs.Regimen("d", (drugs.Dose(drug, mg),))
    effect = sim.simulate(cohort, regimen, 26, P).a1c[-1] - sim.simulate(cohort, drugs.Regimen("p"), 26, P).a1c[-1]
    slope = np.polyfit(cohort.a1c, effect, 1)[0]
    assert slope < 0, f"{drug}: effect rises by {slope:+.3f} per baseline point"
