"""Rules the assistant cannot talk its way around. They run outside any model and default to caution.

Input is default-deny: a question reaches a provider or a simulation only with an explicit research frame.
A question naming a drug or dose without one gets a fixed reply, whatever its language, so no list of
phrasings has to be complete. Questions about a person, their labs or a treatment decision are refused even
with a frame, because "simulate" can be wrapped around a personal decision.
Output: a reply with an unsourced figure or advice-shaped wording does not reach the user. Regexes cannot
catch every implied piece of advice in free text, which is why designs and the lab's own failures are written by code.
"""
from __future__ import annotations

import json
import re
import unicodedata

URGENT_LINE = "If this is urgent, call 112 now. If you are thinking of harming yourself, call Tele-MANAS on 14416, free and open all day and night. "
REFUSAL = (
    URGENT_LINE +
    "I can't advise on anyone's own treatment, dose or medicine, including a patient or relative. This lab simulates "
    "populations for research and learning, and its results don't apply to an individual. Please talk to a doctor or "
    "pharmacist, and don't stop or change a medicine without their advice. I can still show how a drug class behaves "
    "across a virtual trial."
)
EMERGENCY = (
    "This could be urgent, so please don't rely on this lab. Contact local emergency services or a doctor now. In India you can call 112. "
    "If you are thinking of ending your life or harming yourself, please call Tele-MANAS on 14416, free and open all day and night, or tell someone near you right now. "
    "This lab is a research simulator and cannot assess symptoms or an overdose."
)
LANGUAGE = (
    "Emergency: call 112. Self-harm: call 14416. आपात स्थिति में 112 पर कॉल करें। खुद को नुकसान पहुँचाने के विचार आएँ तो 14416 पर कॉल करें। "
    "আপৎকালে 112 নম্বরে ফোন করুন। নিজের ক্ষতি করার চিন্তা এলে 14416 নম্বরে ফোন করুন। आणीबाणीत 112 वर कॉल करा। स्वतःला इजा करण्याचे विचार आल्यास 14416 वर कॉल करा। "
    "అత్యవసరమైతే 112కు కాల్ చేయండి. మీకు హాని చేసుకోవాలనే ఆలోచనలు వస్తే 14416కు కాల్ చేయండి. அவசரமெனில் 112 ஐ அழைக்கவும். உங்களுக்கு தீங்கு செய்யும் எண்ணம் வந்தால் 14416 ஐ அழைக்கவும். "
    "This assistant handles English research questions only, and it cannot advise on anyone's treatment. Please talk to a doctor or pharmacist. "
    "यह सहायक केवल अंग्रेज़ी शोध प्रश्नों के लिए है और उपचार की सलाह नहीं दे सकता। कृपया डॉक्टर या फार्मासिस्ट से बात करें। "
    "ఈ సహాయకం ఆంగ్ల పరిశోధన ప్రశ్నలకు మాత్రమే, చికిత్స సలహా ఇవ్వదు. దయచేసి వైద్యుడిని లేదా ఫార్మసిస్టును సంప్రదించండి। "
    "இந்த உதவியாளர் ஆங்கில ஆய்வுக் கேள்விகளுக்கு மட்டுமே; சிகிச்சை ஆலோசனை தராது. மருத்துவரையோ மருந்தாளரையோ அணுகவும்."
)
SCOPE = (
    URGENT_LINE +
    "I only run and explain simulated trials, so I can't answer questions about taking or choosing a medicine. If this is about anyone's own care, please ask a doctor or pharmacist. "
    "To run an experiment, try 'Simulate metformin 1000 mg against placebo' or 'Compare semaglutide 1 mg with empagliflozin 25 mg over 30 weeks'. To filter a study population by HbA1c, use the trial builder."
)
UNSUPPORTED = (
    URGENT_LINE +
    "That medicine isn't modelled here, so I can't simulate it or say how it combines with others. This lab covers semaglutide, "
    "empagliflozin, sitagliptin and metformin. Hypoglycaemia is not modelled, and its risk rises with sulfonylureas or insulin."
)

