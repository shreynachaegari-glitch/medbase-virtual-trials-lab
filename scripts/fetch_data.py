"""Downloads the public inputs and checks them against pinned hashes, so a rebuild uses the same data.

Run with --write-manifest once to pin; later runs fail on any mismatch.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
MANIFEST = ROOT / "data" / "manifest.json"
NHANES = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/{}/DataFiles/{}.xpt"
NHANES_TABLES = ("DEMO", "GHB", "GLU", "INS", "BMX", "BIOPRO", "DIQ", "RXQ_RX")
SHERMAN = "https://raw.githubusercontent.com/artielbm/artielbm.github.io/master/Models/Pathogenesis/{}"
BIOMODELS = "https://www.ebi.ac.uk/biomodels/model/download/BIOMD0000000341?filename=BIOMD0000000341_url.xml"
REGISTRY = "https://clinicaltrials.gov/api/v2/studies/{}"
RUNTIME_TRIALS = ("NCT02054897", "NCT01177813", "NCT00676338")
ALL_TRIALS = (*RUNTIME_TRIALS, "NCT01930188", "NCT00696657", "NCT01164501", "NCT01159600", "NCT00087516", "NCT00103857")


def sources(include_held_out: bool) -> dict[str, str]:
    files = {}
    for year, prefix, suffix in ((2017, "P_", ""), (2015, "", "_I"), (2013, "", "_H")):
        for table in NHANES_TABLES:
            name = f"{prefix}{table}{suffix}"
            files[f"nhanes/{name}.xpt"] = NHANES.format(year, name)
    files.update({f"sherman/{name}": SHERMAN.format(name) for name in ("human.ode", "fig7_human_early.set")})
    files["biomodels/topp.xml"] = BIOMODELS
    trials = ALL_TRIALS if include_held_out else RUNTIME_TRIALS
    files.update({f"registry/{nct}.json": REGISTRY.format(nct) for nct in trials})
    return files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-manifest", action="store_true")
    parser.add_argument("--runtime-only", action="store_true", help="skip trials only needed to re-run validation")
    args = parser.parse_args()
    pinned = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    seen: dict[str, str] = {}
    failures = []
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        for relative, url in sources(not args.runtime_only).items():
            path = RAW / relative
            if not path.exists():
                response = client.get(url)
                response.raise_for_status()
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(response.content)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            seen[relative] = digest
            # Registry records can be updated by sponsors, which is reported rather than fatal to a rebuild.
            if relative in pinned and pinned[relative] != digest:
                failures.append(relative)
    if args.write_manifest:
        MANIFEST.write_text(json.dumps(seen, indent=1, sort_keys=True))
    print(f"{len(seen)} files checked")
    if failures:
        print("Changed since pinned:", failures, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
