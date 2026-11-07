"""What the assistant can do. Every number it can report comes from one of these functions."""
from __future__ import annotations

import json
import logging
import re

import httpx

from .. import designer, drugs, labels, limits, population as pop, progression, safety, trial
from ..params import PARAMS
from ..progression_scenarios import SCENARIOS
from . import knowledge, track_record

log = logging.getLogger("medlab.tools")
_DOSES = labels.DOSE_RANGE
_NUMBER_SCHEMA = {"type": "number"}
POWER_TARGET_PERCENT = 80  # the size trial.power_curve reports as smallest_size_reaching_80pct
INTERVAL_LEVELS_PERCENT = (50, 80, 95)
PROGRESSION_MODEL_YEAR = 2016
_ARM_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"drug": {"type": "string", "enum": sorted(_DOSES)}, "mg": _NUMBER_SCHEMA},
    "required": ["drug", "mg"],
}
_DESIGN_PROPS = {
    "arms": {"type": "array", "items": _ARM_SCHEMA, "maxItems": 3, "description": "Active arms, at most 3. Placebo control is added automatically."},
    "weeks": {"type": "integer"},
    "n_per_arm": {"type": "integer"},
    "background": {"type": "string", "enum": ["any", "naive", "metformin"]},
    "egfr_min": _NUMBER_SCHEMA,
    "egfr_max": _NUMBER_SCHEMA,
}


def _regimen(entry: dict) -> tuple[str, drugs.Regimen]:
    drug, mg = entry["drug"], float(entry["mg"])
    if drug not in _DOSES:
        raise ValueError(f"unknown drug {drug}")
    low, high = _DOSES[drug]
    if not low <= mg <= high:
        raise ValueError(f"{drug} {mg:g} mg is outside the modelled range {low:g}-{high:g} mg")
    name = f"{drug.capitalize()} {mg:g} mg" + ("/week" if drug == "semaglutide" else "/day")
    return name, drugs.Regimen(name, (drugs.standard_dose(drug, mg),))


def build_design(args: dict) -> trial.Design:
    arms = [trial.Arm("Placebo", drugs.Regimen("Placebo"))]
    for entry in args.get("arms", []):
        name, regimen = _regimen(entry)
        arms.append(trial.Arm(name, regimen))
    if len(arms) < 2:
        raise ValueError("name at least one drug and dose to test")
    if len(arms) > 4:
        raise ValueError("compare at most 3 drugs at a time")
    criteria = pop.Criteria(
        background=args.get("background", "any"),
        egfr_range=(float(args.get("egfr_min", 30)), float(args.get("egfr_max", 400))),
        min_pool=15,
    )
    return trial.Design(
        arms=tuple(arms), weeks=int(args.get("weeks", 26)), n_per_arm=int(args.get("n_per_arm", 200)),
        criteria=criteria, dropout=float(args.get("dropout", 0.0)), seed=int(args.get("seed", 1)),
    )


def _design_echo(design: trial.Design) -> dict:
    """What was actually run, so a reply may state it: these are the tool's own inputs, not estimates."""
    return {"weeks": design.weeks, "n_per_arm": design.n_per_arm, "background": design.criteria.background, "egfr_range": list(design.criteria.egfr_range)}


def run_virtual_trial(args: dict) -> dict:
    design = build_design(args)
    return {**limits.run_heavy(trial.run_trial, design), "track_record": track_record.for_design(design), "design_run": _design_echo(design)}


def power_analysis(args: dict) -> dict:
    design = build_design(args)
    return {**limits.run_heavy(trial.power_curve, design), "design_run": _design_echo(design), "target_power_percent": POWER_TARGET_PERCENT, "track_record": track_record.for_design(design)}


def who_responds(args: dict) -> dict:
    design = build_design(args)
    return {**limits.run_heavy(trial.responders, design), "design_run": _design_echo(design), "track_record": track_record.for_design(design)}


def drug_safety(args: dict) -> dict:
    return safety.drug_safety(args["drug"])


def lab_status(_: dict) -> dict:
    """What has actually been finished, read from the result files."""
    try:
        names, _draws, _digest = trial.calibrate.load_posterior()
        data = json.loads(trial.calibrate.POSTERIOR.read_text())
        calibration = {"finished": True, "converged": data.get("converged"), "parameters_fitted": len(names)}
    except FileNotFoundError:
        calibration = {"finished": False}
    return {"calibration": calibration, "validation": trial.validation_status()}


