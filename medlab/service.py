"""Request models and the operations behind them, with no web framework.

The FastAPI server and the in-browser engine both call this, so they cannot drift apart.
"""
from __future__ import annotations

import json
from dataclasses import asdict
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from . import designer, drugs, population as pop, progression, safety, trial
from .agent import assistant, tools, track_record
from .params import PARAMS
from .progression_scenarios import SCENARIOS

RESULTS = Path(__file__).resolve().parent.parent / "results"


class CandidateIn(BaseModel):
    name: str = Field(default="Candidate X", max_length=40)
    mechanism: Literal["hgp", "secretion", "sensitizer", "renal"]
    half_life_h: float = Field(gt=0, le=2000)
    volume_l: float = Field(gt=0, le=5000)
    emax: float = Field(ge=0, le=10)
    ec50_nmol: float = Field(gt=0, le=1e6)
    mg_per_day: float = Field(gt=0, le=5000)
    mw: float = Field(default=500, gt=0, le=20000)
    bioavailability: float = Field(default=1.0, ge=0, le=1)
    renal_fraction: float = Field(default=0.0, ge=0, le=1)
    kcal_max: float = Field(default=0.0, ge=0, le=1500)


class ArmIn(BaseModel):
    drug: str | None = None
    mg: float | None = Field(default=None, gt=0)
    candidate: CandidateIn | None = None


class TrialIn(BaseModel):
    arms: list[ArmIn] = Field(min_length=1, max_length=4)
    weeks: int = Field(default=26, ge=trial.MIN_WEEKS, le=trial.MAX_WEEKS)
    n_per_arm: int = Field(default=200, ge=10, le=trial.MAX_N_PER_ARM)
    background: Literal["any", "naive", "metformin"] = "any"
    egfr_min: float = Field(default=30, ge=15, le=400)
    egfr_max: float = Field(default=400, ge=15, le=400)
    a1c_min: float = Field(default=7.0, ge=4, le=15)
    a1c_max: float = Field(default=10.0, ge=4, le=16)
    dropout: float = Field(default=0.0, ge=0, le=0.8)
    adherence: float = Field(default=1.0, ge=0.1, le=1.0)
    seed: int = Field(default=1, ge=0, le=999_999)


class QuestionIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    previous: str | None = Field(default=None, max_length=2000)  # the last question, so "what about 2 mg?" can follow it
    history: list | None = Field(default=None, max_length=20)  # only the browser's conversational route reads this


class DesignIn(BaseModel):
    drug: str = Field(max_length=40)
    target_effect: float = Field(default=1.0, ge=0.1, le=3.0)
    weeks: int = Field(default=26, ge=trial.MIN_WEEKS, le=trial.MAX_WEEKS)
    background: Literal["any", "naive", "metformin"] = "any"
    target_power: float = Field(default=0.8, ge=0.5, le=0.99)


class ProgressionIn(BaseModel):
    scenario: str = "published-figure7-reference"
    intervention_day: int | None = Field(default=None, ge=0, le=3650)
    target_si_after: float | None = Field(default=None, ge=0.01, le=1.5)
    horizon_days: int | None = Field(default=None, ge=30, le=3650)


def build_design(body: TrialIn) -> trial.Design:
    arms = [trial.Arm("Placebo", drugs.Regimen("Placebo"))]
    for entry in body.arms:
        if entry.candidate is not None:
            c = entry.candidate
            molecule = drugs.Candidate(c.name, c.half_life_h, c.volume_l, c.mechanism, c.emax, c.ec50_nmol, c.mw, c.bioavailability, c.renal_fraction, c.kcal_max)
            arms.append(trial.Arm(f"{c.name} {c.mg_per_day:g} mg/day (hypothetical)", drugs.Regimen(c.name, candidates=((molecule, c.mg_per_day),))))
        elif entry.drug and entry.mg:
            name, regimen = tools._regimen({"drug": entry.drug, "mg": entry.mg})
            arms.append(trial.Arm(name, regimen))
        else:
            raise ValueError("each arm needs a drug and dose, or a candidate")
    if body.a1c_min >= body.a1c_max or body.egfr_min >= body.egfr_max:
        raise ValueError("ranges must run from low to high")
    criteria = pop.Criteria(a1c_range=(body.a1c_min, body.a1c_max), egfr_range=(body.egfr_min, body.egfr_max), background=body.background)
    return trial.Design(arms=tuple(arms), weeks=body.weeks, n_per_arm=body.n_per_arm, criteria=criteria, dropout=body.dropout, adherence=body.adherence, seed=body.seed)


def read_result(name: str) -> dict | None:
    path = RESULTS / name
    return json.loads(path.read_text()) if path.exists() else None


def validation() -> dict | None:
    return read_result("validation.json")


def calibration() -> dict | None:
    data = read_result("posterior.json")
    if data is None:
        return None
    keys = ("summary", "steps", "walkers", "burn", "acceptance", "max_split_rhat", "length_over_tau", "converged")
    return {k: data.get(k) for k in keys}


def parameters() -> dict:
    return {"parameters": [asdict(p) for p in PARAMS.values()]}


def known_drugs() -> dict:
    return {"drugs": [{"drug": d, "min_mg": low, "max_mg": high, "unit": "mg/week" if d == "semaglutide" else "mg/day"} for d, (low, high) in tools._DOSES.items()],
            "candidate_mechanisms": ["hgp", "secretion", "sensitizer", "renal"],
            "note": "Dose ranges stay within each drug's FDA label for type 2 diabetes."}


def drug_safety(drug: str) -> dict:
    return safety.drug_safety(drug)


def run_trial(design: trial.Design) -> dict:
    """A simulated trial, with the blind-test record for each drug attached so the two cannot be separated."""
    return {**trial.run_trial(design), "track_record": track_record.for_design(design)}


def design_study(body: DesignIn) -> dict:
    return designer.design_study(designer.Goal(body.drug, body.target_effect, body.weeks, body.background, body.target_power))


def ask(body: QuestionIn) -> dict:
    return assistant.reply_dict(assistant.answer(body.question, previous=body.previous))


def progression_scenarios() -> dict:
    return {"scenarios": [{"id": s.id, "title": s.title, "description": s.description, "evidence_class": s.evidence_class} for s in SCENARIOS.values()],
            "model": progression.model_metadata()["name"], "reference": progression.MODEL_REFERENCE}


@lru_cache(maxsize=64)
def _progression_run(scenario: str, intervention_day: int | None, target_si_after: float | None, horizon_days: int | None) -> dict:
    base = SCENARIOS[scenario].config
    config = progression.SimulationConfig(
        horizon_days=horizon_days if horizon_days is not None else base.horizon_days,
        intervention_day=intervention_day if intervention_day is not None else base.intervention_day,
        target_si_before=base.target_si_before,
        target_si_after=target_si_after if target_si_after is not None else base.target_si_after,
        si_rate_before=base.si_rate_before, si_rate_after=base.si_rate_after, output_interval_days=5,
    )
    result = progression.simulate_t2d(config)
    result["events"] = progression.threshold_events(result["trajectory"])
    return result


def run_progression(body: ProgressionIn) -> dict:
    if body.scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario. Choose from {sorted(SCENARIOS)}")
    return _progression_run(body.scenario, body.intervention_day, body.target_si_after, body.horizon_days)
