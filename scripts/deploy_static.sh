#!/usr/bin/env bash
# Builds the static site and uploads it to a Hugging Face static Space. Sreyesh runs this.
# Usage: scripts/deploy_static.sh <hf-user>/<space-name>
set -euo pipefail
SPACE="${1:?usage: scripts/deploy_static.sh <hf-user>/<space-name>}"
cd "$(dirname "$0")/.."
.venv/bin/python scripts/make_browser_bundle.py
.venv/bin/python web/scripts/make_static_snapshots.py
(cd web && VITE_LLM_PROXY="${MEDLAB_LLM_PROXY:-https://medbase-lab-ai.vercel.app/api/chat}" npm run build:static)
chmod -R a+rX web/dist
cat > web/dist/README.md <<'YAML'
---
title: MedBase Virtual Trials Lab
sdk: static
app_file: index.html
---
Source and validation report are in the project's GitHub repository.
YAML
if grep -rlE 'nvapi-[A-Za-z0-9]|sk-ant-[A-Za-z0-9]|hf_[A-Za-z0-9]{20}' web/dist >/dev/null; then
  echo "Refusing to upload: something that looks like a key is in web/dist." >&2
  exit 1
fi
hf upload "$SPACE" web/dist . --repo-type space --commit-message "Update MedBase Virtual Trials Lab"
echo "Open: https://huggingface.co/spaces/$SPACE"