_DRUG = r"(metformin|semaglutide|empagliflozin|sitagliptin|ozempic|jardiance|januvia|glucophage|wegovy|rybelsus|drug|drugs|medicine|medicines|medication|medications|meds?|pills?|tablets?|insulin|dose|dosage|treatment|therapy)"
_RESEARCH_NOUN = r"(trial|trials|study|studies|simulation|simulations|experiment|experiments|design|candidate|molecule|hypothesis|research|project|model|cohort|analysis|question)"
_EMERGENCY = re.compile(
    r"overdos|took too (much|many)|taken too (much|many)|poison|suicid|kill myself|unconscious|passed out|faint|seizure|can'?t breathe|trouble breathing|"
    r"chest pain|fruity breath|severe (pain|vomiting|bleeding)|(belly|stomach|abdominal) pain|what now|emergency|very low (blood )?sugar|confused|black(ed)? out|collaps\w+|not waking|sugar (is )?(very |too )?(low|crash\w*)|double dose|\bhypo\b|breathless|shaking|"
    r"swallow\w*|(whole|entire|full) (pen|box|strip|bottle)|by mistake|accident\w*|don'?t want to live|no reason to (live|go on)|go on living|end(ing)? (it|my life)|want it to be over|self.?harm|"
    r"jaan dena|mar(na)? (jana )?chahta|khudkushi|aatmahatya|behosh|bewhosh|ulti ho|saans|unresponsive|limp\b|throat|tongue|lips\b|swelling|breathing (very )?fast|barely (stay )?awake|can'?t wake|black toe|gangrene|throwing up", re.I)
_ALWAYS_URGENT = re.compile(
    r"\b(suicid\w*|kill (myself|me)|want to die|wanna die|harm(ing)? myself|hurt(ing)? myself|end(ing)? (it|it all|my life)|done with life|don'?t want to (live|be alive|wake up)|not wake up|better off without me|no reason to (live|go on)|go on living|"
    r"what'?s the point of going on|want it to be over|can'?t do this anymore|saving up my|self.?harm|jaan dena|jeena nahi|marne ka|mar(na)? (jana )?chahta|mujhe marna|khudkushi|aatmahatya|chavalani|chachipo\w*|saaga thon\w*|sethu poga|bachte chai na|morte chai|jagaycha nahi|marayche|"
    r"overdos\w*|swallow\w*|took \d+ \w*\s*(tablets|pills)|\d+ \w*\s*(tablets|pills) (instead|by mistake)|(whole|entire|full) (pen|box|strip|bottle)|dangerous amount|toxic dose|lethal|"
    r"vomiting blood|anaphyla\w*|throat|tongue|lips\b|lost vision|deep fast breathing|breathing (very )?fast|dka\b.*\bnow\b|large ketones|unconscious|behosh|bewhosh|what (do i|to) do (right )?now)\b", re.I)
_URGENT_IN_SCRIPT = re.compile(r"मरना|जीना नहीं|बेहोश|बेशुद्ध|जगायचं नाही|चावाल|చావాల|స్పృహ|சாக வேண்டும்|மயக்க|অজ্ঞান|বাঁচতে চাই না")
_KETONES = re.compile(r"\bketones?\b.*\d|\d.*\bketones?\b", re.I)
_NOT_URGENT = re.compile(r"\b(how common|reported|rate of|incidence|in the (\w+ )*trial|modell?ed|in the model|the model include)\b", re.I)
_GLUCOSE_VALUE = re.compile(r"\b(?<!urinary )(?:sugar|glucose|rbs|grbs|bg)\b\D{0,15}(\d+(?:\.\d+)?)", re.I)
_METER_EXTREME = re.compile(r"(meter|reading)\D{0,20}\b(HI|LO)\b|\bsays (HI|LO)\b")
GLUCOSE_DANGER_LOW, GLUCOSE_DANGER_HIGH, GLUCOSE_NOT_A_READING = 54, 400, 20


def _is_urgent(text: str) -> bool:
    """Severe symptoms, overdose, self-harm or a dangerous glucose reading. Checked before anything else, so a research word can't hide one."""
    if _ALWAYS_URGENT.search(text):
        return True
    if _NOT_URGENT.search(text):
        return False
    if _EMERGENCY.search(text) or _KETONES.search(text) or _METER_EXTREME.search(text):
        return True
    return any(float(m[1]) >= GLUCOSE_DANGER_HIGH or GLUCOSE_NOT_A_READING <= float(m[1]) <= GLUCOSE_DANGER_LOW for m in _GLUCOSE_VALUE.finditer(text))
