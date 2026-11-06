import numpy as np
import pytest
import statsmodels.api as sm

from medlab import calibrate, drugs, params, population as pop, safety, registry, trial


def test_ancova_matches_statsmodels():
    rng = np.random.default_rng(3)
    baseline = rng.normal(8, 1, 400)
    treated = np.repeat([1.0, 0.0], 200)
    end = baseline - 0.8 * treated + 0.2 * (baseline - 8) + rng.normal(0, 0.7, 400)
    effect, se, p = trial.ancova(end, baseline, treated)
    x = sm.add_constant(np.column_stack([treated, baseline - baseline.mean()]))
    model = sm.OLS(end - baseline, x).fit()
    assert effect == pytest.approx(model.params[1])
    assert se == pytest.approx(model.bse[1])
    assert p == pytest.approx(model.pvalues[1])


def test_ancova_finds_no_effect_at_the_nominal_rate():
    rng = np.random.default_rng(4)
    hits = 0
    for _ in range(500):
        baseline = rng.normal(8, 1, 200)
        end = baseline + rng.normal(0, 0.7, 200)
        hits += trial.ancova(end, baseline, np.repeat([1.0, 0.0], 100))[2] < 0.05
    assert 0.02 < hits / 500 < 0.09


def test_design_blocks_metformin_below_label_cutoff():
    arms = (trial.Arm("c", drugs.Regimen("c")), trial.Arm("m", drugs.Regimen("m", (drugs.Dose("metformin", 2000),))))
    with pytest.raises(ValueError, match="contraindicated"):
        trial.Design(arms=arms, criteria=pop.Criteria(egfr_range=(15, 29)))


@pytest.mark.parametrize("kw", [{"weeks": 1}, {"n_per_arm": 3}, {"dropout": 0.95}, {"adherence": 0.0}, {"alpha": 0.9}])
def test_design_rejects_bad_settings(kw):
    arms = (trial.Arm("c", drugs.Regimen("c")), trial.Arm("a", drugs.Regimen("a")))
    with pytest.raises(ValueError):
        trial.Design(arms=arms, **kw)


def test_design_needs_two_arms_with_unique_names():
    c = trial.Arm("c", drugs.Regimen("c"))
    with pytest.raises(ValueError):
        trial.Design(arms=(c,))
    with pytest.raises(ValueError):
        trial.Design(arms=(c, c))


def test_discontinuation_stops_drug_and_respects_rate():
    on = trial._discontinuation(np.random.default_rng(0), 4000, 26, 0.25, 0.9)
    assert on.shape == (26, 4000) and set(np.unique(on)) <= {0.0, 0.9}
    assert np.mean(on[-1] == 0) == pytest.approx(0.25, abs=0.03)
    assert np.all(on[0] == 0.9)


def test_lower_egfr_cohort_gets_less_urinary_glucose():
    labs = pop.load_labs()
    p = params.defaults()
    from medlab import simulate as sim
    reg = drugs.Regimen("e", (drugs.Dose("empagliflozin", 25),))
    normal, _ = pop.enroll(labs, pop.Criteria(egfr_range=(90, 400)), 300, p, 1)
    low, _ = pop.enroll(labs, pop.Criteria(egfr_range=(30, 60)), 300, p, 1)
    assert sim.simulate(low, reg, 8, p).uge_g_day[-1].mean() < 0.8 * sim.simulate(normal, reg, 8, p).uge_g_day[-1].mean()


def test_safety_reads_real_registry_rates():
    if not (registry.RAW_DIR / "NCT02054897.json").exists():
        pytest.skip("registry not cached")
    report = safety.drug_safety("semaglutide")
    drug_arms = [a for a in report["arms"] if a["role"] == "drug"]
    placebo = [a for a in report["arms"] if a["role"] == "placebo"]
    assert drug_arms and placebo
    pct = lambda arm, term: next((e["percent"] for e in arm["events"] if e["term"].lower() == term), 0)  # noqa: E731
    assert pct(drug_arms[-1], "nausea") > pct(placebo[0], "nausea")
    assert any(e["term"] == "Lipase increased" for e in drug_arms[0]["events"])  # previously hidden by a whitelist
    assert report["kind"] == "empirical" and report["label_warnings"][0]["kind"] == "boxed warning"