def validation_report(_: dict) -> dict:
    return {"validation": trial.validation_status(), "how_to_read": "Held-out trials were predicted before their results were opened.", "interval_levels_percent": list(INTERVAL_LEVELS_PERCENT), **track_record.overview()}


def model_assumptions(_: dict) -> dict:
    rows = [{"name": p.name, "value": p.value, "unit": p.unit, "kind": p.kind, "source": p.source} for p in PARAMS.values()]
    names = {kind: [r["name"] for r in rows if r["kind"] == kind] for kind in ("published", "calibrated")}
    return {"parameters": rows, "assumed_parameters": [r for r in rows if r["kind"] == "assumed"], "published_parameter_names": names["published"], "calibrated_parameter_names": names["calibrated"]}


def design_study(args: dict) -> dict:
    goal = designer.Goal(args["drug"], float(args.get("target_effect", 1.0)), int(args.get("weeks", 26)), args.get("background", "any"))
    return limits.run_heavy(designer.design_study, goal)


def simulate_progression(args: dict) -> dict:
    """Natural-history scenarios from Ha-Satin-Sherman 2016. Returns a summary, not a drug prediction."""
    scenario = SCENARIOS.get(str(args.get("scenario", "published-figure7-reference")))
    if scenario is None:
        raise ValueError(f"unknown scenario; choose from {sorted(SCENARIOS)}")
    result = limits.run_heavy(progression.simulate_t2d, scenario.config)
    rows = result["trajectory"]
    return {"scenario": scenario.id, "title": scenario.title, "description": scenario.description, "evidence_class": scenario.evidence_class,
            "summary": {k: round(v, 3) if isinstance(v, float) else v for k, v in result["summary"].items()}, "events": progression.threshold_events(rows),
            "limitations": result["limitations"], "reference": result["reference"]["doi"], "published_year": PROGRESSION_MODEL_YEAR}


_EVIDENCE_TIMEOUT = 15
_TITLE_MAX = 150


def _clean_title(text: str) -> str:
    """Registry and PubMed titles are untrusted: flatten them and bound their length."""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", str(text))[:_TITLE_MAX]


def search_registry(args: dict) -> dict:
    """ClinicalTrials.gov search. Titles here are untrusted text and never supply results."""
    query = str(args["query"])[:200]
    response = httpx.get("https://clinicaltrials.gov/api/v2/studies", params={"query.term": query, "pageSize": 6, "fields": "NCTId,BriefTitle,OverallStatus,StartDate"}, timeout=_EVIDENCE_TIMEOUT)
    response.raise_for_status()
    rows = []
    for study in response.json().get("studies", []):
        section = study["protocolSection"]
        date = section.get("statusModule", {}).get("startDateStruct", {}).get("date", "")
        rows.append({"id": section["identificationModule"]["nctId"], "title": _clean_title(section["identificationModule"]["briefTitle"]), "status": section.get("statusModule", {}).get("overallStatus"), "year": int(date[:4]) if date[:4].isdigit() else None})
    return {"trials": rows, "evidence": True}


def search_literature(args: dict) -> dict:
    """PubMed search. Returns ids, titles and years only; a hit is not an appraisal."""
    query = str(args["query"])[:200]
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    found = httpx.get(f"{base}/esearch.fcgi", params={"db": "pubmed", "retmode": "json", "retmax": 6, "term": query}, timeout=_EVIDENCE_TIMEOUT)
    found.raise_for_status()
    ids = found.json().get("esearchresult", {}).get("idlist", [])
    if not ids:
        return {"papers": [], "evidence": True}
    summary = httpx.get(f"{base}/esummary.fcgi", params={"db": "pubmed", "retmode": "json", "id": ",".join(ids)}, timeout=_EVIDENCE_TIMEOUT)
    summary.raise_for_status()
    result = summary.json()["result"]
    papers = []
    for pmid in ids:
        item = result.get(pmid, {})
        year = re.match(r"\d{4}", item.get("pubdate", ""))
        papers.append({"pmid": pmid, "title": _clean_title(item.get("title", "")), "journal": _clean_title(item.get("fulljournalname", "")), "year": int(year.group()) if year else None})
    return {"papers": papers, "evidence": True}


def search_knowledge(args: dict) -> dict:
    """Finds the lab's own notes by vector similarity. It computes nothing and contains no personal advice."""
    return {"passages": knowledge.search(str(args["query"])[:200])}


