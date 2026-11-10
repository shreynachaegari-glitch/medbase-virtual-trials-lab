"""Writes web/public/engine/: everything the in-browser engine loads. Raw survey files are not included."""
import base64
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

from medlab import population as pop
from medlab import safety
from medlab.agent import knowledge

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "engine"
COLUMNS = ["RIDAGEYR", "female", "LBXGH", "LBXGLU", "fasting_weight", "LBXIN", "BMXBMI", "BMXWT", "LBXSCR", "egfr", "gfr", "on_metformin", "on_other_agent", "on_oral_agent", "naive"]

OUT.mkdir(parents=True, exist_ok=True)
pop.load_labs().reset_index(drop=True)[COLUMNS].sample(frac=1, random_state=0).round(4).to_csv(OUT / "labs.csv", index=False)  # shuffled, no SEQN
with zipfile.ZipFile(OUT / "medlab.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((ROOT / "medlab").rglob("*")):
        if path.suffix in {".py", ".json"}:
            archive.write(path, path.relative_to(ROOT))
for name in ("posterior.json", "validation.json"):
    source = ROOT / "results" / name
    if source.exists():
        shutil.copy(source, OUT / name)
trials = sorted({nct for nct, _ in safety.SOURCES.values()})
for nct in trials:
    record = json.loads((ROOT / "data" / "raw" / "registry" / f"{nct}.json").read_text())
    # Only what the safety table reads. This is a TRAIN record, so nothing sealed is shipped.
    slim = {"protocolSection": {"identificationModule": record["protocolSection"]["identificationModule"]}, "resultsSection": {"adverseEventsModule": record["resultsSection"]["adverseEventsModule"]}}
    (OUT / f"{nct}.json").write_text(json.dumps(slim))
note_vectors = knowledge._note_vectors()
if note_vectors is None:
    raise SystemExit("note_vectors.json does not match the notes: run scripts/embed_notes.py")
(OUT / "note_vectors.json").write_text(json.dumps({
    "titles": [title for title, _ in knowledge._notes()], "dimensions": note_vectors.shape[1],
    "vectors": base64.b64encode(note_vectors.astype("<f4").tobytes()).decode("ascii"),
}))
# Changes whenever any engine file does, so a browser's offline cache knows when to fetch them again.
version = hashlib.sha256(b"".join(p.name.encode() + p.read_bytes() for p in sorted(OUT.iterdir()) if p.name != "manifest.json")).hexdigest()[:16]
(OUT / "manifest.json").write_text(json.dumps({"version": version, "trials": trials, "results": [n for n in ("posterior.json", "validation.json") if (OUT / n).exists()], "pyodide": "314.0.7", "packages": ["numpy", "scipy", "pandas", "scikit-learn", "pydantic"]}, indent=1))
print(sorted(p.name for p in OUT.iterdir()), sum(p.stat().st_size for p in OUT.iterdir()) // 1024, "KB")
