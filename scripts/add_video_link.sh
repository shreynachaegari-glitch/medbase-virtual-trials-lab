#!/usr/bin/env bash
# Puts a YouTube link on slides 1 and 8 of the 8-slide deck, then rebuilds the .pptx and .pdf.
# Usage: scripts/add_video_link.sh "https://youtu.be/XXXXXXXXXXX"
set -euo pipefail
URL="${1:?usage: scripts/add_video_link.sh <youtube link>}"
cd "$(dirname "$0")/.."
TOOLS="/tmp/claude-1000/-home-tg-hello-world/2161ae4c-806f-4b1c-9617-63c03a48dc01/scratchpad"
export NODE_PATH="$TOOLS/decktools/node_modules"
MEDLAB_VIDEO_URL="$URL" node scripts/make_deck_final.cjs >/dev/null
WORK="$(mktemp -d)"
cp docs/submission/MedBase_Virtual_Trials_Lab_Final.pptx "$WORK/"
(cd "$WORK" && "$TOOLS/lo/root/usr/lib64/libreoffice/program/soffice" --headless --convert-to pdf MedBase_Virtual_Trials_Lab_Final.pptx >/dev/null 2>&1)
cp "$WORK/MedBase_Virtual_Trials_Lab_Final.pdf" docs/submission/
pdftotext docs/submission/MedBase_Virtual_Trials_Lab_Final.pdf - | grep -q "Demo video" && echo "Done. The link is in both files in docs/submission."
