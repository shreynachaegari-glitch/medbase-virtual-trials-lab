"""Reference answers to basic questions: what a drug class is, what HbA1c means, how the lab works.

Fixed text written for this project, not clinically reviewed, so no model can improvise and no simulation runs. It sits behind the guard, and anything
about a dose, a choice, or what a value means for someone is excluded here and handled by the guard instead.
"""
from __future__ import annotations

import re

_NOT_CARE = " It does not tell you whether a medicine suits anyone, so please ask a doctor or pharmacist about that."
_QUESTION = re.compile(r"^\W*(what|whats|what's|define|explain|how|why|where|tell me|describe|meaning|is this|is my|does this|do my|can you explain)\b", re.I)
_DRUG_QUESTION = re.compile(r"\b(what is|what's|whats|tell me about|explain|describe|define|mechanism)\b|\bhow does \w+ work\b|\bwhat does \w+ do\b", re.I)
_NOT_REFERENCE = re.compile(
    r"\b(dos[aei]\w*|mg|take|taking|safe|stop|start|side effects?|normal|good|bad|high|low|should|best|better|enough|danger\w*|risks?|compare\w*|comparing|vs|versus|simulate\w*|sim|per arm|weeks?|trial of|"
    r"progress\w*|revers\w*|design a|power for|respond\w*|run|price|cost|buy|food|interact\w*|together|with)\b", re.I)
_A_NUMBER = re.compile(r"(?<![\w.-])\d+(?:\.\d+)?\b")
_NAMES_WITH_DIGITS = re.compile(r"\btype[\s-]*[12]\b|\bphase[\s-]*[1-4]\b|\b\d+\s*%\s*(?:ci|confidence|credible|interval)|\bp\s*[<=>]\s*0?\.\d+", re.I)
_COMPARING = re.compile(r"\b(compare|comparing|comparison|difference|differ|versus|vs)\b", re.I)
_NOT_A_COMPARISON = re.compile(r"\bwhat is (?!the difference)|\b(better|best|which|dos[aei]\w*|mg|take|taking|safe|stop|start|side effects?|should|risks?|danger\w*|simulate\w*|trial|weeks?|price|cost|buy|food|interact\w*|together)\b", re.I)

_DRUGS = {
    "metformin": "Metformin is a biguanide, one of the oldest type 2 diabetes medicines. It works mainly by lowering how much glucose the liver releases. In this lab it acts through hepatic glucose output.",
    "semaglutide": "Semaglutide is a GLP-1 receptor agonist, sold under names such as Ozempic. It increases insulin release when glucose is high, reduces glucagon, and lowers appetite and weight. In this lab it acts through insulin secretion, liver glucose output and weight.",
    "empagliflozin": "Empagliflozin is an SGLT2 inhibitor, sold under names such as Jardiance. It makes the kidneys pass more glucose into the urine, which is why its effect weakens as kidney function falls. In this lab it acts through the renal glucose threshold.",
    "sitagliptin": "Sitagliptin is a DPP-4 inhibitor, sold under names such as Januvia. It slows the breakdown of the body's own incretin hormones, which raises insulin and lowers glucagon when glucose is high. In this lab it acts through those incretin effects.",
}
_DRUG_NAMES = {"ozempic": "semaglutide", "wegovy": "semaglutide", "rybelsus": "semaglutide", "jardiance": "empagliflozin", "januvia": "sitagliptin", "glucophage": "metformin"}