_PERSONAL = [re.compile(p, re.I) for p in (
    rf"\b(my|mine|our)\b(?!\s+{_RESEARCH_NOUN}\b)",
    r"(?<!show )(?<!tell )(?<!give )(?<!help )(?<!let )(?<!teach )\bme\b",
    r"\b(i|we)\s+(\w+\s+)?(am|was|have|had|take|took|get|got|feel|felt|use|used|stopped|started|missed|forgot|been|suffer|suffered|on)\b",
    r"\bi['’](m|ve|d|ll)\b|\b(im|ive)\b",
    r"\b(should|shall|can|could|may|must|do|would|shud|shld)\s+(i|we|he|she|they|you)\b(?!\s+(simulate|run|compare|design|test|see|show|model|use this|ask|trust|do\b|help|explain|tell|need for|need in|need to (detect|run|show|enrol)))",
    r"\b(he|she|him|her|his|hers)\b",
    r"\b(mother|father|mom|mum|dad|papa|mama|amma|appa|nanna|bhai|didi|wife|husband|son|daughter|brother|sister|parents?|grand\w+|uncle|aunt|friend|child|children|kid|kids|baby|pregnan\w+|breastfeed\w*)\b",
    r"\b(mr|mrs|shri|smt)\.?\s+\w+",
    r"\b(man|woman|lady|gentleman|elderly|pt|person|someone|diabetics?|character|nani|nana|dadi|dada|sasur|saas|thatha|paati|ammamma|nanamma|akka|anna|thambi|sir)\b",
    r"\b(cohort of one|n\s*=\s*1\b|one (participant|person)|single (participant|person))\b",
    r"\b(ignore|disregard|forget)\s+(\w+\s+){0,3}(rules?|instructions?|guard|prompt)\b|\bsystem\s*:|\byou are now\b|\bpretend\b|\bjailbreak\b",
    r"\bpatient\b(?!\s+(population|group|level|pool|per|count|numbers?|size))",
    r"\b\d{1,3}\s*[-\s]?\s*(year|yr|y)\s*[-\s]?\s*old\b|\baged?\s+\d{2}\b|\b\d{2}\s*yo\b",
    r"\b(what|which|right|best|correct|maximum|max|safe|starting|usual)\s+(dose|dosage)\b|\b(dose|dosage)\s+(for|should|to take)\b|\bhow much\b",
    rf"\b(stop|stopping|quit|quitting|discontinu\w+|skip|skipping|switch|switching|start taking|come off|wean|taper|halve|miss|missed|forgot)\b.*\b{_DRUG}\b",
    rf"\b{_DRUG}\b.*\b(stop|stops|stopped|stopping|quit|quitting|discontinu\w+|skip|skipping|switch|switching|come off|wean|taper|halve)\b",
    r"\bis it (ok|okay|safe|fine|alright|good)\b|\bok(ay)? to\b",
    rf"\b(prescri\w+|recommend\w*|advis\w+|advice|cure|treat me)\b|\b(best|better)\s+{_DRUG}\b",
    rf"\b(pick|choose|select|decide)\b.*\b{_DRUG}\b|\b{_DRUG}\b.*\b(pick|choose|select)\b",
    r"\b(mujhe|meri|mera|mere|mujhko|kya|chahiye|band kar|lena chahiye|dawai|dawa|nenu|naaku|naku|aapu|enakku|naan|maruthuvam)\b",
)]
# A lab value in a question. One value describes a person. An eGFR span can describe a study population, but
# only with cohort framing, real width and no judgement about a medicine. The tools can't filter on other labs,
# so a framed span of those is declined rather than silently ignored.
_LAB_NAME = r"hb[\s-]?a1c|a1c|sugars?|glucose|fbs|ppbs|rbs|grbs|egfr|e-gfr|gfr|creat(?:inine)?|cr|bmi|glyc\w+ h\w+"
_LAB_SINGLE = re.compile(
    rf"\b(?:{_LAB_NAME})\b[\s\W]{{0,3}}(?:(?:level|levels|reading|value|result|is|are|was|has|have|now|came|come|back|went|gone|up|down|dropped|to|about|around|at|of|still|currently)\W{{0,2}}\s*){{0,4}}"
    r"\d+(?:\.\d+)?(?!\d)(?!\.\d)(?!\s*(?:-|to|–|and)\s*\d)(?!\s*-?\s*(?:weeks?|wks?)\b)(?!\s*or\s*\d+\s*-?\s*weeks?\b)(?!\s*(?:points?)\b)"
    r"|\bhb[\s-]?a1c\d|\bhb[a-z0-9]{2,4}\s+\d+(?:\.\d+)?(?!\d)(?!\.\d)(?!\s*(?:-|to|–|and)\s*\d)(?!\s*(?:points?)\b)|\bfasting \d|\bkidney function \d|\bcreatinine clearance \d"
    r"|\b\d+(?:\.\d+)?\s*%?\s*(?:hb[\s-]?a1c|a1c|egfr|gfr)\b(?!\s*(?:difference|reduction|change|effect|drop)\b)"
    r"|\b(?:hb[\s-]?a1c|a1c|sugar|egfr|gfr|creatinine)\s+(?:is\s+|of\s+|at\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\b", re.I)
