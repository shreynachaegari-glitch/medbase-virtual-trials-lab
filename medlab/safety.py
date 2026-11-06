"""Label warnings and adverse events from one real trial. Empirical, and separate from the simulator."""
from __future__ import annotations

import re

from . import labels, registry

SOURCES = {
    "semaglutide": ("NCT02054897", r"semaglutide"),
    "empagliflozin": ("NCT01177813", r"empagliflozin(?!.*\bOL\b)"),
    "sitagliptin": ("NCT01177813", r"sitagliptin"),
    "metformin": ("NCT00676338", r"metformin"),
}


def adverse_events(nct: str) -> dict:
    """Every event the sponsor posted, per arm, with its own denominator and assessment method."""
    module = (registry.fetch(nct).get("resultsSection") or {}).get("adverseEventsModule", {})
    groups = {g["id"]: g for g in module.get("eventGroups", [])}
    arms = {g["title"]: {"participants": g.get("seriousNumAtRisk") or g.get("otherNumAtRisk"), "serious_affected": g.get("seriousNumAffected"), "events": []} for g in groups.values()}
    for serious, events in ((False, module.get("otherEvents", [])), (True, module.get("seriousEvents", []))):
        for event in events:
            for stat in event.get("stats", []):
                group = groups.get(stat.get("groupId"))
                at_risk = stat.get("numAtRisk") or 0
                affected = stat.get("numAffected", 0)
                if group is None or not at_risk or not affected:
                    continue
                arms[group["title"]]["events"].append({
                    "term": event.get("term", ""), "serious": serious, "affected": affected, "at_risk": at_risk,
                    "percent": round(100 * affected / at_risk, 1), "assessment": event.get("assessmentType"),
                })
    return arms


def _role(arm: str, pattern: str) -> str:
    if re.search(pattern, arm, re.I):
        return "drug"
    return "placebo" if re.search("placebo", arm, re.I) else "comparator"


def drug_safety(drug: str) -> dict:
    if drug not in SOURCES:
        raise ValueError(f"no safety source for {drug}; known: {sorted(SOURCES)}")
    nct, pattern = SOURCES[drug]
    table = adverse_events(nct)
    rows = []
    for arm, data in table.items():
        rows.append({
            "arm": arm, "role": _role(arm, pattern), "participants": data["participants"], "serious_affected": data["serious_affected"],
            "events": sorted(data["events"], key=lambda e: -e["percent"]),
        })
    has_placebo = any(r["role"] == "placebo" for r in rows)
    return {
        "drug": drug, "trial": nct, "kind": "empirical",
        "label_warnings": [{k: w[k] for k in ("term", "kind", "text")} for w in labels.WARNINGS[drug]], "label_source": labels.SOURCES[drug],
        "arms": rows, "has_placebo_arm": has_placebo,
        "notice": (
            "Label warnings come first because this table cannot show them: one trial, at the reporting threshold the sponsor chose, is too small for rare but serious harms. "
            "An event missing from the table means it was not reported at that threshold, and does not mean it cannot happen. These rates are not simulated."
            + ("" if has_placebo else " This trial had no placebo arm, so these rates cannot be compared with placebo.")
        ),
    }
