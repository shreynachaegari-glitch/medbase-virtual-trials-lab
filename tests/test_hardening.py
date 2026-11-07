"""Security and reliability measures: the proxy's lock, API headers, trimming a reply, and pronoun follow-ups."""
import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from medlab import api
from medlab.agent import assistant, guard, tools

ROOT = Path(__file__).resolve().parent.parent
PROXY = (ROOT / "proxy" / "api" / "chat.js").read_text()


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _compact(value) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


@pytest.mark.parametrize("prompt", [assistant.SYSTEM, assistant.GENERAL_SYSTEM, assistant.ASSISTANT_SYSTEM])
def test_the_proxy_accepts_the_labs_current_prompts(prompt):
    assert _sha(prompt) in PROXY, "a prompt changed: update ALLOWED_PROMPTS in proxy/api/chat.js and redeploy the proxy first"


@pytest.mark.parametrize("specs", [assistant._tool_specs_openai(), assistant._general_tool_specs()])
def test_the_proxy_accepts_the_labs_current_tools(specs):
    assert _sha(_compact(specs)) in PROXY, "the tool list changed: update ALLOWED_TOOLS in proxy/api/chat.js and redeploy the proxy first"


def test_every_tool_is_one_the_lab_defines():
    assert {s["function"]["name"] for s in assistant._tool_specs_openai()} <= set(tools.TOOLS)


client = TestClient(api.app)


@pytest.mark.parametrize("path", ["/api/health"])
def test_api_replies_carry_security_headers(path):
    headers = client.get(path).headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "no-referrer"
    assert "no-store" in headers["cache-control"]
    assert "default-src 'none'" in headers["content-security-policy"]


def test_an_oversized_request_is_refused_before_it_is_read():
    response = client.post("/api/assistant", content=b"x" * 10, headers={"content-length": str(api.MAX_BODY_BYTES + 1), "content-type": "application/json"})
    assert response.status_code == 413


def test_a_wrong_figure_is_cut_and_the_rest_of_the_answer_kept():
    results = [{"effect": -0.57}]
    text = "HbA1c fell by -0.57 points.\n- Weight changed by 0.24 kg.\nThis is a simulated result."
    trimmed = guard.without_unsourced(text, results, [])
    assert "0.57" in trimmed and "0.24" not in trimmed and "simulated result" in trimmed


@pytest.mark.parametrize("text", ["Weight changed by 0.24 kg.", "It worked.", ""])
def test_nothing_is_kept_when_no_sourced_figure_would_remain(text):
    assert guard.without_unsourced(text, [{"effect": -0.57}], []) is None


def _session_with_a_result():
    session = assistant.BrowserSession("Simulate sitagliptin 100 mg against placebo for 26 weeks")
    assert "messages" in session.start()
    session.run_tool("run_virtual_trial", json.dumps({"arms": [{"drug": "sitagliptin", "mg": 100}], "weeks": 26}))
    assert session.ledger.has_result
    arm = next(iter(session.ledger.simulator[-1]["contrasts"]))
    return session, session.ledger.simulator[-1]["contrasts"][arm]["hba1c"]["effect"]


def test_the_model_gets_one_chance_to_fix_a_figure_then_only_that_line_goes():
    session, effect = _session_with_a_result()
    draft = f"HbA1c changed by {effect} percentage points.\n- Weight changed by 77.77 kg."
    assert "repair" in session.finish(draft)
    done = session.finish(draft)["done"]
    assert done["source"] == "nim"
    assert str(effect) in done["text"] and "77.77" not in done["text"]
    assert "removed" in done["guard_note"]
    assert "Accuracy check FAILED" in done["text"], "the caveats are still appended"


def test_a_reply_with_no_good_figures_still_falls_back_to_computed_text():
    session, _ = _session_with_a_result()
    draft = "Weight changed by 77.77 kg."
    assert "repair" in session.finish(draft)
    assert session.finish(draft)["done"]["source"] == "planner"


@pytest.mark.parametrize("question, previous, merged", [
    ("what are its side effects?", "What is semaglutide?", "what are semaglutide side effects?"),
    ("how does it work?", "Simulate metformin 1000 mg against placebo", "how does metformin work?"),
    ("who responds to it?", "What is empagliflozin?", "who responds to empagliflozin?"),
])
def test_a_pronoun_carries_the_drug_from_the_last_question(question, previous, merged):
    assert assistant.resolve_followup(question, previous) == merged