_LAB_SPAN = re.compile(r"\b(?P<lab>hb[\s-]?a1c|a1c|egfr|gfr|bmi|creatinine)\s*(?:of\s*)?(?P<a>\d+(?:\.\d+)?)\s*(?:-|to|–|and)\s*(?P<b>\d+(?:\.\d+)?)", re.I)
_LAB_BOUND = re.compile(r"\b(?P<lab>hb[\s-]?a1c|a1c|sugars?|glucose|egfr|gfr|bmi|creatinine)\s*(?:under|below|above|over|less than|greater than|more than|<=?|>=?|≤|≥)\s*\d", re.I)
_BASELINE = re.compile(r"\bbaseline\b", re.I)
_MIN_WIDTH = {"egfr": 5, "gfr": 5, "bmi": 2, "creatinine": 0.3}
_DEFAULT_MIN_WIDTH = 0.5
_COHORT = re.compile(r"\b(simulate|simulated|simulation|trial|study|cohort|people with|participants?|per arm|population|enrol\w*|run)\b", re.I)
_JUDGEMENT = re.compile(r"\b(fine|okay|ok|enough|reduce|adjust|add|safe|should|right|best|whether|dose at|sufficient|adequate|appropriate|continue|decide|need|can it|works?|still|which (comes|one|is))\b", re.I)
_INVISIBLE_CATEGORIES = {"Cf", "Mn", "Me"}
_LAST_LATIN = 0x24F


def _normalise(text: str) -> str:
    """Folds lookalike forms and removes invisible marks, so spelling tricks don't change the verdict."""
    folded = unicodedata.normalize("NFKC", text)
    return "".join(c for c in unicodedata.normalize("NFD", folded) if unicodedata.category(c) not in _INVISIBLE_CATEGORIES)


def _is_kidney(lab: str) -> bool:
    return lab.lower() in {"egfr", "gfr"}


def _lab_verdict(text: str) -> str | None:
    """'personal', 'scope' or None if the question names no lab value that matters."""
    if _LAB_SINGLE.search(text):
        # A study's stated baseline, which the tools can't set: send it to the builder rather than give a medical refusal.
        return "scope" if _BASELINE.search(text) and _COHORT.search(text) and not _JUDGEMENT.search(text) else "personal"
    verdict = None
    for match in _LAB_SPAN.finditer(text):
        lab = match["lab"].lower()
        width = abs(float(match["b"]) - float(match["a"]))
        if not _COHORT.search(text) or _JUDGEMENT.search(text) or width < _MIN_WIDTH.get(lab, _DEFAULT_MIN_WIDTH):
            return "personal"
        verdict = verdict if _is_kidney(lab) else "scope"
    for match in _LAB_BOUND.finditer(text):
        if not _COHORT.search(text) or _JUDGEMENT.search(text):
            return "personal"
        verdict = verdict if _is_kidney(match["lab"]) else "scope"
    return verdict


