"""Bayesian calibration of the drug and context parameters on TRAIN trials only.

Likelihood: Gaussian on registry arm means with the registry's own standard error plus a stated
model-discrepancy term. Priors: log-normal around the sourced values in params.py.
Run: python -m medlab.calibrate --steps 1000
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import time
from dataclasses import dataclass
from multiprocessing import Pool
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import emcee  # noqa: E402
import numpy as np  # noqa: E402

from . import params, population as pop, registry, simulate as sim, trials  # noqa: E402
from .ioutil import write_atomic  # noqa: E402
from .drugs import Dose, Regimen  # noqa: E402

RESULTS = Path(__file__).resolve().parent.parent / "results"
POSTERIOR = RESULTS / "posterior.json"
NAMES = params.CALIBRATED
PRIOR_LOG_MEAN = np.array([math.log(params.PARAMS[n].value) for n in NAMES])
PRIOR_LOG_SD = np.array([params.PARAMS[n].prior_sd for n in NAMES])
DISCREPANCY = {"hba1c": 0.08, "fpg": 5.0, "weight": 0.4, "uge": 6.0}
CALIBRATION_N = 250
POOL_VARIANCE = RESULTS / "pool_variance.json"
POOL_BOOTSTRAPS = 24
CALIBRATION_SEED = 20261105
RHAT_LIMIT = 1.05
MIN_LENGTH_OVER_TAU = 50.0
LABEL_UGE = ((10.0, 64.0), (25.0, 78.0))  # g/day, Jardiance label section 12.2; measured at week 4


CONTRAST_ONLY = {"NCT00676338": ("Metformin", "Sitagliptin")}


def arm_se(arm: registry.ArmResult, dispersion: str | None) -> float:
    """Standard error of an arm mean, whatever form the registry published it in."""
    d = (dispersion or "").lower()
    if "standard error" in d and arm.spread is not None:
        return arm.spread
    if "standard deviation" in d and arm.spread is not None and arm.n:
        return arm.spread / math.sqrt(arm.n)
    if "confidence" in d and arm.lower is not None and arm.upper is not None:
        return (arm.upper - arm.lower) / 3.92
    raise ValueError(f"cannot derive a standard error for {arm.arm} ({dispersion})")


@dataclass(frozen=True)
class Target:
    trial: str
    arm: str
    endpoint: str
    observed: float
    se: float
    reference: str | None = None  # when set, the target is arm minus reference


def train_targets() -> list[Target]:
    """Arm-level change-from-baseline values for TRAIN trials, read from the registry."""
    wanted = {
        "NCT02054897": ("Change in HbA1c (Glycosylated Haemoglobin)", "Change in Body Weight", "Change in Fasting Plasma Glucose (FPG)"),
        "NCT01177813": ("Change From Baseline in Glycosylated Haemoglobin (HbA1c) After 24 Weeks", "Change From Baseline to Week 24 in Body Weight"),
        "NCT00676338": ("Change in HbA1c From Baseline to Week 26", "Change in Body Weight From Baseline to Week 26"),
    }
    targets: list[Target] = []
    for spec in trials.TRAIN_SPECS:
        for outcome in registry.read_outcomes(spec.nct):
            if outcome.title not in wanted[spec.nct]:
                continue
            scale = trials.MMOL_TO_MGDL if (outcome.unit or "").lower().startswith("mmol") else 1.0
            arms = {a.arm: a for a in outcome.arms if a.arm in spec.arms and a.value is not None}
            if spec.nct in CONTRAST_ONLY:
                # No placebo arm, so absolute changes carry a trial-wide effect the model cannot know.
                arm_name, reference = CONTRAST_ONLY[spec.nct]
                a, b = arms[arm_name], arms[reference]
                se = math.hypot(arm_se(a, outcome.dispersion), arm_se(b, outcome.dispersion))
                targets.append(Target(spec.name, arm_name, outcome.endpoint, (a.value - b.value) * scale, se * scale, reference))
                continue
            for arm in arms.values():
                targets.append(Target(spec.name, arm.arm, outcome.endpoint, arm.value * scale, arm_se(arm, outcome.dispersion) * scale))
    expected = sum((1 if s.nct in CONTRAST_ONLY else len(s.arms)) * len(wanted[s.nct]) for s in trials.TRAIN_SPECS)
    if len(targets) != expected:
        raise RuntimeError(f"expected {expected} train targets, found {len(targets)}")
    return targets


def split_rhat(chain: np.ndarray) -> np.ndarray:
    """Split R-hat per parameter, for a chain shaped (steps, walkers, parameters)."""
    half = chain.shape[0] // 2
    pieces = np.concatenate([chain[:half], chain[half:2 * half]], axis=1)
    within = pieces.var(axis=0, ddof=1).mean(axis=0)
    between = half * pieces.mean(axis=0).var(axis=0, ddof=1)
    return np.sqrt(((half - 1) / half * within + between / half) / within)


class Calibration:
    """Holds cohorts and targets so that one evaluation only re-runs the simulator."""

    def __init__(self, n: int = CALIBRATION_N, seed: int = CALIBRATION_SEED):
        self.labs = pop.load_labs()
        self.n = n
        base = params.defaults()
        self.targets = train_targets()
        self.cohorts = {s.name: pop.enroll(self.labs, s.criteria, n, base, seed + i)[0] for i, s in enumerate(trials.TRAIN_SPECS)}
        self.pool_variance = {tuple(k.split("|")): v for k, v in json.loads(POOL_VARIANCE.read_text()).items()} if POOL_VARIANCE.exists() else {}

    def estimate_pool_variance(self) -> None:
        """How much each target moves when the few real participants are resampled. Added to the likelihood,
        so the fit cannot chase quirks of one small pool."""
        p = params.defaults()
        keep = self.cohorts
        rows = {f"{t.trial}|{t.arm}|{t.endpoint}": [] for t in self.targets}
        uge = {mg: [] for mg, _ in LABEL_UGE}
        for b in range(POOL_BOOTSTRAPS):
            self.cohorts = {s.name: pop.enroll(self.labs, s.criteria, self.n, p, 5000 + b + 97 * i, bootstrap_pool=True)[0] for i, s in enumerate(trials.TRAIN_SPECS)}
            runs = self.predict(p)
            for t in self.targets:
                rows[f"{t.trial}|{t.arm}|{t.endpoint}"].append(self.predicted_change(runs, t))
            for (mg, _), (predicted, _) in zip(LABEL_UGE, self.label_uge(p)):
                uge[mg].append(predicted)
        self.cohorts = keep
        out = {k: float(np.var(v, ddof=1)) for k, v in rows.items()}
        out.update({f"uge|{mg:g}|uge": float(np.var(v, ddof=1)) for mg, v in uge.items()})
        RESULTS.mkdir(exist_ok=True)
        write_atomic(POOL_VARIANCE, json.dumps(out, indent=1))
        self.pool_variance = {tuple(k.split("|")): v for k, v in out.items()}

    def predict(self, p: dict[str, float]) -> dict[tuple[str, str], sim.Trajectory]:
        return {
            (s.name, arm): sim.simulate(self.cohorts[s.name], regimen, s.weeks, p)
            for s in trials.TRAIN_SPECS for arm, regimen in s.arms.items()
        }

    def predicted_change(self, runs: dict, target: Target) -> float:
        t = runs[(target.trial, target.arm)]
        pick = lambda run: {"hba1c": run.a1c, "fpg": run.fpg, "weight": run.weight}[target.endpoint]  # noqa: E731
        change = float(pick(t)[-1].mean() - pick(t)[0].mean())
        if target.reference is None:
            return change
        r = runs[(target.trial, target.reference)]
        return change - float(pick(r)[-1].mean() - pick(r)[0].mean())

    def label_uge(self, p: dict[str, float]) -> list[tuple[float, float]]:
        cohort = self.cohorts["EMPA-REG MONO"]
        out = []
        for mg, observed in LABEL_UGE:
            t = sim.simulate(cohort, Regimen("e", (Dose("empagliflozin", mg),)), 4, p)
            out.append((float(t.uge_g_day[-1].mean()), observed))
        return out

    def log_likelihood(self, p: dict[str, float]) -> float:
        runs = self.predict(p)
        total = 0.0
        for target in self.targets:
            variance = target.se**2 + DISCREPANCY[target.endpoint] ** 2 + self.pool_variance.get((target.trial, target.arm, target.endpoint), 0.0)
            total -= 0.5 * (self.predicted_change(runs, target) - target.observed) ** 2 / variance
        for (mg, _), (predicted, observed) in zip(LABEL_UGE, self.label_uge(p)):
            variance = DISCREPANCY["uge"] ** 2 + self.pool_variance.get(("uge", f"{mg:g}", "uge"), 0.0)
            total -= 0.5 * (predicted - observed) ** 2 / variance
        return total


_CAL: Calibration | None = None


def _worker_init() -> None:
    global _CAL
    _CAL = Calibration()


def log_posterior(log_theta: np.ndarray) -> float:
    prior = -0.5 * np.sum(((log_theta - PRIOR_LOG_MEAN) / PRIOR_LOG_SD) ** 2)
    theta = dict(zip(NAMES, np.exp(log_theta)))
    # Physical bounds: fractions stay below 0.95 and the threshold below the untreated one.
    fractions = ("sglt2_egp_comp", "met_hgp_max", "sema_hgp_max", "placebo_meal")
    if any(theta[f] >= 0.95 for f in fractions) or theta["empa_rtg_min"] >= params.PARAMS["rtg0"].value:
        return -math.inf
    try:
        like = _CAL.log_likelihood(params.with_theta(theta))
    except (ArithmeticError, ValueError):
        return -math.inf
    return prior + like if np.isfinite(like) else -math.inf


def run(steps: int, walkers: int, burn: int, processes: int, seed: int, resume: Path | None = None) -> dict:
    """`steps` is the number of new steps. With `resume`, the earlier chain continues from its last state."""
    earlier = np.load(resume) if resume else None
    if earlier is not None:
        walkers = earlier.shape[1]
    total_steps = steps + (0 if earlier is None else earlier.shape[0])
    if burn >= total_steps or (total_steps - burn) * walkers < 400:
        raise ValueError("steps, burn and walkers must leave at least 400 samples after burn-in")
    RESULTS.mkdir(exist_ok=True)
    rng = np.random.default_rng(seed)
    t0 = time.time()
    if earlier is None:
        Calibration().estimate_pool_variance()  # must exist before workers start
        print(f"pool variance done t={time.time() - t0:.0f}s", flush=True)
    _worker_init()
    start = earlier[-1] if earlier is not None else PRIOR_LOG_MEAN + rng.normal(0, 0.3, (walkers, len(NAMES))) * PRIOR_LOG_SD
    with Pool(processes, initializer=_worker_init) as pool:
        sampler = emcee.EnsembleSampler(walkers, len(NAMES), log_posterior, pool=pool, moves=[(emcee.moves.DEMove(), 0.8), (emcee.moves.DESnookerMove(), 0.2)])
        state = start
        for i, state in enumerate(sampler.sample(start, iterations=steps), 1):
            if i % 100 == 0:
                print(f"step {i}/{steps} acc {np.mean(sampler.acceptance_fraction):.3f} logp {np.median(state.log_prob):.2f} t={time.time() - t0:.0f}s", flush=True)
    full = sampler.get_chain() if earlier is None else np.concatenate([earlier, sampler.get_chain()])
    np.save(RESULTS / "chain.npy", full)  # kept in case post-processing fails, and for resuming
    chain = full[burn:]
    flat = chain.reshape(-1, len(NAMES))
    try:
        tau = emcee.autocorr.integrated_time(chain, quiet=True, tol=0)
    except Exception as exc:  # autocorrelation can fail on short chains; report that instead of hiding it
        print(f"autocorrelation unavailable: {exc}", flush=True)
        tau = np.full(len(NAMES), np.nan)
    rhat = split_rhat(chain)
    length_over_tau = float((total_steps - burn) / np.nanmax(tau)) if np.isfinite(tau).any() else float("nan")
    converged = bool(np.nanmax(rhat) < RHAT_LIMIT and length_over_tau >= MIN_LENGTH_OVER_TAU)
    keep = rng.choice(len(flat), size=400, replace=False)
    draws = np.exp(flat[keep])
    summary = {
        n: {"median": float(np.median(draws[:, i])), "p2_5": float(np.percentile(draws[:, i], 2.5)), "p97_5": float(np.percentile(draws[:, i], 97.5)),
            "prior_median": params.PARAMS[n].value, "autocorr_steps": None if np.isnan(tau[i]) else float(tau[i])}
        for i, n in enumerate(NAMES)
    }
    payload = {
        "names": list(NAMES), "draws": draws.round(6).tolist(), "summary": summary,
        "steps": total_steps, "walkers": walkers, "burn": burn, "acceptance": float(np.mean(sampler.acceptance_fraction)),
        "seconds": round(time.time() - t0, 1),
        "max_split_rhat": float(np.nanmax(rhat)), "length_over_tau": length_over_tau, "converged": converged,
    }
    text = json.dumps(payload, indent=1)
    write_atomic(POSTERIOR, text)
    print("posterior sha256", hashlib.sha256(text.encode()).hexdigest()[:16], flush=True)
    return payload


class StalePosterior(FileNotFoundError):
    """The saved fit belongs to different model parameters. Treated as missing results, never as a user error."""


def load_posterior() -> tuple[list[str], np.ndarray, str]:
    text = POSTERIOR.read_text()
    data = json.loads(text)
    if sorted(data["names"]) != sorted(NAMES):
        raise StalePosterior("posterior.json does not match the current calibrated parameters")
    return data["names"], np.array(data["draws"]), hashlib.sha256(text.encode()).hexdigest()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=3000)
    parser.add_argument("--walkers", type=int, default=44)
    parser.add_argument("--burn", type=int, default=1000)
    parser.add_argument("--processes", type=int, default=16)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--resume", type=Path, default=None, help="continue from a saved chain.npy")
    args = parser.parse_args()
    run(args.steps, args.walkers, args.burn, args.processes, args.seed, args.resume)
