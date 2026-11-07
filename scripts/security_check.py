"""Repeatable security checks: no keys in the repo or its history, secrets ignored, proxy lock in step, no known-vulnerable packages.

Writes results/security_check.json and exits non-zero on any failure.
Run from the project root: .venv/bin/python scripts/security_check.py
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

from medlab.agent import assistant

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "results" / "security_check.json"
KEY_PATTERN = r"nvapi-[A-Za-z0-9_-]{16}|sk-ant-[A-Za-z0-9_-]{16}|hf_[A-Za-z0-9]{30}|ghp_[A-Za-z0-9]{30}|AKIA[0-9A-Z]{16}"
KEY = re.compile(KEY_PATTERN)
SKIPPED_SUFFIXES = {".png", ".jpg", ".glb", ".wasm", ".pptx", ".zip", ".gz", ".csv"}


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=False).stdout


def tracked_files_with_keys() -> list[str]:
    found = []
    for name in git("ls-files").splitlines():
        path = ROOT / name
        if path.suffix in SKIPPED_SUFFIXES or not path.is_file():
            continue
        if KEY.search(path.read_text(errors="ignore")):
            found.append(name)
    return found


def history_has_keys() -> bool:
    return bool(git("log", "--all", "-p", "--format=", f"-G{KEY_PATTERN}", "--", ".").strip())


def built_site_has_keys() -> list[str]:
    dist = ROOT / "web" / "dist"
    if not dist.exists():
        return []
    return [str(p.relative_to(ROOT)) for p in dist.rglob("*") if p.is_file() and p.suffix in {".js", ".html", ".json"} and KEY.search(p.read_text(errors="ignore"))]


def proxy_lock_in_step() -> bool:
    proxy = (ROOT / "proxy" / "api" / "chat.js").read_text()
    digest = lambda text: hashlib.sha256(text.encode()).hexdigest()  # noqa: E731
    specs = [assistant._tool_specs_openai(), assistant._general_tool_specs()]
    wanted = [digest(assistant.SYSTEM), digest(assistant.GENERAL_SYSTEM)] + [digest(json.dumps(s, separators=(",", ":"), ensure_ascii=False)) for s in specs]
    return all(value in proxy for value in wanted)


def npm_vulnerabilities() -> int | None:
    run = subprocess.run(["npm", "audit", "--omit=dev", "--json"], cwd=ROOT / "web", capture_output=True, text=True, check=False)
    try:
        return json.loads(run.stdout)["metadata"]["vulnerabilities"]["total"]
    except (ValueError, KeyError):
        return None


def main() -> int:
    report = {
        "tracked_files_with_keys": tracked_files_with_keys(), "history_has_keys": history_has_keys(), "built_site_files_with_keys": built_site_has_keys(),
        "env_ignored_by_git": bool(git("check-ignore", ".env").strip()), "env_tracked": bool(git("ls-files", ".env").strip()),
        "proxy_lock_matches_prompts_and_tools": proxy_lock_in_step(), "npm_production_vulnerabilities": npm_vulnerabilities(),
    }
    report["passed"] = (not report["tracked_files_with_keys"] and not report["history_has_keys"] and not report["built_site_files_with_keys"]
                        and report["env_ignored_by_git"] and not report["env_tracked"] and report["proxy_lock_matches_prompts_and_tools"]
                        and report["npm_production_vulnerabilities"] == 0)
    OUT.write_text(json.dumps(report, indent=1))
    print(json.dumps(report))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