# Allowlist: only these reach a provider or a simulation. Words that everyday questions share with research,
# such as "run out of" or "not responding", are written narrowly on purpose.
_DRUG_NAMES = r"empa|sita|sema|glycomet|istavel|galvus|metf\w+|semag\w+|empag\w+|sitag\w+|ozem\w*|jardi\w*|janu?v\w*|glucophage|wegovy|rybelsus|mounjaro|glp-?1|sglt-?2|dpp-?4"
_DRUG_TALK = re.compile(rf"\b({_DRUG_NAMES}|drugs?|medicines?|medications?|meds?|mandulu|maathirai|marundhu|goli|davai|dawai|dawa|pills?|tablets?|dos[aei]\w*|regimen|injection|inject\w*|sugar)\b", re.I)
_FRAME = re.compile(
    rf"\b(simulat\w*|sim|compar\w*|versus|vs|trials?|effect size|dropout|comparator|empa-reg|sustain|ukpds|predict\w*|stud(y|ies)|cohort|per arm|arms|placebo|power|sample size|who responds|responders?|subgroups?|design\w*|intervals?|validat\w*|accura\w*|assum\w*|parameters?|model(s|led)?|calibrat\w*|surrogate"
    rf"|virtual|enrol\w*|participants?|mechanism|progression|pathogenesis|natural history|progress\w*|insulin sensitivity|dose.response|weaken\w*|difference between|how many patients|lab|trust|blind test|held.out|rival|seed|reproducib\w*|run\s+(a|an|the|\d|{_DRUG_NAMES}))\b", re.I)
# A research word alone doesn't make a research question, so there are two tiers once a drug is named.
# Strong words ("in the model", "placebo arm") pass unless a person cue appears: refusing every question a student
# phrases freely would make the copilot useless, and what it returns is a population figure with its failed checks attached.
# Weak words ("vs", "compare", "run") are what a person choosing a medicine types, so they also need a stated dose
# and nothing but research vocabulary: "Ozempic vs Jardiance, which one to take" fails on both.
_STRONG_FRAME = re.compile(
    r"\b(simulat\w*|sim|models?|modelled|virtual|arms?|trials?|stud(y|ies)|cohort|participants?|placebo|power|sample size|effect size|dropout|comparator|non.inferiority|surrogate|validat\w*|calibrat\w*|assum\w*|parameters?|"
    r"held.out|blind test|rival|lab|who responds|responders?|subgroups?|design\w*|intervals?|predict\w*|prediction|empa-reg|sustain|ukpds|duration-4|how many patients|dose.res\w*|weaken\w*|progression)\b", re.I)
_PERSON_CUE = re.compile(
    r"\b(myself|ourselves|self|us|(?<!do )i\s+(want|need|plan|weigh|wish|hope|will)|will i|am i|nephew|niece|cousin|hubby|spouse|partner|boyfriend|girlfriend|fiance\w*|neighbou?r|colleague|boss|roommate|client|in-?laws?|"
    r"\d{2}\s*/?\s*(?:[mf]|male|female)|(?:[mf]|male|female)\s*/?\s*\d{2}|y/o|\d{2}\s*yrs?|\d+\s*kg|"
    r"to (take|buy)|go with|worth|better|enough|giving up|doctor|this morning|better move|deciding|decide|tonight|tomorrow|doctor (gave|ne)|empty stomach|before food|after food|with food|nursing|gestation|expecting|lactating|cirrhosis|dialysis|one kidney|weak kidneys?|kidney (weak|issues?|problem)|which one|"
    r"kaun|konsi|theek|sahi|lun|manchidi|naa kosam|amar|jonno|osudh|bhalo|enaku|edhu|nalladhu|majhya|sathi|mala|ghyaycha|chalao|cheyandi|koro|pannunga)\b", re.I)
_DOSE_STATED = re.compile(r"\b\d+(?:\.\d+)?\s*(?:mg|g)\b", re.I)
_RESEARCH_WORDS = frozenset("""
me my a an the of in on at to for with and or vs versus against compared compare comparing by from as is are was were does did do how what which why when where who can could would will it its this that these those be been than per over under
above below across between into any all each both not no if there their your you many much need
simulate simulated simulation simulations simulator run trial trials study studies virtual cohort arm arms placebo mg week weeks weekly daily day patients participants people population model modelled models lab
validation validate validated calibration calibrated held out held-out blind test published prediction predictions predict predicts predicted observed interval intervals confidence coverage error accuracy accurate power sample size
non inferiority margin design designs designer pick dose doses dose-finding dose-ranging range response dose-response curve parameter parameters assumption assumptions assume assumed assumes mechanism action represented represent
effect effects endpoint endpoints hba1c a1c weight body change reduction lower lowers result results reproduce reproduced point points miss missed failed fail find found
background add-on therapy head-to-head parallel-group crossover group phase three-arm neural surrogate full mechanistic sglt2 inhibition urinary glucose excretion glp-1 receptor agonist clearance egfr kidney disease weaken weakens account
include estimate report prevent progression treatment fall inside renal drug class largest sustain sustain-1 empa-reg outcome bid mg/week mg/day responds responders subgroup subgroups hypothetical candidate molecule naive drug-naive metformin-only monotherapy combination explain show list summarise summarize
""".split())
_WORD = re.compile(r"[a-z0-9][a-z0-9\-/\.%]*")
_ANY_NUMBER = re.compile(r"[\d.,%=]+(mg)?|\d+-weeks?|\d+-point")
_A_DRUG = re.compile(rf"^(?:{_DRUG_NAMES})$", re.I)


