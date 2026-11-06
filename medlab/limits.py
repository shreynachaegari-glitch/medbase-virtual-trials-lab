"""Shared guards on expensive work. Every simulation path, including the assistant's, goes through these."""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

MAX_ACTIVE = int(os.environ.get("MEDLAB_MAX_SIMULATIONS", "2"))
_active = threading.BoundedSemaphore(MAX_ACTIVE)


class Busy(RuntimeError):
    """All simulation slots are taken. Fail fast so waiting requests cannot starve the thread pool."""


def run_heavy(fn, *args, **kwargs):
    if not _active.acquire(blocking=False):
        raise Busy("The lab is busy. Please try again shortly.")
    try:
        return fn(*args, **kwargs)
    finally:
        _active.release()


class Budget:
    """Sliding-window counters. A per-client limit stops one user; the global one bounds total cost."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, bucket: str, client: str, per_client: tuple[int, float], global_limit: tuple[int, float]) -> bool:
        now = time.monotonic()
        with self._lock:
            for key, (limit, window) in (((bucket, client), per_client), ((bucket, "*global*"), global_limit)):
                hits = self._hits[key]
                while hits and now - hits[0] > window:
                    hits.popleft()
                if len(hits) >= limit:
                    return False
            self._hits[(bucket, client)].append(now)
            self._hits[(bucket, "*global*")].append(now)
            return True

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


BUDGET = Budget()
LLM_DAILY_CALLS = int(os.environ.get("MEDLAB_LLM_DAILY_CALLS", "300"))


def llm_call_allowed() -> bool:
    return BUDGET.allow("llm", "server", (LLM_DAILY_CALLS, 86400.0), (LLM_DAILY_CALLS, 86400.0))