@pytest.mark.parametrize("question, previous", [
    ("should i take it?", "What is semaglutide?"),
    ("is it ok for my dad?", "What is semaglutide?"),
    ("what are its side effects?", "Should I stop my metformin?"),
    ("what are its side effects?", "Compare semaglutide and metformin"),
    ("what are its side effects?", "What is HbA1c?"),
    ("what are its side effects?", None),
    ("what are the side effects of metformin?", "What is semaglutide?"),
    ("how does it feel to be a really long sentence that keeps going on and on about nothing at all?", "What is semaglutide?"),
])
def test_a_pronoun_never_launders_a_personal_or_unclear_question(question, previous):
    assert assistant.resolve_followup(question, previous) is None


def test_the_model_never_sees_a_refused_previous_question():
    started = assistant.BrowserSession("what are its side effects?", "My father takes semaglutide, is it ok?").start()
    assert "messages" not in started
    assert "semaglutide" not in json.dumps(started["done"].get("interpreted_as") or "")


@pytest.mark.parametrize("question", ["\u00bfPuedo tomarlo con mi insulina?", "je suis enceinte, est-ce s\u00fbr ?", "Ist es sicher f\u00fcr mich?", "Es seguro tomarlo para mi?", "kya mujhe yeh dawa leni chahiye", "Kann ich das nehmen?"])
def test_personal_text_in_another_language_never_leaves_the_device(question):
    assert guard.classify(question) in {"language", "personal"}, question
    done = assistant.BrowserSession(question, wants_vector=True).start()["done"]
    assert done["source"] in {"language", "refusal"}
    assert "14416" in done["text"]


@pytest.mark.parametrize("question", ["What is HbA1c?", "Simulate semaglutide 1 mg vs placebo for 30 weeks", "What is a p value?", "How does the kidney filter blood?", "Is my data stored?", "Which trial had the largest effect size?"])
def test_english_questions_are_not_mistaken_for_another_language(question):
    assert guard.classify(question) != "language", question


@pytest.mark.parametrize("draft", [
    "Change -1.2 points\n- Warning: serious risk of lactic acidosis in 4 of 100 patients\n- Otherwise the drug is harmless.",
    "Change -1.2 points. It is unsafe at 50 mg, so avoid it. It works well.",
])
def test_a_trim_never_removes_a_safety_warning_and_keeps_the_rest(draft):
    assert guard.without_unsourced(draft, [{"effect": -1.2}], []) is None


def test_a_chunked_body_cannot_dodge_the_size_limit():
    def chunks():
        for _ in range(30):
            yield b"x" * 10240
    response = client.post("/api/assistant", content=chunks(), headers={"content-type": "application/json"})
    assert response.status_code == 413


def test_the_refusal_itself_carries_the_security_headers():
    response = client.post("/api/assistant", content=b"x" * 10, headers={"content-length": str(api.MAX_BODY_BYTES + 1), "content-type": "application/json"})
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "no-store" in response.headers["cache-control"]


REFUSAL_TEXT = "I can't advise on that. Please talk to a doctor or pharmacist."


def test_a_models_slip_on_a_cleared_question_gets_one_chance_to_reconsider():
    session = assistant.BrowserSession("Simulate sitagliptin 100 mg against placebo for 26 weeks")
    assert "messages" in session.start()
    verdict = session.finish(REFUSAL_TEXT)
    assert verdict["repair"] == guard.RECONSIDER_REQUEST
    assert "own care" in verdict["repair"], "the model is told it may still refuse"


def test_a_second_refusal_stands():
    session = assistant.BrowserSession("Simulate sitagliptin 100 mg against placebo for 26 weeks")
    session.start()
    session.finish(REFUSAL_TEXT)
    assert session.finish(REFUSAL_TEXT)["done"]["source"] == "refusal"


def test_advice_shaped_text_gets_no_second_chance():
    session = assistant.BrowserSession("Simulate sitagliptin 100 mg against placebo for 26 weeks")
    session.start()
    assert session.finish("You should take 100 mg daily.")["done"]["source"] == "refusal"


@pytest.mark.parametrize("question", [
    "Simulate Ozempic 0.5 mg, sugars running around two forty", "Simulate m y metformin at 2000 mg", "Simulate metformin 2000 mg for m3",
    "I-am on metformin 500, simulate 1000 mg", "Simulate Ozempic 1 mg f0r mys3lf",
])
def test_disguised_personal_messages_are_read_as_written(question):
    assert guard.classify(question) == "personal", question


@pytest.mark.parametrize("question", [
    "Simulate semaglutide 1 mg vs placebo for 30 weeks", "What is HbA1c?", "What is a GLP1 agonist?", "How does an SGLT2 inhibitor work?", "What is V3?",
    "Run a trial of sitagliptin 100 mg in T2D", "What is the phase3 result?", "Simulate empagliflozin 25mg at eGFR 45 to 60",
])
def test_ordinary_names_with_digits_are_left_alone(question):
    assert guard.classify(question) != "personal", question