def test_metformin_safety_says_it_has_no_placebo():
    report = safety.drug_safety("metformin")
    assert report["has_placebo_arm"] is False and "no placebo" in report["notice"]


def test_label_summaries_match_downloaded_labels():
    import json
    from pathlib import Path
    from medlab import labels
    folder = Path(__file__).resolve().parent.parent / "data" / "raw" / "labels"
    if not (folder / "metformin.json").exists():
        pytest.skip("labels not downloaded")
    for drug, warnings in labels.WARNINGS.items():
        text = (folder / f"{drug}.json").read_text()
        for w in warnings:
            assert w["check"] in text, (drug, w["check"])


def test_renal_rules_block_and_flag_as_labels_say():
    from medlab import labels
    assert labels.renal_review("metformin", 2000, 15, 29)[0]
    assert labels.renal_review("empagliflozin", 25, 15, 29)[0]
    assert labels.renal_review("metformin", 2000, 30, 400) == (None, [labels.renal_review("metformin", 2000, 30, 400)[1][0]])
    assert labels.renal_review("sitagliptin", 100, 30, 400)[1]
    assert labels.renal_review("metformin", 2000, 60, 400) == (None, [])


def test_renal_exposure_never_adds_efficacy():
    egfr = np.array([15.0, 30.0, 60.0, 90.0, 140.0])
    assert np.all(drugs.renal_exposure_factor(egfr, 0.9) <= 1.0)


def test_sglt2_compensation_and_fluid_scale_with_dose_and_adherence():
    labs = pop.load_labs()
    p = params.defaults()
    cohort, _ = pop.enroll(labs, pop.Criteria(), 100, p, 1)
    effect = lambda mg, on: drugs.effects_for_week(drugs.Regimen("e", (drugs.Dose("empagliflozin", mg),)), 0, cohort, p, None, np.full(100, on))  # noqa: E731
    assert effect(1, 1.0).fluid_kg.mean() < 0.5 * effect(25, 1.0).fluid_kg.mean()
    assert effect(25, 0.1).fluid_kg.mean() < effect(25, 1.0).fluid_kg.mean()
    assert effect(1, 1.0).renal_net.mean() > effect(25, 1.0).renal_net.mean()


def test_no_participant_identifier_on_the_cohort():
    cohort, report = pop.enroll(pop.load_labs(), pop.Criteria(), 50, params.defaults(), 1)
    assert not hasattr(cohort, "source_id") and "thin_pool" in report


def test_safety_rejects_unknown_drug():
    with pytest.raises(ValueError):
        safety.drug_safety("aspirin")


def test_replicate_arms_never_share_a_patient():
    a, b = trial._split(np.random.default_rng(0), trial._pool_size(800), 800)
    assert len(a) == len(b) == 800 and not set(a) & set(b)


def test_stale_posterior_is_a_server_fault_not_a_user_error(tmp_path, monkeypatch):
    import json
    from fastapi.testclient import TestClient
    from medlab import api
    stale = tmp_path / "posterior.json"
    stale.write_text(json.dumps({"names": ["sita_hgp_max"], "draws": [[0.05]]}))
    monkeypatch.setattr(calibrate, "POSTERIOR", stale)
    api.limits.BUDGET.clear()
    assert TestClient(api.app).post("/api/trial", json={"arms": [{"drug": "metformin", "mg": 1000}]}).status_code == 503


def test_titration_is_one_rule_everywhere():
    from medlab import designer
    from medlab.agent import tools
    for drug, mg in (("semaglutide", 0.7), ("semaglutide", 1.0), ("metformin", 2000.0), ("empagliflozin", 25.0)):
        via_tools = tools._regimen({"drug": drug, "mg": mg})[1].doses[0]
        assert via_tools == designer._regimen(drug, mg).doses[0] == drugs.standard_dose(drug, mg)
    assert drugs.standard_dose("semaglutide", 0.7).escalation == ((4, 0.25), (4, 0.5))


def test_safety_response_hides_internal_fields():
    assert all("check" not in w for w in safety.drug_safety("semaglutide")["label_warnings"])
