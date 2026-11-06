"""End-to-end runs on real NHANES cohorts. The posterior here is a stand-in made of prior medians,
so these tests check behaviour and shape. Their numbers are not results."""
import json

import numpy as np
import pytest

from medlab import calibrate, drugs, params, population as pop, trial
from medlab.agent import assistant, tools


@pytest.fixture(scope="module", autouse=True)
def stand_in_posterior(tmp_path_factory):
    if not (pop.NHANES_DIR / "P_GHB.xpt").exists():
        pytest.skip("NHANES not downloaded")
    path = tmp_path_factory.mktemp("post") / "posterior.json"
    names = list(params.CALIBRATED)
    medians = np.array([params.PARAMS[n].value for n in names])
    draws = medians * np.exp(np.random.default_rng(0).normal(0, 0.02, (8, len(names))))
    path.write_text(json.dumps({"names": names, "draws": draws.tolist()}))
    patch = pytest.MonkeyPatch()
    patch.setattr(calibrate, "POSTERIOR", path)
    yield
    patch.undo()


def _design(**kw):
    arms = (trial.Arm("Placebo", drugs.Regimen("Placebo")),
            trial.Arm("Semaglutide", drugs.Regimen("s", (drugs.Dose("semaglutide", 1.0, ((4, 0.25), (4, 0.5))),))),
            trial.Arm("Empagliflozin", drugs.Regimen("e", (drugs.Dose("empagliflozin", 25),))))
    return trial.Design(arms=arms, **{"weeks": 16, "n_per_arm": 60, "posterior_draws": 3, "replicates": 4, **kw})


def test_trial_runs_end_to_end_and_reports_expected_shape():
    result = trial.run_trial(_design())
    assert set(result["contrasts"]) == {"Semaglutide", "Empagliflozin"}
    for contrast in result["contrasts"].values():
        for endpoint in trial.ENDPOINTS:
            low, high = contrast[endpoint]["interval95"]
            assert low <= contrast[endpoint]["effect"] <= high
    assert len(result["arms"]["Placebo"]["a1c_by_week"]) == 17
    assert result["contrasts"]["Semaglutide"]["hba1c"]["effect"] < 0
    assert result["arms"]["Empagliflozin"]["urinary_glucose_g_day"] > result["arms"]["Placebo"]["urinary_glucose_g_day"]
    assert "Not medical advice" in result["notice"] and "validation" in result
    json.dumps(result)


def test_same_seed_reproduces_and_different_seed_differs():
    a = trial.run_trial(_design(seed=5))
    b = trial.run_trial(_design(seed=5))
    c = trial.run_trial(_design(seed=6))
    assert a["contrasts"] == b["contrasts"]
    assert a["contrasts"] != c["contrasts"]


def test_a_drug_with_no_effect_is_not_called_effective_more_than_expected():
    inert = drugs.Candidate("Inert", 12, 70, "hgp", 0.0, 100)
    arms = (trial.Arm("Placebo", drugs.Regimen("Placebo")), trial.Arm("Inert", drugs.Regimen("Inert", candidates=((inert, 50.0),))))
    result = trial.run_trial(trial.Design(arms=arms, weeks=12, n_per_arm=100, dropout=0.0, posterior_draws=3, replicates=40))
    hba1c = result["contrasts"]["Inert"]["hba1c"]
    assert abs(hba1c["effect"]) < 0.05
    assert hba1c["probability_significant_benefit"] < 0.1


def test_lower_adherence_shrinks_the_effect():
    full = trial.run_trial(_design(adherence=1.0, dropout=0.0))["contrasts"]["Empagliflozin"]["hba1c"]["effect"]
    half = trial.run_trial(_design(adherence=0.3, dropout=0.0))["contrasts"]["Empagliflozin"]["hba1c"]["effect"]
    assert full < half < 0


def test_more_dropout_shrinks_the_effect():
    low = trial.run_trial(_design(dropout=0.0))["contrasts"]["Semaglutide"]["hba1c"]["effect"]
    high = trial.run_trial(_design(dropout=0.7))["contrasts"]["Semaglutide"]["hba1c"]["effect"]
    assert low < high < 0


def _single(**kw):
    d = _design(**kw)
    return trial.Design(arms=d.arms[:2], weeks=d.weeks, n_per_arm=d.n_per_arm, posterior_draws=d.posterior_draws, replicates=d.replicates, dropout=d.dropout, adherence=d.adherence)


def test_power_and_responders_refuse_extra_arms_rather_than_ignoring_them():
    with pytest.raises(ValueError, match="one arm"):
        trial.power_curve(_design())
    with pytest.raises(ValueError, match="one arm"):
        trial.responders(_design())