def _words(text: str) -> list[str]:
    return [w.rstrip(".,") for w in _WORD.findall(text.lower().replace("responds best", "responds").replace("do i need", "need").replace("can i simulate", "simulate"))]


def _names_a_drug(text: str) -> bool:
    return any(_A_DRUG.match(w) for w in _words(text))


def _outside_research_words(text: str) -> bool:
    return any(w not in _RESEARCH_WORDS and not _ANY_NUMBER.fullmatch(w) and not _A_DRUG.match(w) for w in _words(text))


# Research wording that the personal rules would otherwise catch. Not applied when a person is plainly named.
_RESEARCH_PHRASES = [re.compile(p, re.I) for p in (
    r"\bvirtual patient\b|\bpatient[- ](reported|selection|recruitment|characteristics|enrol\w*)\b",
    r"\b(model|lab|simulator|it|trials?) (did )?miss\b|\bmiss(ed)? (the |any )?(trials?|results?|SUSTAIN)\b",
    r"\b(type|phase) I\b",
    r"\bhow much (does|did|do|weight|hba1c)\b.*\b(simulat\w*|model|arm|trial)\b",
    r"\b(can|could|would) you (summari[sz]e|list|plot|describe|define|show)\b",
    r"\bstopping rules?\b|\b(discontinuation|dropout) rate\b|\bparticipants? (stop|discontinu)|\b(did|do) participants\b",
    r"\bwhat dose range\b|\bdose (does|did) the designer\b",
)]
_ALWAYS_RESEARCH_PHRASES = re.compile(r"\bhow much should i trust\b|\b(i['’]m|i am) a (judge|student|researcher|reviewer)\b|\bas a (judge|student|researcher|reviewer)(,? i want to)?\b|\bfor my (thesis|project|class|course|assignment|dissertation)(,? i want to)?\b|\bmy (professor|guide|supervisor) asked me\b|\bpregnancy exclusion\b|\bdo you\b|\bwould you\b", re.I)
_NAMES_A_PERSON = re.compile(r"\b(my|mine|our|he|she|him|her|his|hers|should i|can i|i am|i'm|i take|mother|father|papa|wife|husband)\b", re.I)
_NOT_A_HARM_QUESTION = re.compile(r"\bnot modelled\b|\brisk of bias\b", re.I)


def _without_research_phrases(text: str) -> str:
    text = _ALWAYS_RESEARCH_PHRASES.sub(" trial ", text)
    if _NAMES_A_PERSON.search(text):
        return text
    for phrase in _RESEARCH_PHRASES:
        text = phrase.sub(" trial ", text)
    return text


_SAFETY = re.compile(
    r"\b(side effects?|adverse|safety|safe|unsafe|nausea|vomit\w*|lactic|acidosis|ketoacid\w*|dka|pancreat\w*|thyroid|cancer|tumou?rs?|toxic\w*|"
    r"hypoglyc\w*|low blood sugar|risks?|causes?|danger\w*|harm\w*|kidney (damage|failure|injury)|retinopathy|infections?|warnings?|labels?|contraindicat\w*)\b", re.I)
_UNSUPPORTED = re.compile(
    r"\b(glimepiride|glipizide|gliclazide|glyburide|glibenclamide|sulfonylureas?|sulphonylureas?|pioglitazone|rosiglitazone|liraglutide|dulaglutide|exenatide|tirzepatide|mounjaro|"
    r"dapagliflozin|canagliflozin|linagliptin|vildagliptin|saxagliptin|acarbose|glargine|lantus|insulin(?!\s+(sensitivity|secretion|resistance|signal\w*|state|model|levels?)))\b", re.I)
