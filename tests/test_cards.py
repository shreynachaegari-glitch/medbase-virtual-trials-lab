"""Result cards: the charts the copilot shows inline are built only from tool output, never from model text."""
from medlab.agent import assistant, cards

TRIAL = {
    "control": "Placebo", "weeks": 26, "n_per_arm": 100, "notice": "Simulated.",
    "contrasts": {"Semaglutide 1 mg/week": {"hba1c": {"effect": -1.6014, "interval95": [-1.785, -1.41]}, "weight": {"effect": -3.548, "interval95": [-4.1, -3.0]}}},
    "arms": {
        "Placebo": {"a1c_by_week": [7.8, 7.79, 7.81], "a1c_low": [7.8, 7.6, 7.5], "a1c_high": [7.8, 8.0, 8.1], "share_below_7": 0.077},
        "Semaglutide 1 mg/week": {"a1c_by_week": [7.8, 7.0, 6.2], "a1c_low": [7.8, 6.8, 6.0], "a1c_high": [7.8, 7.2, 6.4], "share_below_7": 0.873},
    },
    "track_record": {"Semaglutide 1 mg/week": {"sentence": "Blind test record for semaglutide: over-predicted."}},
}
POWER = {"arm": "Empagliflozin 25 mg/day", "control": "Placebo", "endpoint": "hba1c", "curve": [{"n_per_arm": 25, "power": 0.62}, {"n_per_arm": 50, "power": 0.91}],
         "smallest_size_reaching_80pct": 50, "target_power_percent": 80, "design_run": {"weeks": 26}}
RESPONDERS = {"arm": "Empagliflozin 25 mg/day", "control": "Placebo", "endpoint": "hba1c", "mean_individual_effect": -0.814, "spread_sd": 0.544, "fit_r2": 0.53,
              "drivers": [{"feature": "baseline fasting glucose", "importance": 0.88}, {"feature": "eGFR", "importance": 0.07}],
              "subgroups": [{"rule": "fasting glucose > 224", "patients": 31, "mean_effect": -1.73}], "design_run": {"weeks": 26}}


def call(tool, result, ok=True):
    return {"tool": tool, "args": {}, "ok": ok, "result": result}


def test_trial_card_carries_effects_intervals_and_curves_from_the_tool():
    [card] = cards.from_calls([call("run_virtual_trial", TRIAL)])
    assert card["kind"] == "trial" and card["weeks"] == 26 and card["n_per_arm"] == 100
    sema = card["arms"][0]
    assert sema["name"] == "Semaglutide 1 mg/week" and sema["effect"] == -1.6 and sema["low"] == -1.78 and sema["high"] == -1.41
    assert sema["weight"] == -3.55 and sema["share_below_7"] == 0.87
    assert card["curves"]["Placebo"]["mean"] == [7.8, 7.79, 7.81] and card["curves"]["Semaglutide 1 mg/week"]["low"] == [7.8, 6.8, 6.0]


def test_power_and_responder_cards():
    power, responders = cards.from_calls([call("power_analysis", POWER), call("who_responds", RESPONDERS)])
    assert power == {"kind": "power", "arm": "Empagliflozin 25 mg/day", "weeks": 26, "target": 80, "smallest": 50,
                     "curve": [{"n": 25, "power": 0.62}, {"n": 50, "power": 0.91}]}
    assert responders["kind"] == "responders" and responders["mean_effect"] == -0.81 and responders["drivers"][0] == {"feature": "baseline fasting glucose", "importance": 0.88}
    assert responders["subgroups"] == [{"rule": "fasting glucose > 224", "patients": 31, "mean_effect": -1.73}]


def test_failed_tools_other_tools_and_malformed_output_make_no_card():
    assert cards.from_calls([call("run_virtual_trial", TRIAL, ok=False)]) == []
    assert cards.from_calls([call("drug_safety", {"warnings": []}), call("search_knowledge", {"passages": []})]) == []
    assert cards.from_calls([call("run_virtual_trial", {"contrasts": "nonsense"}), {"tool": "power_analysis", "ok": True}]) == []


def test_cards_are_capped():
    assert len(cards.from_calls([call("power_analysis", POWER)] * 9)) == cards.MAX_CARDS