def test_results_carry_context_flags_and_no_fake_hypoglycaemia_number():
    result = trial.run_trial(_design())
    assert any("Hypoglycaemia is not modelled" in x for x in result["not_modelled"])
    assert all("fpg_below_70_share" not in a for a in result["arms"].values())
    assert result["arm_kinds"]["Semaglutide"] == "real drug"


def test_power_rises_with_size():
    result = trial.power_curve(_single(), sizes=(10, 40, 160))
    powers = [c["power"] for c in result["curve"]]
    assert powers[0] <= powers[-1] and powers[-1] > 0.8
    assert result["smallest_size_reaching_80pct"] in (10, 40, 160)


def test_responders_returns_readable_groups_covering_everyone():
    result = trial.responders(_single())
    assert sum(g["patients"] for g in result["subgroups"]) == trial.SIM_POOL
    assert "cannot discover biology" in result["notice"]


def test_candidate_mechanisms_each_lower_glucose():
    for mechanism, emax in (("hgp", 0.3), ("secretion", 1.0), ("sensitizer", 1.0), ("renal", 0.6)):
        molecule = drugs.Candidate("X", 12, 70, mechanism, emax, 100)
        arms = (trial.Arm("Placebo", drugs.Regimen("Placebo")), trial.Arm("X", drugs.Regimen("X", candidates=((molecule, 100.0),))))
        result = trial.run_trial(trial.Design(arms=arms, weeks=16, n_per_arm=50, posterior_draws=2, replicates=3))
        assert result["contrasts"]["X"]["hba1c"]["effect"] < -0.05, mechanism


def test_planner_answers_on_a_real_run():
    reply = assistant.answer("Compare semaglutide 1 mg and sitagliptin 100 mg over 12 weeks")
    assert reply.source == "planner" and "Simulated 12-week trial" in reply.text
    assert [c["tool"] for c in reply.tool_calls] == ["run_virtual_trial"]


def test_kidney_filter_is_applied_in_tools():
    design = tools.build_design({"arms": [{"drug": "empagliflozin", "mg": 25}], "egfr_min": 30, "egfr_max": 60})
    cohort, report = pop.enroll(trial.labs(), design.criteria, 200, params.defaults(), 1)
    assert 30 <= report["matched"]["egfr"] <= 62


def test_designer_finds_lower_dose_for_easier_target_and_reports_every_step():
    from medlab import designer
    easy = designer.design_study(designer.Goal("empagliflozin", target_effect=0.3, weeks=16))
    hard = designer.design_study(designer.Goal("empagliflozin", target_effect=0.8, weeks=16))
    assert easy["simulated_design"] and hard["simulated_design"]
    assert easy["simulated_design"]["dose_mg"] <= hard["simulated_design"]["dose_mg"]
    assert "recommendation" not in hard and list(hard)[0] == "notice"
    assert all({"step", "action", "finding"} <= set(s) for s in hard["steps"]) and [s["step"] for s in hard["steps"]] == list(range(1, len(hard["steps"]) + 1))
    assert "not a dosing recommendation" in hard["notice"]


def test_designer_says_when_a_goal_cannot_be_met():
    from medlab import designer
    result = designer.design_study(designer.Goal("sitagliptin", target_effect=3.0, weeks=16))
    assert result["simulated_design"] is None and "No dose" in result["reason"] and len(result["steps"]) == 1


def test_planner_runs_designer():
    reply = assistant.answer("Design a study of empagliflozin for a 0.3 point effect over 12 weeks")
    assert reply.source == "planner" and reply.tool_calls[0]["tool"] == "design_study" and "not a dosing recommendation" in reply.text.split("Simulated study design")[0]


def test_organ_signals_come_from_each_drugs_own_mechanism():
    arms = trial.run_trial(_design())["arms"]
    placebo, sema, empa = arms["Placebo"]["organ_signals"], arms["Semaglutide"]["organ_signals"], arms["Empagliflozin"]["organ_signals"]
    assert placebo["liver_glucose_output_change_pct"] == 0 and placebo["insulin_secretion_capacity_change_pct"] == 0
    assert sema["insulin_secretion_capacity_change_pct"] > 0 and sema["liver_glucose_output_change_pct"] < 0
    assert empa["insulin_secretion_capacity_change_pct"] == 0 and empa["urinary_glucose_change_g_day"] > sema["urinary_glucose_change_g_day"]
    assert sema["weight_change_kg"] < placebo["weight_change_kg"]
