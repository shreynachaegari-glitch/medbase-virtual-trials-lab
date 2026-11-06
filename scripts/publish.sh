#!/usr/bin/env bash
# Publishes this project to a new public GitHub repo. Sreyesh runs this; nothing here runs automatically.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${1:-medbase-virtual-trials-lab}"
if git ls-files --others --cached --exclude-standard | grep -E '(^|/)\.env$|\.pem$|id_rsa' ; then
  echo "Refusing to publish: a secret-like file would be included." >&2
  exit 1
fi
git add -A
git commit -m "feat: MedBase Virtual Trials Lab for INFINEX 2K26"
gh repo create "$REPO" --public --source=. --push
gh repo view "$REPO" --json url --jq .url