# (keywords, answer). The longest matching keyword wins, so "neural surrogate" beats "neural".
_TERMS = [
    (("glp-1", "glp1", "glp-1 receptor agonist", "glp-1 agonist"), "GLP-1 is an incretin hormone released after eating. GLP-1 receptor agonists, such as semaglutide, mimic it: they increase insulin when glucose is high, reduce glucagon, slow the stomach and lower appetite."),
    (("sglt2", "sglt-2", "sglt2 inhibitor", "sglt2 inhibitors"), "SGLT2 is a protein the kidneys use to take glucose back into the blood. SGLT2 inhibitors, such as empagliflozin, block it so more glucose leaves in the urine, which is why they work less well as kidney function falls."),
    (("dpp-4", "dpp4", "dpp-4 inhibitor", "dpp-4 inhibitors"), "DPP-4 is an enzyme that breaks down incretin hormones. DPP-4 inhibitors, such as sitagliptin, slow that breakdown, which raises insulin and lowers glucagon when glucose is high."),
    (("biguanide", "biguanides"), "Biguanides are a class of diabetes medicines, and metformin is the one in common use. They work mainly by lowering how much glucose the liver releases."),
    (("insulin",), "Insulin is a hormone made by the pancreas that moves glucose from the blood into cells. This lab can't simulate insulin as a medicine, but its model uses the body's own insulin."),
    (("sulfonylurea", "sulfonylureas"), "Sulfonylureas, such as glipizide and glimepiride, are older diabetes medicines that make the pancreas release more insulin, whatever the glucose level, so low blood glucose is a known risk. This lab does not simulate them."),
    (("my data", "my question", "my questions", "my information", "my privacy"), "The simulator runs in your browser and the site has no accounts. Questions that need the language model pass through a proxy to NVIDIA NIM, so please don't type personal or health details."),
    (("hba1c", "a1c", "glycated haemoglobin", "glycated hemoglobin"), "HbA1c measures how much haemoglobin has glucose attached. Red blood cells last a few months, so it reflects average blood glucose over roughly the past two to three months. Trials use it as their main measure of diabetes control. This lab reports changes in it, not what any person's value means."),
    (("egfr", "gfr"), "eGFR, estimated glomerular filtration rate, estimates how well the kidneys filter blood. It is calculated from a blood creatinine test, age and sex. Lower values mean weaker filtration. This lab uses it to describe study populations."),
    (("type 2 diabetes", "t2d", "t2dm", "diabetes"), "Type 2 diabetes is a long-term condition where the body responds poorly to insulin and the pancreas cannot make enough to compensate, so blood glucose stays high. This lab simulates drug trials in it for research and learning."),
    (("hypoglycaemia", "hypoglycemia"), "Hypoglycaemia means blood glucose has fallen too low. This lab does not model it. Its risk rises with sulfonylureas or insulin. If someone has symptoms now, please treat it as urgent and get medical help."),
    (("placebo",), "A placebo is an inactive treatment given to one group in a trial. Comparing against it separates a drug's real effect from what would have happened anyway. The simulated trials here report effects against placebo."),
    (("randomised trial", "randomized trial", "clinical trial", "rct"), "A randomised controlled trial assigns people to treatments by chance, so the groups differ only by treatment. It remains the standard way to test whether a medicine works. This lab rehearses such studies in simulation and does not replace them."),
    (("virtual patient", "virtual patients", "digital twin", "digital twins"), "A virtual patient here is a set of model parameters built from one real person's de-identified lab results in the NHANES health survey. A trial enrols groups of them, so the populations come from real measurements, not invented distributions."),
    (("nhanes",), "NHANES is the US National Health and Nutrition Examination Survey, a public survey with lab measurements. This lab builds its virtual patients from adults with diabetes in it. It is a US survey, not an Indian cohort."),
    (("neural surrogate", "surrogate", "neural network"), "The neural surrogate is a small neural network trained on simulator runs. It answers in milliseconds, so it powers the instant sliders and proposes where the AI Trial Designer should start, and the simulator then checks it. It learned the simulator, not reality, so it is no extra evidence."),
    (("bayesian calibration", "calibration", "mcmc", "calibrated"), "Calibration fits the simulator's drug parameters to the results of three real trials, using Bayesian MCMC. Rather than one best value, it keeps a range of plausible values, and that uncertainty is carried into every prediction."),
    (("blind test", "held-out", "held out", "unseal", "unsealed"), "The blind test froze the lab's predictions and published them before opening real results from trials it had not seen. Results were opened once. Ask 'How accurate is this lab?' for what it found, including where it failed."),
    (("rival",), "The rival is a deliberately simple baseline with no physiology. It carries the training trials' effects forward by drug and dose. If the simulator cannot beat it, its machinery adds little to the prediction, and in the blind test it did not clearly beat it."),
    (("statistical power", "power"), "Statistical power is the chance a study detects an effect that really exists. Larger studies and larger effects give more power. Ask for something like 'Power for sitagliptin 100 mg' to simulate it."),
    (("confidence interval", "credible interval", "interval"), "An interval gives a range of plausible values around an estimate instead of one number. Wider means less certain. The simulated intervals here carry uncertainty from calibration and trial sampling."),
    (("inclusion criteria", "eligibility criteria"), "Inclusion criteria define who may enter a trial, such as an HbA1c range or kidney function. Changing them changes the population, and so the result. The trial builder here lets you set them."),
    (("curve fit", "memorising", "memorizing", "overfitting", "overfit"), "That is a fair worry, and it is why the lab was tested blind on trials it never saw. The result was mixed: it did not clearly beat a simple rival that just carries effects forward. Treat it as a way to think about a study, not a forecast. Ask 'How accurate is this lab?' for details."),
    (("this lab", "this tool", "this site", "this project", "this app", "medbase"), "MedBase Virtual Trials Lab simulates type 2 diabetes drug trials on virtual patients built from real survey data. Visitors run a trial, design one with AI, and see how well it predicted real trials. It is for research and education, and says nothing about any one person."),
    (("copilot", "assistant"), "The copilot is a language model that plans experiments from plain English and calls the simulator, which computes the numbers. A guard checks its figures and refuses personal medical questions."),
]
_TERM_PATTERNS = [(k, re.compile(rf"\b{re.escape(k)}\b", re.I), answer) for keys, answer in _TERMS for k in keys]