_DRUG_NAME = r"(metformin|semaglutide|empagliflozin|sitagliptin|ozempic|jardiance|januvia|glucophage)"
_ADVICE = re.compile(
    r"\byou (should|can|may|must|need to|could|might want)\b|\b(safe|reasonable|fine|okay|ok|advisable|acceptable)\s+(for \w+ )?to\s+(stop|start|take|use|continue|skip|switch|reduce)\b|"
    r"\b(recommended|suggested|appropriate)\s+dose\b|\btake\s+\d|\bI\s+(recommend|suggest|advise)\b|\b(yes|no),?\s+(it|that|this)\s+(is|can|should)\b|"
    r"\b(one|two|three|four|five|half an?|a quarter)\s+(tablets?|pills?|mg|milligrams?|injections?)\b|"
    # Dose guidance with no "you" in it, which a repair could otherwise launder by dropping its numbers.
    r"\b(patients?|people|adults?|clinicians?|doctors?|physicians?|someone|anyone|individuals?)\b[^.]{0,40}\b(should|can|could|may|must|need to|ought to)\s+(\w+\s+)?(start|stop|take|use|continue|switch|reduce|increase|begin|skip|receive|be given|be started)\b|"
    r"\b(best|right|ideal|optimal|correct|safe|proper)\s+(dose|dosage)\b|"
    rf"(?:^|[.;:!?]\s+)(start|stop|take|begin|reduce|increase|switch|skip|continue)\s+(taking\s+)?({_DRUG_NAME}|at|there)\b", re.I | re.M)
_ADVICE_INDIRECT = re.compile(
    r"\byou(?:['’]d|['’]ll| would| shouldn['’]?t| better)\b|\byour (dose|medicine|medication|treatment|tablets?)\b|"
    r"\b(should|must|can|may|need to|needs to|ought to)\s+(not\s+)?be\s+(stopped|started|continued|taken|given|lowered|halved|reduced|increased|switched|held|used|discontinued)\b|"
    r"\b(just|please|best to|better to|sensible to|alright to|go ahead and|try|consider|keep taking|hold|halve|lower|discontinue)\s+(\w+\s+)?(stopping|switching|starting|stop|start|take|taking|metformin|semaglutide|empagliflozin|sitagliptin|the dose)\b|"
    r"\b(diabetics|men|women|those|users|elderly)\b[^.]{0,40}\b(should|must|need|needs)\b|"
    r"\b(patients?|people|adults?)\b[^.]{0,40}\b(should|must|would benefit)\s+(\w+\s+)?\w+|"
    r"(?:^|[.;:!?\-]\s*)(take|inject|hold|halve|lower|stop|start)\s+(it|with|once|twice|the|metformin|semaglutide|empagliflozin|sitagliptin)\b|"
    r"\b(metformin|semaglutide|empagliflozin|sitagliptin)\b[^.]{0,30}\b(is|are)\s+(safe|fine|preferred|best|the better choice|enough)\b|"
    r"\b(better choice|is preferred|dose reduction is|lower dose is|no need to|(stopping|continuing|switching)\s+\w+\s+is)\b|"
    r"\b(take|inject|use)\b[^.]{0,20}\b(once|twice)\s+(daily|weekly|a day|a week)\b|\b(six|seven|eight|nine|ten)\s+(tablets?|pills?)\b", re.I | re.M)
_MODEL_REFUSAL = re.compile(r"\b(i can'?t|i cannot|i'm unable|i am unable|i won'?t)\b.{0,50}\b(advis\w*|advice|recommend\w*|dose|dosage|treatment|medical|prescri\w*)|\b(consult|talk to|see|speak (to|with)|ask) (a|your) (doctor|clinician|physician|pharmacist)", re.I)
_NON_LATIN = re.compile(r"[Ѐ-῿⺀-￿]")

_WORD_NUMBER = re.compile(
    r"\b(one|two|three|four|five|six|seven|eight|nine|ten|twice|double|triple|half)\b\s*(?:a\s+)?(points?|percent|percentage|kg|kilograms?|grams?|micrograms?|mg|milligrams?|times|the|in ten|out of ten|hundred|thousand)\b|"
    r"\b(eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b|"
    r"\b(two|three|four)[- ]thirds?\b|\b(three )?quarters? of\b|\bfull point\b|\b\w+-?fold\b|\btwice as\b|\b(doubled|tripled|halved)\b|\bhalf of\b", re.I)
