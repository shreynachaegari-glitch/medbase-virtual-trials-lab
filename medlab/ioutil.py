"""Result files are read by live API threads, so they must appear complete or not at all."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path


def write_atomic(path: Path, text: str) -> None:
    handle, temp = tempfile.mkstemp(dir=path.parent, prefix=path.name)
    try:
        with os.fdopen(handle, "w") as out:
            out.write(text)
        os.replace(temp, path)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise
