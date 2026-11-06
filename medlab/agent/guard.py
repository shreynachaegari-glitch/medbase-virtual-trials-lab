"""Rules the assistant cannot talk its way around. They run outside any model and default to caution.

Input: anything about a person, their labs, their medicines or a treatment decision is refused,
whatever the phrasing. Other languages are handled locally, so such text never reaches a provider.
Output: a reply with an unsourced number or advice-shaped wording does not reach the user.
"""
from __future__ import annotations

import json
import re

REFUSAL = (
    "I can't advise on anyone's own treatment, dose or medicine, including a patient or relative. This lab simulates "
    "populations for research and learning, and its results don't apply to an individual. Please talk to a doctor or "
    "pharmacist, and don't stop or change a medicine without their advice. I can still show how a drug class behaves "
    "across a virtual trial."
)
EMERGENCY = (
    "This could be urgent, so please don't rely on this lab. Contact local emergency services or a doctor now. In India you can call 112. "
    "This lab is a research simulator and cannot assess symptoms or an overdose."
)
LANGUAGE = (
    "This assistant handles English research questions only, and it cannot advise on anyone's treatment. Please talk to a doctor or pharmacist. "
    "यह सहायक केवल अंग्रेज़ी शोध प्रश्नों के लिए है और उपचार की सलाह नहीं दे सकता। कृपया डॉक्टर या फार्मासिस्ट से बात करें। "
    "ఈ సహాయకం ఆంగ్ల పరిశోధన ప్రశ్నలకు మాత్రమే, చికిత్స సలహా ఇవ్వదు. దయచేసి వైద్యుడిని లేదా ఫార్మసిస్టును సంప్రదించండి। "
    "இந்த உதவியாளர் ஆங்கில ஆய்வுக் கேள்விகளுக்கு மட்டுமே; சிகிச்சை ஆலோசனை தராது. மருத்துவரையோ மருந்தாளரையோ அணுகவும்."
)
UNSUPPORTED = (
    "That medicine isn't modelled here, so I can't simulate it or say how it combines with others. This lab covers semaglutide, "
    "empagliflozin, sitagliptin and metformin. Hypoglycaemia is not modelled, and its risk rises with sulfonylureas or insulin."
)

_DRUG = r"(metformin|semaglutide|empagliflozin|sitagliptin|ozempic|jardiance|januvia|glucophage|wegovy|rybelsus|drug|drugs|medicine|medicines|medication|medications|meds?|pills?|tablets?|insulin|dose|dosage|treatment|therapy)"
_RESEARCH_NOUN = r"(trial|trials|study|studies|simulation|simulations|experiment|experiments|design|candidate|molecule|hypothesis|research|project|model|cohort|analysis|question)"
_EMERGENCY = re.compile(
    r"overdos|took too (much|many)|taken too (much|many)|poison|suicid|kill myself|unconscious|passed out|faint|seizure|can'?t breathe|trouble breathing|"
    r"chest pain|fruity breath|severe (pain|vomiting|bleeding)|(belly|stomach|abdominal) pain|what now|emergency|very low (blood )?sugar|confus(ed|ion)", re.I)
_PERSONAL = [re.compile(p, re.I) for p in (
    rf"\b(my|mine|our)\b(?!\s+{_RESEARCH_NOUN}\b)",
    r"(?<!show )(?<!tell )(?<!give )(?<!help )(?<!let )(?<!teach )\bme\b",
    r"\b(i|we)\s+(am|was|have|had|take|took|get|got|feel|felt|use|used|stopped|started|missed|forgot|been|suffer|suffered|on)\b",
    r"\bi['’](m|ve|d|ll)\b|\b(im|ive)\b",
    r"\b(should|shall|can|could|may|must|do|would|shud|shld)\s+(i|we|he|she|they|you)\b(?!\s+(simulate|run|compare|design|test|see|show|model|use this|ask|trust|do\b|help|explain|tell|need for|need in|need to (detect|run|show|enrol)))",
    r"\b(he|she|him|her|his|hers)\b",
    r"\b(mother|father|mom|mum|dad|wife|husband|son|daughter|brother|sister|parents?|grand\w+|uncle|aunt|friend|child|children|kid|kids|baby|pregnan\w+|breastfeed\w*)\b",
    r"\b(a|an|this|that|one|the|your)\s+\w*\s*patient\b(?!\s+(population|group|level|pool))",
    r"\b\d{1,3}\s*[-\s]?\s*(year|yr|y)\s*[-\s]?\s*old\b|\baged?\s+\d{2}\b|\b\d{2}\s*yo\b",
    r"\b(hba1c|a1c|sugar|glucose|fbs|ppbs|egfr|gfr|creatinine|bmi)\s*(level|levels)?\s*(of|is|was|=|:|at|around|about)?\s*\d+(\.\d+)?(?!\s*(-|to|–)\s*\d)(?!\s*(point|points)\b)",
    r"\b(what|which|right|best|correct|maximum|max|safe|starting|usual)\s+(dose|dosage)\b|\b(dose|dosage)\s+(for|should|to take)\b|\bhow much\b",
    rf"\b(stop|stopping|quit|quitting|discontinu\w+|skip|skipping|switch|switching|start taking|come off|wean|taper|halve|miss|missed|forgot)\b.*\b{_DRUG}\b",
    rf"\b{_DRUG}\b.*\b(stop|stopping|quit|quitting|discontinu\w+|skip|skipping|switch|switching|come off|wean|taper|halve)\b",
    r"\bis it (ok|okay|safe|fine|alright|good)\b|\bok(ay)? to\b",
    rf"\b(prescri\w+|recommend\w*|advis\w+|cure|treat me)\b|\b(best|better)\s+{_DRUG}\b",
    r"\b(mujhe|meri|mera|mere|mujhko|kya|chahiye|band kar|lena chahiye|dawai|dawa|nenu|naaku|naku|aapu|enakku|naan|maruthuvam)\b",
)]
_SAFETY = re.compile(
    r"\b(side effects?|adverse|safety|safe|unsafe|nausea|vomit\w*|lactic|acidosis|ketoacid\w*|dka|pancreat\w*|thyroid|cancer|tumou?rs?|toxic\w*|"
    r"hypoglyc\w*|low blood sugar|risks?|causes?|danger\w*|harm\w*|kidney (damage|failure|injury)|retinopathy|infections?|warnings?|contraindicat\w*)\b", re.I)