def test_ledger_keeps_each_result_beside_its_call(monkeypatch):
    monkeypatch.setattr(assistant.tools, "execute", lambda name, args: TRIAL)
    ledger = assistant._Ledger()
    ledger.run("run_virtual_trial", {"arms": []})
    assert ledger.calls[0]["result"] is TRIAL


def test_reply_dict_sends_cards_but_never_raw_args_or_results():
    reply = assistant.Reply("Semaglutide lowered HbA1c by 1.60.", "nim", [call("run_virtual_trial", TRIAL)], question="simulate semaglutide 1 mg")
    data = assistant.reply_dict(reply)
    assert data["cards"][0]["kind"] == "trial"
    assert data["tool_calls"] == [{"tool": "run_virtual_trial", "ok": True}]


def test_refusals_and_emergencies_never_show_cards():
    for source in ("refusal", "emergency", "scope", "language", "unsupported"):
        assert assistant.reply_dict(assistant.Reply("No.", source, [call("run_virtual_trial", TRIAL)]))["cards"] == []


# --- Reply polish: caveats as their own block, smarter next questions, no double negatives. ---

def test_limits_are_split_out_but_the_text_keeps_them():
    text = "Semaglutide lowered HbA1c most.\n\nThese are simulated results. Validation on 20 held-out real results: mean HbA1c error 0.29 points. Accuracy check FAILED."
    data = assistant.reply_dict(assistant.Reply(text, "nim", [call("run_virtual_trial", TRIAL)], question="simulate semaglutide 1 mg"))
    assert data["limits"] == "These are simulated results. Validation on 20 held-out real results: mean HbA1c error 0.29 points. Accuracy check FAILED."
    assert data["text"].startswith(text) and "FAILED" in data["text"]
    assert "112" not in data["limits"]


def test_no_limits_without_the_marker():
    assert assistant.reply_dict(assistant.Reply("Hello.", "assistant", question="hi"))["limits"] is None


def test_drug_class_questions_suggest_that_class_drug():
    assert assistant.suggestions("What is an SGLT2 inhibitor?", "assistant")[0] == "Simulate empagliflozin 25 mg against placebo for 26 weeks"
    assert assistant.suggestions("How do GLP-1 agonists work?", "assistant")[0] == "Simulate semaglutide 1 mg against placebo for 26 weeks"
    assert assistant.suggestions("what does a DPP-4 inhibitor do", "nim")[0] == "Simulate sitagliptin 100 mg against placebo for 26 weeks"


def test_follow_ups_take_the_drug_from_the_conversation():
    assert assistant.suggestions("why does that lower blood sugar?", "assistant", context="What is an SGLT2 inhibitor?")[0].startswith("Simulate empagliflozin")
    # The question itself wins over the conversation, and safety replies never pick up a drug from it.
    assert assistant.suggestions("What is semaglutide?", "assistant", context="What is an SGLT2 inhibitor?")[0].startswith("Simulate semaglutide")
    assert "Simulate" not in " ".join(assistant.suggestions("Should I stop it?", "refusal", context="What is metformin?"))


def test_model_double_negatives_are_tidied_without_touching_the_number():
    fix = assistant.tidy_signs
    assert fix("Sitagliptin 100 mg reduced HbA1c by ‑0.68 percentage points") == "Sitagliptin 100 mg reduced HbA1c by 0.68 percentage points"
    assert fix("lowered weight by -2.4 kg and cut glucose by −20 mg/dL") == "lowered weight by 2.4 kg and cut glucose by 20 mg/dL"
    assert fix("HbA1c changed by -0.68 points (95% interval -0.82 to -0.56)") == "HbA1c changed by -0.68 points (95% interval -0.82 to -0.56)"
    data = assistant.reply_dict(assistant.Reply("It reduced HbA1c by -0.68 points.", "nim", [call("run_virtual_trial", TRIAL)]))
    assert "by 0.68" in data["text"]
    # Code-written text is left exactly as code wrote it.
    assert "by -0.68" in assistant.reply_dict(assistant.Reply("It reduced HbA1c by -0.68 points.", "verified"))["text"]
