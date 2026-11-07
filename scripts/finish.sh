#!/usr/bin/env bash
# Regenerates every result, the site build, the documents and the deck from the current code.
# Spends about 28 NVIDIA calls. It commits and deploys nothing. Needs pptxgenjs on NODE_PATH for the deck.
set -uo pipefail
cd "$(dirname "$0")/.."
PY=.venv/bin/python

env -u NVIDIA_API_KEY $PY -m pytest -q 2>&1 | tail -1
$PY -c "import json; from medlab import validate as v; print('frozen hash unchanged:', v.code_hash()==json.load(open('results/predictions.json'))['code_hash'])"
env -u NVIDIA_API_KEY -u ANTHROPIC_API_KEY PYTHONPATH=. $PY scripts/eval_guard.py >/dev/null 2>&1 && echo "guard eval written"
timeout 280 $PY scripts/eval_copilot.py >/dev/null 2>&1 && $PY -c "import json; print(json.load(open('results/copilot_eval.json'))['summary'])"
env -u NVIDIA_API_KEY timeout 250 $PY scripts/smoke.py 2>&1 | grep -cE '^[a-z_]+ +200 ' | sed 's/^/smoke routes 200: /'
env -u NVIDIA_API_KEY timeout 250 $PY scripts/make_snapshots.py >/dev/null 2>&1 && echo "snapshots written"
$PY scripts/make_browser_bundle.py >/dev/null 2>&1 && $PY web/scripts/make_static_snapshots.py >/dev/null 2>&1 && echo "bundle written"
(cd web && npx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -2; npx vitest run 2>&1 | grep -E 'Tests ' ; VITE_LLM_PROXY=https://medbase-lab-ai.vercel.app/api/chat npm run build:static 2>&1 | tail -1)
grep -rlE 'nvapi-[A-Za-z0-9]|sk-ant-[A-Za-z0-9]|hf_[A-Za-z0-9]{20}' web/dist | head -3
echo "key scan done"
(cd web/dist && python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/medbase-http.pid)
sleep 1
(cd web && timeout 450 node ../scripts/release_check.cjs 2>&1 | grep -E '^FAIL|^CRASH|passed$' | cut -c1-260)
kill "$(cat /tmp/medbase-http.pid)" 2>/dev/null
pkill -f 'http.server 8765' 2>/dev/null
$PY scripts/make_validation_doc.py >/dev/null && env -u NVIDIA_API_KEY $PY scripts/make_submission.py 2>&1 | tail -1 | cut -c1-160
