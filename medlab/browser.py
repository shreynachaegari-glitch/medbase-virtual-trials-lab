"""In-browser engine: the same operations as the server, called by a web worker through Pyodide.

Server-only libraries are stubbed, because calibration and live literature search never run here.
There is no API key in a browser, so the assistant always uses its offline planner.
"""
from __future__ import annotations

import json
import re
import sys
import types


def _stub_server_only_modules() -> None:
    for name in ("emcee", "httpx", "anthropic"):
        try:
            __import__(name)
        except ImportError:
            module = types.ModuleType(name)
            if name == "httpx":
                module.Client = object
                module.HTTPError = type("HTTPError", (Exception,), {})
            sys.modules[name] = module


_stub_server_only_modules()

import pandas as pd  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from . import population as pop, service, trial  # noqa: E402
from .agent import assistant  # noqa: E402
from .service import DesignIn, ProgressionIn, QuestionIn, TrialIn  # noqa: E402


def use_labs_file(path: str) -> None:
    """The browser bundle ships derived labs, with no participant identifiers, not the survey files."""
    frame = pd.read_csv(path, dtype={"female": bool})
    pop.load_labs = lambda: frame
    trial.labs.cache_clear()


_session = None


def session_start(question: str, previous: str = "") -> str:
    """Begins a model conversation for the worker; the worker makes the network calls."""
    global _session
    _session = assistant.BrowserSession(question, previous or None, wants_vector=True)
    return json.dumps(_session.start(), default=str)


def session_vector(raw: str) -> str:
    """Carries on after the worker asked the proxy for the question's embedding. An empty string means that failed."""
    return json.dumps(_session.resume_with_vector(raw or ""), default=str)


def session_tool(name: str, args_json: str) -> str:
    try:
        return _session.run_tool(name, args_json)
    except ValueError as exc:
        return json.dumps({"error": str(exc)})


def session_finish(text: str | None, failed: bool = False) -> str:
    return json.dumps(_session.finish(text, failed), default=str)


def health() -> dict:
    return {"ok": True, "engine": "browser", "calibrated": (service.RESULTS / "posterior.json").exists(), "validated": (service.RESULTS / "validation.json").exists(), "assistant_mode": "offline"}


def _optional(data: dict | None, what: str) -> tuple[int, dict]:
    return (200, data) if data is not None else (404, {"detail": f"{what} has not been run."})


_GET = {
    "/api/health": lambda: (200, health()),
    "/api/validation": lambda: _optional(service.validation(), "Validation"),
    "/api/calibration": lambda: _optional(service.calibration(), "Calibration"),
    "/api/parameters": lambda: (200, service.parameters()),
    "/api/drugs": lambda: (200, service.known_drugs()),
    "/api/progression/scenarios": lambda: (200, service.progression_scenarios()),
}
_POST = {
    "/api/trial": (TrialIn, lambda b: service.run_trial(service.build_design(b))),
    "/api/power": (TrialIn, lambda b: trial.power_curve(service.build_design(b))),
    "/api/responders": (TrialIn, lambda b: trial.responders(service.build_design(b))),
    "/api/design": (DesignIn, service.design_study),
    "/api/assistant": (QuestionIn, service.ask),
    "/api/progression/run": (ProgressionIn, service.run_progression),
}


def handle(method: str, path: str, body: str | None = None) -> str:
    """Answers one request as JSON text: {"status": int, "body": ...}. Mirrors the server's status codes."""
    try:
        status, payload = _dispatch(method.upper(), path, body)
    except ValidationError as exc:
        status, payload = 422, {"detail": "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors())}
    except ValueError as exc:
        status, payload = 422, {"detail": str(exc)}
    except FileNotFoundError:
        status, payload = 503, {"detail": "Calibration results are missing from this site."}
    return json.dumps({"status": status, "body": payload}, default=str)


def _dispatch(method: str, path: str, body: str | None) -> tuple[int, dict]:
    if method == "GET" and path in _GET:
        return _GET[path]()
    safety_route = re.fullmatch(r"/api/safety/([a-z]+)", path)
    if method == "GET" and safety_route:
        try:
            return 200, service.drug_safety(safety_route.group(1))
        except ValueError as exc:
            return 404, {"detail": str(exc)}
    if method == "POST" and path in _POST:
        model, operation = _POST[path]
        return 200, operation(model.model_validate_json(body or "{}"))
    return 404, {"detail": "Not found"}