def is_general(question: str) -> bool:
    """No dose, choice, number or judgement about a value, so a general answer can't read as advice."""
    text = " ".join(question.split())
    return not _NOT_REFERENCE.search(text) and not _A_NUMBER.search(_NAMES_WITH_DIGITS.sub(" ", text))


def is_drug_mechanism_question(question: str) -> bool:
    """"How does it work?" asks about the mechanism, which the notes explain, and not about the size of its effect."""
    return bool(re.search(r"\bhow (?:does|do) \w+ (?:really |actually )?work\b", question, re.I))


def named_drugs(question: str) -> list[str]:
    """The lab's drugs a question names, by generic or brand name, in the order they are listed."""
    lowered = question.lower()
    found = [_DRUG_NAMES.get(name, name) for name in (*_DRUGS, *_DRUG_NAMES) if re.search(rf"\b{name}\b", lowered)]
    return list(dict.fromkeys(found))


def compare(question: str) -> str | None:
    """How two named drugs differ, from the fixed notes. It never says which suits anyone, and it runs nothing."""
    drugs = named_drugs(question)
    if len(drugs) < 2 or not _COMPARING.search(question) or _NOT_A_COMPARISON.search(question) or _A_NUMBER.search(question):
        return None
    return " ".join(_DRUGS[d].split(" In this lab")[0] for d in drugs) + " This lab can simulate how their average HbA1c effects compare in a study population." + _NOT_CARE


def lookup(question: str) -> str | None:
    """A fixed answer for a basic question, or None to leave it to the guard's normal route."""
    text = " ".join(question.split()).rstrip("?!. ")
    without_names = _NAMES_WITH_DIGITS.sub(" ", text)
    if _NOT_REFERENCE.search(text) or _A_NUMBER.search(without_names):
        return None
    lowered = text.lower()
    named = [d for d in (*_DRUGS, *_DRUG_NAMES) if re.search(rf"\b{d}\b", lowered)]
    if named:
        if len(named) > 1 or not (_DRUG_QUESTION.search(text) or lowered == named[0]):
            return None
        return _DRUGS[_DRUG_NAMES.get(named[0], named[0])] + _NOT_CARE
    matches = [(k, answer) for k, pattern, answer in _TERM_PATTERNS if pattern.search(text)]
    if not matches:
        return None
    keyword, answer = max(matches, key=lambda m: len(m[0]))
    return answer if _QUESTION.search(text) or lowered == keyword else None
