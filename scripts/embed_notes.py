"""Embeds the copilot's notes with an NVIDIA model, so a question can find them by meaning. Rerun it when a note changes.

Writes medlab/agent/note_vectors.json. A test fails if the file no longer matches the notes.
Run from the project root: .venv/bin/python scripts/embed_notes.py
"""
import base64
import json
import os
import re
from pathlib import Path

import httpx
import numpy as np

from medlab.agent import knowledge

ROOT = Path(__file__).resolve().parent.parent
BATCH = 32


def api_key() -> str:
    key = os.environ.get("NVIDIA_API_KEY", "")
    if key:
        return key
    for line in (ROOT / ".env").read_text().splitlines():
        match = re.match(r"\s*(?:export\s+)?NVIDIA_API_KEY\s*=\s*[\"']?([^\"'\s]+)", line)
        if match:
            return match.group(1)
    raise SystemExit("NVIDIA_API_KEY is not set")


def embed(texts: list[str], input_type: str) -> np.ndarray:
    rows = []
    for start in range(0, len(texts), BATCH):
        response = httpx.post("https://integrate.api.nvidia.com/v1/embeddings", headers={"Authorization": f"Bearer {api_key()}"},
                              json={"model": knowledge.EMBED_MODEL, "input": texts[start:start + BATCH], "input_type": input_type}, timeout=120)
        response.raise_for_status()
        rows += [item["embedding"] for item in sorted(response.json()["data"], key=lambda item: item["index"])]
    return np.array(rows, dtype=np.float64)


if __name__ == "__main__":
    notes = knowledge._notes()
    vectors = embed([knowledge.embedded_text(title, text) for title, text in notes], "passage")
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
    knowledge.VECTORS.write_text(json.dumps({
        "model": knowledge.EMBED_MODEL, "fingerprint": knowledge.fingerprint(), "shape": list(vectors.shape),
        "vectors": base64.b64encode(vectors.astype("<f2").tobytes()).decode("ascii"),
    }))
    print(f"{vectors.shape[0]} notes, {vectors.shape[1]} dimensions, {knowledge.VECTORS.stat().st_size // 1024} KB")