TOOLS = {
    "search_knowledge": (search_knowledge, "Search the lab's notes on what a term or drug class means and how the lab works. Use it for ordinary questions that need no simulation.",
                         {"type": "object", "additionalProperties": False, "properties": {"query": {"type": "string"}}, "required": ["query"]}),
    "run_virtual_trial": (run_virtual_trial, "Simulate a randomised trial of one or more drugs against placebo in virtual patients built from real NHANES labs. Returns adjusted HbA1c, fasting glucose and weight effects with intervals.",
                          {"type": "object", "additionalProperties": False, "properties": _DESIGN_PROPS, "required": ["arms"]}),
    "power_analysis": (power_analysis, "Estimate statistical power by arm size for the first drug against placebo.",
                       {"type": "object", "additionalProperties": False, "properties": _DESIGN_PROPS, "required": ["arms"]}),
    "who_responds": (who_responds, "Run the same virtual patients on drug and placebo and summarise which baseline traits drive benefit in the model.",
                     {"type": "object", "additionalProperties": False, "properties": _DESIGN_PROPS, "required": ["arms"]}),
    "design_study": (design_study, "Find the lowest dose reaching a target HbA1c effect, then the smallest arm size with 80% power. A neural surrogate proposes where to look and the simulator checks it. Returns every step tried.",
                     {"type": "object", "additionalProperties": False, "properties": {"drug": {"type": "string", "enum": sorted(_DOSES)}, "target_effect": _NUMBER_SCHEMA, "weeks": {"type": "integer"}, "background": {"type": "string", "enum": ["any", "naive", "metformin"]}}, "required": ["drug"]}),
    "simulate_progression": (simulate_progression, "Run a published mechanistic model of how type 2 diabetes develops and can reverse (Ha, Satin and Sherman 2016). Tests when insulin sensitivity recovers. It does not model drugs.",
                             {"type": "object", "additionalProperties": False, "properties": {"scenario": {"type": "string", "enum": sorted(SCENARIOS)}}, "required": ["scenario"]}),
    "drug_safety": (drug_safety, "Label warnings plus adverse events reported in one real registry trial. Empirical, not simulated. Always state the warnings.",
                    {"type": "object", "additionalProperties": False, "properties": {"drug": {"type": "string", "enum": sorted(safety.SOURCES)}}, "required": ["drug"]}),
    "lab_status": (lab_status, "What is finished so far: calibration and held-out validation.",
                   {"type": "object", "additionalProperties": False, "properties": {}, "required": []}),
    "validation_report": (validation_report, "How well the lab predicted real trials it never saw: every check, which failed, the largest misses, and the trials where it held up. Report this whenever accuracy or trust matters.",
                          {"type": "object", "additionalProperties": False, "properties": {}, "required": []}),
    "model_assumptions": (model_assumptions, "Every model parameter with its source, and whether it is published, calibrated or assumed.",
                          {"type": "object", "additionalProperties": False, "properties": {}, "required": []}),
    "search_registry": (search_registry, "Search ClinicalTrials.gov. Returns titles and ids only.",
                        {"type": "object", "additionalProperties": False, "properties": {"query": {"type": "string"}}, "required": ["query"]}),
    "search_literature": (search_literature, "Search PubMed. Returns titles, ids and years only; a hit is not evidence that a claim holds.",
                          {"type": "object", "additionalProperties": False, "properties": {"query": {"type": "string"}}, "required": ["query"]}),
}


def execute(name: str, args: dict) -> dict:
    """Run a tool and always return a JSON-safe dict; failures become an explicit error result."""
    if name not in TOOLS:
        return {"error": f"unknown tool {name}"}
    try:
        return TOOLS[name][0](args)
    except (ValueError, limits.Busy) as exc:  # our own plain-language messages
        return {"error": str(exc)}
    except (KeyError, TypeError):
        return {"error": "those tool arguments were not valid"}
    except FileNotFoundError:
        log.exception("missing data file for tool %s", name)
        return {"error": "that data is not available on this server"}
    except httpx.HTTPError as exc:
        return {"error": f"source unavailable: {type(exc).__name__}"}


# Code appends validation and the track record after the reply, so the model is not handed text it can misquote.
_LLM_DROP = {"a1c_by_week", "a1c_low", "a1c_high", "reference", "events", "parameters", "validation", "track_record", "dose_evidence"}
_LLM_MAX_CHARS = 8000


def _compact(value):
    if isinstance(value, dict):
        return {k: _compact(v) for k, v in value.items() if k not in _LLM_DROP}
    if isinstance(value, list):
        return [_compact(v) for v in value]
    return value


def to_text(result: dict) -> str:
    """What the model sees: long series removed and size bounded, to limit cost and injected text."""
    return json.dumps(_compact(result), default=str)[:_LLM_MAX_CHARS]
