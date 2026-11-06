#!/usr/bin/env bash
# Continues the calibration chain, detached so it outlives the terminal or session that started it.
cd "$(dirname "$0")/.."
OMP_NUM_THREADS=1 setsid nohup .venv/bin/python -m medlab.calibrate --steps "${1:-2000}" --burn 1000 --processes 16 --resume "${2:-results/chain_step3000.npy}" > results/calibrate_resume.log 2>&1 < /dev/null &