NUM = re.compile(r"(?<![\w.])(?:\d+(?:\.\d+)?|\.\d+)")
# Digits that are names or fixed phrases, not claims: "type 2 diabetes", "GLP-1", a PMID, a "95% interval",
# the unit mL/min/1.73 m2, and list markers at the start of a line.
_NOT_A_CLAIM = re.compile(
    r"\btype[\s-]*[12]\b|\bGLP-?1\b|\bGIP\b|\bDPP-?4\b|\bSGLT-?[12]\b|\b(?:PMID|NCT|DOI)[:\s]*\S+|\b95\s?%\s*(?:predictive |confidence |credible |uncertainty |simulated )?(?:intervals?|CI|range)\b|/\s*1\.73\s*m(?:2|²)?|^\s*\d+[.)]\s",
    re.I | re.M,
)


def classify(text: str) -> str:
    """One of emergency, language, personal, unsupported, safety, scope, chat or research. Only research reaches a provider."""
    folded = _normalise(text)
    if _URGENT_IN_SCRIPT.search(text):
        return "emergency"
    if _NON_LATIN.search(text) or any(c.isalpha() and ord(c) > _LAST_LATIN and c != "\u03bc" for c in folded):
        return "language"
    normal = " ".join(folded.replace("_", " ").split())
    if _is_urgent(normal):
        return "emergency"
    plain = _without_research_phrases(normal)
    if any(p.search(plain) for p in _PERSONAL):
        return "personal"
    lab = _lab_verdict(normal)
    if lab == "personal":
        return "personal"
    if _UNSUPPORTED.search(normal):
        return "unsupported"
    if _SAFETY.search(normal) and not _NOT_A_HARM_QUESTION.search(normal):
        return "safety"
    if not _FRAME.search(normal):
        return "scope" if _DRUG_TALK.search(normal) else "chat"
    if _names_a_drug(normal):
        if _PERSON_CUE.search(_ALWAYS_RESEARCH_PHRASES.sub(" ", normal)):
            return "scope"
        if not _STRONG_FRAME.search(normal) and (not _DOSE_STATED.search(normal) or _outside_research_words(normal)):
            return "scope"
    return lab or "research"


def is_personal_request(text: str) -> bool:
    return classify(text) in {"personal", "emergency", "language"}


def looks_like_advice(reply: str) -> bool:
    normal = " ".join(_normalise(reply).split()).replace("*", "").replace("_", " ")
    return bool(_ADVICE.search(normal) or _ADVICE_INDIRECT.search(normal))


def looks_like_refusal(reply: str) -> bool:
    """A model declining. That decision stands: no other path may then answer the same question."""
    return bool(_MODEL_REFUSAL.search(reply))


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


def repair_request(unsourced: list[str]) -> str:
    """What the model is told when its draft used figures no tool produced. It gets one chance to rewrite."""
    return (f"Your draft used these figures, field names or drug names that no tool result supports: {', '.join(unsourced)}. Rewrite the reply in plain words, using only numbers copied exactly from the tool results. "
            "Do not add, subtract, average or round them yourself, and do not cite years or figures a tool did not return. Omit anything you cannot source.")


NO_TOOL_REQUEST = "You answered without running a tool, so nothing in your reply is sourced. Call the tool that answers this question, then reply only from its result."
_NAMED_DRUG = re.compile(r"\b(metformin|semaglutide|empagliflozin|sitagliptin|ozempic|jardiance|januvia|glucophage)\b", re.I)
_FIELD_LIKE = re.compile(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b")


def _keys(value, out: set[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            out.add(str(key))
            _keys(item, out)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _keys(item, out)


def unsourced_or_raw(reply: str, simulator_results: list, evidence_years: list[int]) -> list[str]:
    """Figures no tool produced, plus result field names shown to the reader. Parameter names are values, so they pass."""
    keys: set[str] = set()
    _keys(simulator_results, keys)
    returned = json.dumps(simulator_results, default=str).lower()
    drugs = {m.group(0) for m in _NAMED_DRUG.finditer(reply) if m.group(0).lower() not in returned}
    return sorted(set(check_reply(reply, allowed_numbers(simulator_results, evidence_years))) | {m for m in _FIELD_LIKE.findall(reply) if m in keys} | drugs)


EMPTY_REPLY_REQUEST = "Your last turn returned no text. Reply now in plain sentences, from the tool results you already have."


def check_reply(reply: str, allowed: set[str]) -> list[str]:
    """Numbers in the reply with no source. Empty means the reply passes."""
    return sorted((numbers(reply) - allowed) | {m.group(0) for m in _WORD_NUMBER.finditer(reply)})
