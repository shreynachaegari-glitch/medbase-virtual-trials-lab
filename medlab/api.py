"""HTTP API for the lab. Limits exist because each simulation is CPU heavy and the assistant can cost money."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import limits, service, trial
from .service import DesignIn, ProgressionIn, QuestionIn, TrialIn

log = logging.getLogger("medlab.api")
ROOT = Path(__file__).resolve().parent.parent
WEB_DIST = ROOT / "web" / "dist"
_RATE = {"simulate": (20, 60.0), "assistant": (10, 60.0)}  # requests per window, per client
_GLOBAL = {"simulate": (600, 3600.0), "assistant": (120, 3600.0)}  # whole server, whoever is asking
_TRUSTED_PROXIES = int(os.environ.get("MEDLAB_TRUSTED_PROXIES", "0"))
_PUBLIC = os.environ.get("MEDLAB_PUBLIC", "0") == "1"

app = FastAPI(title="MedBase Virtual Trials Lab", version="0.1.0", docs_url=None if _PUBLIC else "/docs", redoc_url=None, openapi_url=None if _PUBLIC else "/openapi.json")
_origins = [o for o in os.environ.get("MEDLAB_CORS", "http://localhost:5173").split(",") if o]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

MAX_BODY_BYTES = 256 * 1024
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


class _Hardening:
    """Counts the bytes actually received, so a chunked body can't dodge the limit, and marks API replies, including its own refusal."""

    def __init__(self, inner) -> None:
        self.inner = inner

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.inner(scope, receive, send)
            return
        is_api = scope["path"].startswith("/api")
        refused = False

        async def marked_send(message) -> None:
            if refused:
                return  # the refusal has gone out, so whatever the app does next goes nowhere
            if message["type"] == "http.response.start" and is_api:
                present = {k.lower() for k, _ in message["headers"]}
                message["headers"] = list(message["headers"]) + [(k.lower().encode(), v.encode()) for k, v in _SECURITY_HEADERS.items() if k.lower().encode() not in present]
            await send(message)

        async def refuse() -> None:
            nonlocal refused
            await JSONResponse({"detail": "request too large"}, status_code=413)(scope, receive, marked_send)
            refused = True

        declared = dict(scope["headers"]).get(b"content-length", b"0").decode("latin-1")
        if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            await refuse()
            return
        seen = 0

        async def counted_receive():
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > MAX_BODY_BYTES and not refused:
                    await refuse()
                    return {"type": "http.disconnect"}
            return message

        try:
            await self.inner(scope, counted_receive, marked_send)
        except Exception:
            if not refused:
                raise


app.add_middleware(_Hardening)


def _client_key(request: Request) -> str:
    """The address the nearest trusted proxy saw. Left-hand X-Forwarded-For entries are client-supplied."""
    direct = request.client.host if request.client else "unknown"
    if _TRUSTED_PROXIES <= 0:
        return direct
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    return hops[-_TRUSTED_PROXIES] if len(hops) >= _TRUSTED_PROXIES else direct


def _limit(request: Request, bucket: str) -> None:
    if not limits.BUDGET.allow(bucket, _client_key(request), _RATE[bucket], _GLOBAL[bucket]):
        raise HTTPException(429, "Too many requests. Please wait a minute and try again.")


def _heavy(fn, *args):
    """Runs expensive work with bounded concurrency. User mistakes become 422, not 500."""
    try:
        return limits.run_heavy(fn, *args)
    except limits.Busy as exc:
        raise HTTPException(503, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except FileNotFoundError as exc:
        log.exception("result files missing")
        raise HTTPException(503, "Calibration results are missing on this server.") from exc


def _design(body: TrialIn) -> trial.Design:
    try:
        return service.build_design(body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "engine": "server", "calibrated": (service.RESULTS / "posterior.json").exists(), "validated": (service.RESULTS / "validation.json").exists(),
            "assistant_mode": "claude" if os.environ.get("ANTHROPIC_API_KEY") else "nim" if os.environ.get("NVIDIA_API_KEY") else "offline"}


@app.get("/api/validation")
def validation() -> dict:
    data = service.validation()
    if data is None:
        raise HTTPException(404, "Validation has not been run.")
    return data


@app.get("/api/calibration")
def calibration() -> dict:
    data = service.calibration()
    if data is None:
        raise HTTPException(404, "Calibration has not been run.")
    return data


@app.get("/api/parameters")
def parameters() -> dict:
    return service.parameters()


@app.get("/api/drugs")
def known_drugs() -> dict:
    return service.known_drugs()


@app.post("/api/trial")
def post_trial(body: TrialIn, request: Request) -> dict:
    _limit(request, "simulate")
    return _heavy(service.run_trial, _design(body))


@app.post("/api/power")
def post_power(body: TrialIn, request: Request) -> dict:
    _limit(request, "simulate")
    return _heavy(trial.power_curve, _design(body))


@app.post("/api/responders")
def post_responders(body: TrialIn, request: Request) -> dict:
    _limit(request, "simulate")
    return _heavy(trial.responders, _design(body))


@app.post("/api/design")
def post_design(body: DesignIn, request: Request) -> dict:
    _limit(request, "simulate")
    return _heavy(service.design_study, body)


@app.get("/api/safety/{drug}")
def get_safety(drug: str) -> dict:
    try:
        return service.drug_safety(drug)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/assistant")
def post_assistant(body: QuestionIn, request: Request) -> dict:
    _limit(request, "assistant")
    try:
        return service.ask(body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/progression/scenarios")
def progression_scenarios() -> dict:
    return service.progression_scenarios()


@app.post("/api/progression/run")
def run_progression(body: ProgressionIn, request: Request) -> dict:
    _limit(request, "simulate")
    return _heavy(service.run_progression, body)


if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        try:
            target = (WEB_DIST / path).resolve()
            if path and target.is_file() and target.is_relative_to(WEB_DIST.resolve()):
                return FileResponse(target)
        except (ValueError, OSError):
            raise HTTPException(404, "Not found") from None
        return FileResponse(WEB_DIST / "index.html")