_UNSUPPORTED = re.compile(
    r"\b(glimepiride|glipizide|gliclazide|glyburide|glibenclamide|sulfonylureas?|sulphonylureas?|pioglitazone|rosiglitazone|liraglutide|dulaglutide|exenatide|tirzepatide|mounjaro|"
    r"dapagliflozin|canagliflozin|linagliptin|vildagliptin|saxagliptin|acarbose|glargine|lantus|insulin(?!\s+(sensitivity|secretion|resistance|signal\w*|state|model|levels?)))\b", re.I)
_ADVICE = re.compile(
    r"\byou (should|can|may|must|need to|could|might want)\b|\b(safe|reasonable|fine|okay|ok|advisable|acceptable)\s+(for \w+ )?to\s+(stop|start|take|use|continue|skip|switch|reduce)\b|"
    r"\b(recommended|suggested|appropriate)\s+dose\b|\btake\s+\d|\bI\s+(recommend|suggest|advise)\b|\b(yes|no),?\s+(it|that|this)\s+(is|can|should)\b|"
    r"\b(one|two|three|four|five|half an?|a quarter)\s+(tablets?|pills?|mg|milligrams?|injections?)\b", re.I)
_NON_LATIN = re.compile(r"[Ѐ-῿⺀-￿]")

NUM = re.compile(r"(?<![\w.])(?:\d+(?:\.\d+)?|\.\d+)")
# Digits that are names or fixed phrases, not claims: "type 2 diabetes", "GLP-1", a PMID, a "95% interval",
# and list markers at the start of a line.
_NOT_A_CLAIM = re.compile(
    r"\btype[\s-]*[12]\b|\bGLP-?1\b|\bGIP\b|\bDPP-?4\b|\bSGLT-?[12]\b|\b(?:PMID|NCT|DOI)[:\s]*\S+|\b95\s?%\s*(?:predictive |confidence |credible )?(?:interval|CI)\b|^\s*\d+[.)]\s",
    re.I | re.M,
)


def classify(text: str) -> str:
    """One of emergency, language, personal, unsupported, safety or research."""
    normal = " ".join(text.split())
    if _NON_LATIN.search(normal):
        return "language"
    if _EMERGENCY.search(normal):
        return "emergency"
    if any(p.search(normal) for p in _PERSONAL):
        return "personal"
    if _UNSUPPORTED.search(normal):
        return "unsupported"
    if _SAFETY.search(normal):
        return "safety"
    return "research"


def is_personal_request(text: str) -> bool:
    return classify(text) in {"personal", "emergency", "language"}


def looks_like_advice(reply: str) -> bool:
    return bool(_ADVICE.search(reply))


def numbers(text: str) -> set[str]:
    return {_norm(m) for m in NUM.findall(_NOT_A_CLAIM.sub(" ", text))}


def _norm(value: str) -> str:
    if value.startswith("."):
        value = "0" + value
    return value.rstrip("0").rstrip(".") if "." in value else value


def _collect(value, out: set[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            out.update(numbers(str(key)))
            _collect(item, out)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _collect(item, out)
    elif isinstance(value, bool) or value is None:
        return
    elif isinstance(value, (int, float)):
        magnitude = abs(float(value))
        out.add(_norm(repr(magnitude)))
        for digits in (0, 1, 2, 3):
            out.add(_norm(f"{magnitude:.{digits}f}"))
        if magnitude <= 1:  # shares and probabilities are often written as percentages
            percent = magnitude * 100
            for digits in (0, 1):
                out.add(_norm(f"{percent:.{digits}f}"))
    elif isinstance(value, str):
        out.update(numbers(value))


def allowed_numbers(simulator_results: list, evidence_years: list[int]) -> set[str]:
    """Only simulator output vouches for a number. A question cannot, and literature vouches for its year only."""
    allowed: set[str] = set()
    for result in simulator_results:
        _collect(json.loads(json.dumps(result, default=str)), allowed)
    allowed.update(str(y) for y in evidence_years)
    return allowed


def check_reply(reply: str, allowed: set[str]) -> list[str]:
    """Numbers in the reply with no source. Empty means the reply passes."""
    return sorted(numbers(reply) - allowed)
