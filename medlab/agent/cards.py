"""Inline result cards for the copilot chat.

Each card is a compact chart spec built only from a simulator tool's own output, so a chart can never show a
number the tool did not return. Malformed output makes no card rather than a wrong one.
"""
from __future__ import annotations

MAX_CARDS = 3
MAX_DRIVERS = 4
MAX_SUBGROUPS = 3
MAX_CURVE_POINTS = 60


def _r(value: float, places: int = 2) -> float:
    return round(float(value), places)


def _series(values: list) -> list[float]:
    return [_r(v) for v in values[:MAX_CURVE_POINTS]]


def _trial(result: dict) -> dict:
    arms_out = []
    for name, contrast in result["contrasts"].items():
        hba1c, weight = contrast["hba1c"], contrast.get("weight", {})
        low, high = hba1c["interval95"]
        arm = result.get("arms", {}).get(name, {})
        arms_out.append({"name": name, "effect": _r(hba1c["effect"]), "low": _r(low), "high": _r(high),
                         "weight": _r(weight["effect"]) if "effect" in weight else None,
                         "share_below_7": _r(arm["share_below_7"]) if "share_below_7" in arm else None})
    curves = {name: {"mean": _series(arm["a1c_by_week"]), "low": _series(arm["a1c_low"]), "high": _series(arm["a1c_high"])}
              for name, arm in result.get("arms", {}).items() if {"a1c_by_week", "a1c_low", "a1c_high"} <= arm.keys()}
    return {"kind": "trial", "control": str(result.get("control", "Placebo")), "weeks": int(result["weeks"]), "n_per_arm": int(result["n_per_arm"]),
            "arms": arms_out, "curves": curves}


def _power(result: dict) -> dict:
    return {"kind": "power", "arm": str(result["arm"]), "weeks": int(result.get("design_run", {}).get("weeks", 26)),
            "target": int(result.get("target_power_percent", 80)), "smallest": result.get("smallest_size_reaching_80pct"),
            "curve": [{"n": int(p["n_per_arm"]), "power": _r(p["power"])} for p in result["curve"]]}


def _responders(result: dict) -> dict:
    return {"kind": "responders", "arm": str(result["arm"]), "weeks": int(result.get("design_run", {}).get("weeks", 26)),
            "mean_effect": _r(result["mean_individual_effect"]), "spread_sd": _r(result["spread_sd"]),
            "drivers": [{"feature": str(d["feature"]), "importance": _r(d["importance"])} for d in result["drivers"][:MAX_DRIVERS]],
            "subgroups": [{"rule": str(s["rule"]), "patients": int(s["patients"]), "mean_effect": _r(s["mean_effect"])} for s in result.get("subgroups", [])[:MAX_SUBGROUPS]]}


_BUILDERS = {"run_virtual_trial": _trial, "power_analysis": _power, "who_responds": _responders}


def from_calls(calls: list[dict]) -> list[dict]:
    """One card per successful simulator run, in the order they ran, at most MAX_CARDS."""
    out: list[dict] = []
    for c in calls:
        build = _BUILDERS.get(c.get("tool", ""))
        result = c.get("result")
        if build is None or not c.get("ok") or not isinstance(result, dict) or "error" in result:
            continue
        try:
            out.append(build(result))
        except (KeyError, TypeError, ValueError, AttributeError):
            continue  # a malformed result shows no chart rather than a wrong one
        if len(out) == MAX_CARDS:
            break
    return out
