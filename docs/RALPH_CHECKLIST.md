# MedBase Lab: definition of done for INFINEX 2K26

Deadline: 7 Nov 2026, 23:00 IST. Each item needs evidence: a command run in this iteration, or a file. Never mark an item done on intent.

## Science (never tune against held-out trials)
- [x] S1 Calibration finished: `results/posterior.json` exists; report acceptance and autocorrelation honestly (`results/calibrate.log`). Evidence 2026-11-06: 6500 steps, 44 walkers, burn 1000, acceptance 0.221, split R-hat 1.026, length 56.1 autocorrelation times, converged true, posterior sha256 731741a35fe94f14.
- [x] S2 Posterior predictive fit on TRAIN trials written to `results/train_fit.json`. Evidence 2026-11-06: HbA1c errors at most 0.08; largest misses are SUSTAIN 1 placebo FPG +11.4 mg/dL and placebo weight +0.50 kg.
- [ ] S3 `python -m medlab.validate` run exactly once for the frozen posterior; `results/validation.json` shows `blind: true`.
- [ ] S4 Checks V1 to V5 reported pass or fail in `docs/VALIDATION.md` with every contrast. A failed check is written as failed.
- [ ] S5 If validation fails, the failure is analysed. A model change after unsealing is logged as non-blind and needs fresh held-out trials not yet read.

## Engine and assistant
- [x] E1 `pytest` green, run in this iteration. Evidence 2026-11-06: 247 passed.
- [ ] E2 Reviews done and every CRITICAL or HIGH finding fixed or explained: python-reviewer, healthcare-reviewer, security-reviewer, research-reviewer.
- [ ] E3 Live smoke of each API route against the real posterior, with outputs saved in `results/smoke.json`.
- [ ] E4 Assistant offline planner works end to end on real results for 6 sample questions, including a refusal.

## Product
- [ ] P1 `/trials` page built in `web/`, type-checks and builds.
- [ ] P2 Real browser run against the live API: build a trial, see results, validation page, assistant. Zero console errors, desktop and mobile. Screenshots saved under `results/screens/`.
- [ ] P3 Demo snapshots generated from real runs, so the page still works if the API is down, and they are labelled as saved runs.
- [ ] P4 UI states validation status beside results, and never claims clinical validity.

- [ ] P5 AI Trial Designer (`/api/design`) visible as a step-by-step chain in the UI, verified live. Track is Applied AI.
- [ ] P6 Disease Progression tab (Ha-Satin-Sherman) verified live.

## Submission pack (`docs/submission/`)
- [ ] D1 README with quick start, architecture, honest results and limits.
- [ ] D2 Dockerfile builds and the container serves UI and API locally, verified.
- [ ] D3 Unstop form text: title, problem, solution, key features, tech stack.
- [ ] D4 Demo video script under 3 minutes, and a short deck.
- [ ] D5 Third-party notices written; MedBase team credited; licence choice listed for Sreyesh and the team (their code, their call).

- [x] D6 (publish.sh written; 13:30 scan: no secret-like files, patterns or raw data among files to add) Local git repo ready: `scripts/publish.sh` written; `git add -An` shows no secrets, keys or raw data.

## Record
- [ ] R1 Obsidian `~/Jarvis/projects/MedBase/` status updated with numbers, evidence paths and next steps. MOC links current.

## Only Sreyesh can do these: list them in the final message, do not attempt them
Paying and registering on Unstop, joining the WhatsApp group, checking the pre-existing-project rule, commits and pushes, creating the public repo, hosting tokens, deploying, recording the video, submitting.
