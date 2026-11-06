"""Definitions must line up with the registry. Held-out values are never read here."""
import pytest

from medlab import calibrate, drugs, registry, trials


def _have(nct):
    return (registry.RAW_DIR / f"{nct}.json").exists()


@pytest.mark.parametrize("contrast", trials.HELD_OUT_CONTRASTS, ids=lambda c: f"{c.trial}:{c.arm}")
def test_each_held_out_contrast_matches_registry_titles(contrast):
    spec = trials.spec_by_name(contrast.trial)
    if not _have(spec.nct):
        pytest.skip("registry record not cached")
    structure = [s for s in registry.read_structure(spec.nct) if s["title"] == contrast.outcome_title]
    assert structure, f"no outcome titled {contrast.outcome_title}"
    arms = set().union(*(set(s["arms"]) for s in structure))
    assert contrast.arm in arms and contrast.reference in arms
    assert contrast.arm in spec.arms and contrast.reference in spec.arms


def test_held_out_values_are_sealed():
    with pytest.raises(registry.SealedTrialError):
        registry.read_outcomes("NCT01930188")


def test_no_trial_is_both_train_and_held_out():
    assert not set(registry.TRAIN) & set(registry.HELD_OUT)
    assert {s.nct for s in trials.TRAIN_SPECS} == set(registry.TRAIN)
    assert {s.nct for s in trials.HELD_OUT_SPECS} == set(registry.HELD_OUT)


def test_train_targets_are_complete_and_converted():
    if not _have("NCT02054897"):
        pytest.skip("registry record not cached")
    targets = calibrate.train_targets()
    fpg = next(t for t in targets if t.endpoint == "fpg" and t.arm == "Placebo")
    assert fpg.observed == pytest.approx(-0.55 * trials.MMOL_TO_MGDL)
    empa = next(t for t in targets if t.arm == "Empagliflozin 25 mg" and t.endpoint == "hba1c")
    assert empa.observed == pytest.approx(-0.77) and empa.se == pytest.approx(0.06)


def test_dose_schedule_follows_registry_text():
    sema = trials.spec_by_name("SUSTAIN 1").arms["Semaglutide 1.0 mg"].doses[0]
    assert [sema.mg_at_week(w) for w in (0, 3, 4, 7, 8, 29)] == [0.25, 0.25, 0.5, 0.5, 1.0, 1.0]
    p2 = trials.spec_by_name("Semaglutide phase 2").arms["Semaglutide 1.6 mg (With Titration)"].doses[0]
    assert [p2.mg_at_week(w) for w in (0, 1, 2, 11)] == [0.4, 0.8, 1.6, 1.6]


@pytest.mark.parametrize("arm,dispersion,expected", [
    (registry.ArmResult("a", 100, -1.0, 0.5, None, None), "Standard Error", 0.5),
    (registry.ArmResult("a", 100, -1.0, 2.0, None, None), "Standard Deviation", 0.2),
    (registry.ArmResult("a", 100, -1.0, None, -1.392, -0.608), "95% Confidence Interval", 0.2),
])
def test_arm_se_handles_each_published_form(arm, dispersion, expected):
    assert calibrate.arm_se(arm, dispersion) == pytest.approx(expected)


def test_arm_se_refuses_when_it_cannot_tell():
    with pytest.raises(ValueError):
        calibrate.arm_se(registry.ArmResult("a", None, -1.0, None, None, None), "Standard Deviation")


def test_no_liraglutide_or_unknown_drug_sneaks_in():
    for spec in (*trials.TRAIN_SPECS, *trials.HELD_OUT_SPECS):
        for regimen in spec.arms.values():
            assert isinstance(regimen, drugs.Regimen)
            assert all(d.drug in {"semaglutide", "empagliflozin", "sitagliptin", "metformin"} for d in regimen.doses)


def _row(trial, arm, pred, obs, sd=0.2, null=None, group="efficacy"):
    return {"trial": trial, "trial_base": trial.split(" mild")[0].split(" moderate")[0], "arm": arm, "reference": "P", "group": group, "predicted": pred, "observed": obs,
            "error": pred - obs, "sd": sd, "null_error": (null if null is not None else pred) - obs}


def _rows(err=0.1, null_err=0.5):
    rows = [_row(f"T{i}", "A", -1 + err, -1, null=-1 + null_err) for i in range(18)]
    rows += [_row("EMPA-REG RENAL mild", "Empa 25mg", -0.6 + err, -0.6, group="renal", null=-0.6 + null_err), _row("EMPA-REG RENAL moderate", "Empa 25mg", -0.4 + err, -0.4, group="renal", null=-0.4 + null_err)]
    return rows


def test_score_passes_a_good_model_and_records_beating_the_null():
    from medlab import validate
    s = validate.score(_rows())
    assert s["V3_pass"] and s["V4_pass"] and s["V5_pass"] and s["beats_null"] and s["mae"] == pytest.approx(0.1)


def test_score_fails_a_bad_model_and_does_not_rescue_it():
    from medlab import validate
    s = validate.score(_rows(err=0.5, null_err=0.1))
    assert not s["V3_pass"] and not s["V4_pass"] and not s["V5_pass"] and not s["beats_null"]


def test_coverage_mark_needs_seventeen_of_twenty():
    from medlab import validate
    rows = _rows(err=0.0)
    for r in rows[:4]:
        r["error"] = 5.0
    assert validate.score(rows)["coverage_95pi"] == pytest.approx(0.8) and not validate.score(rows)["V4_pass"]


def test_null_predictor_uses_train_results_only_and_adds_combinations():
    from medlab import validate
    null = validate.null_predictions()
    assert len(null) == len(trials.HELD_OUT_CONTRASTS)
    key = "Sitagliptin + metformin factorial|Sitagliptin 50 mg b.i.d + Metformin 1000 mg b.i.d.|Placebo/Metformin 1000 mg b.i.d."
    sita = null["Sitagliptin + metformin factorial|Sitagliptin 100 mg q.d.|Placebo/Metformin 1000 mg b.i.d."]
    met = null["Sitagliptin + metformin factorial|Metformin 1000 mg b.i.d.|Placebo/Metformin 1000 mg b.i.d."]
    assert null[key] == pytest.approx(sita + met)


def test_unseal_refuses_when_code_changed(tmp_path, monkeypatch):
    import json
    from medlab import validate
    frozen = tmp_path / "predictions.json"
    frozen.write_text(json.dumps({"code_hash": "old"}))
    monkeypatch.setattr(validate, "PREDICTIONS", frozen)
    monkeypatch.setattr(validate, "code_hash", lambda: "new")
    with pytest.raises(SystemExit, match="Refusing"):
        validate.unseal()


def test_split_rhat_separates_mixed_from_stuck_chains():
    import numpy as np
    rng = np.random.default_rng(0)
    mixed = rng.normal(0, 1, (1000, 20, 2))
    stuck = mixed + np.linspace(0, 5, 1000)[:, None, None]
    assert calibrate.split_rhat(mixed).max() < 1.02 < calibrate.split_rhat(stuck).max()


def test_each_trial_has_a_usable_pool():
    from medlab import params, population as pop
    labs = pop.load_labs()
    for spec in (*trials.TRAIN_SPECS, *trials.HELD_OUT_SPECS):
        pop.enroll(labs, spec.criteria, 50, params.defaults(), 1)
