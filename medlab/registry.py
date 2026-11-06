"""ClinicalTrials.gov client: fetch registry records and pull out arm-level results.

Trials are split into TRAIN and HELD_OUT here, once. Values of held-out trials must only be read
through `validate.py` after parameters are frozen, so `read_outcomes` refuses them unless the
caller passes `unseal=True`.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import httpx

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "registry"
API = "https://clinicaltrials.gov/api/v2/studies/{nct}"

TRAIN = {
    "NCT02054897": "SUSTAIN 1",
    "NCT01177813": "EMPA-REG MONO",
    "NCT00676338": "DURATION-4",
}
HELD_OUT = {
    "NCT01930188": "SUSTAIN 2",
    "NCT00696657": "Semaglutide phase 2",
    "NCT01164501": "EMPA-REG RENAL",
    "NCT01159600": "EMPA-REG MET",
    "NCT00087516": "Sitagliptin monotherapy",
    "NCT00103857": "Sitagliptin + metformin factorial",
}

ENDPOINTS = {
    "hba1c": re.compile(r"hba1c|a1c|glycosylated|glycated", re.I),
    "fpg": re.compile(r"fasting (plasma )?glucose|\bFPG\b", re.I),
    "weight": re.compile(r"body ?weight", re.I),
}


class SealedTrialError(RuntimeError):
    """Raised when held-out results are requested before the parameters are frozen."""


@dataclass(frozen=True)
class ArmResult:
    arm: str
    n: float | None
    value: float | None
    spread: float | None
    lower: float | None
    upper: float | None


@dataclass(frozen=True)
class Outcome:
    nct: str
    endpoint: str
    title: str
    time_frame: str
    param_type: str | None
    dispersion: str | None
    unit: str | None
    arms: tuple[ArmResult, ...]
    population: str


def fetch(nct: str, client: httpx.Client | None = None, force: bool = False) -> dict:
    """Return the registry record, caching the raw JSON so runs are reproducible offline."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{nct}.json"
    if path.exists() and not force:
        return json.loads(path.read_text())
    owns_client = client is None
    client = client or httpx.Client(timeout=40)
    try:
        response = client.get(API.format(nct=nct))
        response.raise_for_status()
    finally:
        if owns_client:
            client.close()
    path.write_text(response.text)
    return response.json()


def _num(text: str | None) -> float | None:
    if text in (None, "", "NA"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_outcomes(record: dict, nct: str) -> list[Outcome]:
    results = record.get("resultsSection") or {}
    measures = results.get("outcomeMeasuresModule", {}).get("outcomeMeasures", [])
    outcomes: list[Outcome] = []
    for measure in measures:
        title = measure.get("title", "")
        endpoint = next((k for k, rx in ENDPOINTS.items() if rx.search(title)), None)
        if endpoint is None:
            continue
        groups = {g["id"]: g["title"] for g in measure.get("groups", [])}
        counts: dict[str, float | None] = {}
        for denom in measure.get("denoms", []):
            if denom.get("units", "").lower() == "participants":
                counts = {c["groupId"]: _num(c.get("value")) for c in denom.get("counts", [])}
        arms: list[ArmResult] = []
        for cls in measure.get("classes", []):
            class_counts = counts
            for denom in cls.get("denoms", []):
                class_counts = {c["groupId"]: _num(c.get("value")) for c in denom.get("counts", [])}
            for category in cls.get("categories", []):
                for m in category.get("measurements", []):
                    arms.append(ArmResult(
                        arm=groups.get(m["groupId"], m["groupId"]),
                        n=class_counts.get(m["groupId"]),
                        value=_num(m.get("value")),
                        spread=_num(m.get("spread")),
                        lower=_num(m.get("lowerLimit")),
                        upper=_num(m.get("upperLimit")),
                    ))
        outcomes.append(Outcome(
            nct=nct, endpoint=endpoint, title=title,
            time_frame=measure.get("timeFrame", ""),
            param_type=measure.get("paramType"),
            dispersion=measure.get("dispersionType"),
            unit=measure.get("unitOfMeasure"),
            arms=tuple(arms),
            population=measure.get("populationDescription", ""),
        ))
    return outcomes


def read_outcomes(nct: str, unseal: bool = False) -> list[Outcome]:
    """Parsed outcomes for a trial. Held-out values raise unless explicitly unsealed."""
    if nct in HELD_OUT and not unseal:
        raise SealedTrialError(f"{nct} is held out; use validate.py after freezing parameters")
    return _parse_outcomes(fetch(nct), nct)


def read_structure(nct: str) -> list[dict]:
    """Outcome titles and arm names with no values, safe to inspect for any trial."""
    return [
        {"endpoint": o.endpoint, "title": o.title, "time_frame": o.time_frame,
         "param": o.param_type, "dispersion": o.dispersion,
         "arms": sorted({a.arm for a in o.arms})}
        for o in _parse_outcomes(fetch(nct), nct)
    ]


def read_baseline(nct: str) -> dict:
    """Baseline table: published Table 1, used for enrolment matching. Not an outcome, never sealed."""
    module = (fetch(nct).get("resultsSection") or {}).get("baselineCharacteristicsModule", {})
    groups = {g["id"]: g["title"] for g in module.get("groups", [])}
    table: dict[str, dict[str, dict]] = {}
    for measure in module.get("measures", []):
        rows: dict[str, dict] = {}
        for cls in measure.get("classes", []):
            for category in cls.get("categories", []):
                for m in category.get("measurements", []):
                    label = category.get("title", "")
                    key = f"{groups.get(m['groupId'], m['groupId'])}|{label}" if label else groups.get(m["groupId"], m["groupId"])
                    rows[key] = {"value": _num(m.get("value")), "spread": _num(m.get("spread"))}
        table[measure.get("title", "")] = {"param": measure.get("paramType"), "dispersion": measure.get("dispersionType"), "unit": measure.get("unitOfMeasure"), "rows": rows}
    return table


def read_eligibility(nct: str) -> str:
    return fetch(nct)["protocolSection"].get("eligibilityModule", {}).get("eligibilityCriteria", "")
