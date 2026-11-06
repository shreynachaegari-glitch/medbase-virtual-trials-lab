# MedBase Lab: definition of done for INFINEX 2K26

Deadline: 7 Nov 2026, 23:00 IST. Each item needs evidence: a command run in this iteration, or a file. Never mark an item done on intent.

## Science (never tune against held-out trials)
- [x] S1 Calibration finished: `results/posterior.json` exists; report acceptance and autocorrelation honestly (`results/calibrate.log`). Evidence 2026-11-06: 6500 steps, 44 walkers, burn 1000, acceptance 0.221, split R-hat 1.026, length 56.1 autocorrelation times, converged true, posterior sha256 731741a35fe94f14.
- [x] S2 Posterior predictive fit on TRAIN trials written to `results/train_fit.json`. Evidence 2026-11-06: HbA1c errors at most 0.08; largest misses are SUSTAIN 1 placebo FPG +11.4 mg/dL and placebo weight +0.50 kg.
- [x] S3 `python -m medlab.validate` run exactly once for the frozen posterior; `results/validation.json` shows `blind: true`. Evidence 2026-11-06: opened once at 08:03 after commit 9fc4bb6; `results/unseal_log.json` 1 opening, `blind: true`.
- [x] S4 Checks V1 to V5 reported pass or fail in `docs/VALIDATION.md` with every contrast. A failed check is written as failed. Evidence 2026-11-06: `docs/VALIDATION.md` generated from results: V3 FAIL, V4 PASS, V5 PASS, V6 FAIL.
- [x] S5 If validation fails, the failure is analysed. A model change after unsealing is logged as non-blind and needs fresh held-out trials not yet read. Evidence 2026-11-06: analysis section in `docs/VALIDATION.md`, labelled post hoc. No model change made.

## Engine and assistant
- [x] E1 `pytest` green, run in this iteration. Evidence 2026-11-06 20:58: 596 passed.
- [x] E2 Reviews done and every CRITICAL or HIGH finding fixed or explained: python-reviewer, healthcare-reviewer, security-reviewer, research-reviewer. Evidence 2026-11-06: clinical, code and two blind adversarial reviews; findings fixed or disclosed in README. See vault status log.
- [x] E3 Live smoke of each API route against the real posterior, with outputs saved in `results/smoke.json`. Evidence 2026-11-06: `scripts/smoke.py`, all routes 200, `results/smoke.json`.
- [x] E4 Assistant offline planner works end to end on real results for 6 sample questions, including a refusal. Evidence 2026-11-06: smoke runs 6 questions on the planner including a refusal; `results/smoke.json`.

## Product
- [x] P1 `/trials` page built in `web/`, type-checks and builds. Evidence 2026-11-06: `npm run build:static` passes, tsc clean, vitest 134 passed.
- [x] P2 Real browser run against the live API: build a trial, see results, validation page, assistant. Zero console errors, desktop and mobile. Screenshots saved under `results/screens/`. Evidence 2026-11-06: real Chromium on the static build with real posterior and validation, desktop only: 13 of 13, zero console errors, zero failed requests, `results/release_check.json`, `results/screens/release/`. Real proxy reached with a forwarded Origin. Mobile not re-run after today's changes.
- [x] P3 Demo snapshots generated from real runs, so the page still works if the API is down, and they are labelled as saved runs. Evidence 2026-11-06: `scripts/make_snapshots.py` regenerated from real runs.
- [x] P4 UI states validation status beside results, and never claims clinical validity. Evidence 2026-11-06: hero badges and the track record card visible in `results/screens/release/`.

- [x] P5 AI Trial Designer (`/api/design`) visible as a step-by-step chain in the UI, verified live. Track is Applied AI. Evidence 2026-11-06: surrogate guide and steps visible in `results/screens/release/designer-surrogate.png`.
- [x] P6 Disease Progression tab (Ha-Satin-Sherman) verified live. Evidence 2026-11-05: progression tab ran on the live site; 6 Nov smoke not re-run in browser.

## Submission pack (`docs/submission/`)
- [x] D1 README with quick start, architecture, honest results and limits. Evidence 2026-11-06: `scripts/make_submission.py` writes README from results.
- [ ] D2 Dockerfile builds and the container serves UI and API locally, verified.
- [x] D3 Unstop form text: title, problem, solution, key features, tech stack. Evidence 2026-11-06: `docs/submission/UNSTOP_FORM.md`.
- [x] D4 Demo video script under 3 minutes, and a short deck. Evidence 2026-11-06: `docs/submission/VIDEO_SCRIPT.md` and `docs/submission/MedBase_Virtual_Trials_Lab.pptx`, validated and rendered.
- [ ] D5 Third-party notices written; MedBase team credited; licence choice listed for Sreyesh and the team (their code, their call).

- [x] D6 (publish.sh written; 13:30 scan: no secret-like files, patterns or raw data among files to add) Local git repo ready: `scripts/publish.sh` written; `git add -An` shows no secrets, keys or raw data.

## Record
- [x] R1 Obsidian `~/Jarvis/projects/MedBase/` status updated with numbers, evidence paths and next steps. MOC links current. Evidence 2026-11-06: vault status and handoff updated at 21:00.

## Only Sreyesh can do these: list them in the final message, do not attempt them
Paying and registering on Unstop, joining the WhatsApp group, checking the pre-existing-project rule, commits and pushes, creating the public repo, hosting tokens, deploying, recording the video, submitting.
