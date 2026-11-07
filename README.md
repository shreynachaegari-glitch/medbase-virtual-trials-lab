# MedBase Virtual Trials Lab

Run a type 2 diabetes drug trial on your laptop, then see how far to trust it.

An applied AI lab that simulates randomised drug trials in virtual patients built from real public health survey data, and that tells you where it has been wrong. The simulator runs in your browser with no server, and a live AI copilot calls NVIDIA through a small proxy. It was fitted on three real trials, frozen, and then tested blind on real trials it had not seen.

On 20 results from 6 real trials it never saw, predicted HbA1c effects were off by 0.29 points on average, and 50% landed within 0.30 points of what the trial reported. Passed: interval coverage, kidney effect size. Failed, and reported as failures: prediction accuracy, beating a simple rival with no physiology.

> Research and education only. This is not medical advice and cannot show that a treatment works for any person. It offers no dosing guidance.

## What you can do

| Feature | What it does |
|---|---|
| AI Trial Designer | Give it a goal. A neural surrogate proposes a dose, the simulator checks it, and every step is shown, down to the smallest study that can detect the effect. |
| Instant what-if sliders | The neural surrogate answers as you drag, then one click runs the full simulator to check it. |
| See it in the body | 3D organs from the Human Reference Atlas, driven by simulated values. |
| Virtual trial | Compare semaglutide, empagliflozin, sitagliptin, metformin or a hypothetical molecule against placebo. |
| Proof | Every held-out prediction against the real result, including misses. |
| Who responds | Runs the same virtual patient on drug and placebo, and summarises which traits drive benefit in the model. |
| Power | How many patients a study needs. |
| Disease progression | The published Ha, Satin and Sherman 2016 model of how type 2 diabetes develops and can reverse. |
| Safety | Adverse events as reported in real trials, kept apart from simulated numbers. |
| Live AI copilot | Ask in plain English. It runs the tools, shows them live, and its numbers are checked against their output. Ordinary questions are answered from a searchable index of reviewed notes. |
| Race the simulator | The neural network and the full simulator answer the same question, with both timed live in your browser. |
| Prediction meets reality | An animated chart moves each frozen prediction to what the real trial reported, misses included. |

## The Applied AI

```
Goal ─────> neural surrogate proposes a dose ──> simulator checks and refines ──> study design
Question ─> live copilot plans tool calls ─────> simulator computes ──> number guard ──> reply
NHANES labs ──> digital twins ──> trial enrolment ──> simulator ──> trial statistics
Registry results ──> Bayesian calibration ──────────────^     every result shows its blind-test record
```

| Layer | What it is | Measured result |
|---|---|---|
| Bayesian calibration | MCMC (emcee, 44 walkers, 6500 steps) learns drug effects from three real trials and carries the uncertainty into every prediction | Split R-hat 1.026, chain length 56 autocorrelation times; blind test below |
| Neural surrogate | A small neural network trained on 2400 simulator runs, with numpy-only inference in the browser, for instant sliders and for guiding the designer | HbA1c mean error 0.082 points, R2 0.949 on 480 simulator runs it never saw. It learns the simulator, not reality |
| AI Trial Designer | Takes a goal; the surrogate proposes a dose and the simulator checks and refines it, then sizes the study | Across 36 goals: 3.28 simulator runs on average against 6.03 for plain bisection (46% fewer); same feasibility verdict on 36 of 36; median dose difference 3% |
| Live copilot | nvidia/nemotron-3.5-lightning-30b-a3b on NVIDIA NIM plans tool calls and explains results, in the public site through a key-hiding proxy | On 10 project-written questions: 6 answered by the model, 4 written by code, right tool on 9 of 10, guard repaired 3 and replaced 0, median 9.9 s. A small sample |
| Retrieval for ordinary questions | Hybrid vector search over 71 notes written for this project: neural embeddings (nvidia/nemotron-3-embed-1b, saved in the repo, with the question embedded through the proxy only after the guard clears it), with an in-browser TF-IDF index as the fallback. No hosted database: numpy cosine similarity in the browser. The model may use only the notes found, and code then checks that its wording came from them | On 60 blind, held-out questions, scored once: right note in the top 3 98.3%, top 1 83.3%. 10 of those were still declined, after a later safety fix. None of 30 must-refuse messages reached a model. The first blind list scored 58.8% on TF-IDF alone, which is why embeddings were added; that list was then used for tuning |
| Safety guard | Default-deny on input, and a digit figure no tool produced sends the draft back to the model once, then falls back to computed text | 44 of 44 project-written attack prompts refused before any model call. Blind results are in the section below |
| Intent model | TF-IDF and logistic regression for greetings and help, runs in the browser, cannot write a number | 95.3% on 43 project-written phrases, a small sample |
| Blind-test track record | Shows beside each simulated result where that drug held up or missed in the blind test | Added after the blind run; a look-up that changes no prediction |

The rule across all of them: **models propose and explain, the simulator computes.** Efficacy numbers come from the simulator, and digit figures in a model's reply are checked against tool output. Questions about the blind test, and study designs, are answered in text written by code, because a paraphrase got the lab's own failures wrong in testing and a design must not read as a dose. Code also appends the validation status, warnings and blind-test record to every efficacy reply, so none can be dropped.

## How we attacked our own safety guard

A rule-based guard runs before any model. Only a question with a research frame reaches a simulation or a language model. A personal question is refused, a message that looks urgent gets emergency contacts, and every simulation or safety answer ends by saying where help is. We tested it adversarially and report what we found, because the first versions failed badly.

| Test | Personal messages reaching a simulation | Urgent messages missing the emergency reply | Research questions refused |
|---|---|---|---|
| First attack, written after reading the rules | 201 of 246 wrong class, 171 got a trial number | | |
| First blind run: inputs written before seeing the code | 0 of 144 personal, 0 of 44 disguised | 17 of 28 | 15 of 72 |
| Second blind run, aimed at terse messages | 6 of 226 | 28 of 58, 4 with no emergency number | 42 of 84 |
| Shipped guard, re-measured on those same lists: **tuned on them, so not held out** | 0 of 414 | 1 of 86, 0 of 86 with no emergency number | 18 of 156 |

The last row is the current state but it is optimistic, and no blind test has been run on the final version. These lists are hard on purpose and written by one author, so they are not a real-traffic rate. Treat this as a guard for a supervised research demo, not an unattended public service.

Known limits:

- The guard checks that each figure has a source, not its sign or the sentence around it. A model reply can still misdescribe a correct number, so read the figures beside it.
- A terse question naming a drug with a research word cannot be told apart from a person's own question. It gets a population figure with its failed checks and the emergency line, never a personal answer.
- Regex rules cannot catch every implied piece of advice in free text. Reproduce the table with `scripts/eval_guard.py`.
- The notes behind ordinary answers were written for this project, not reviewed by a clinician. They explain ideas and never say what anyone should take.

It answers with Claude (`ANTHROPIC_API_KEY`), NVIDIA NIM (`NVIDIA_API_KEY`), or an offline planner when no key is set or a provider fails. Reproduce the numbers above with `scripts/eval_designer.py`, `scripts/eval_copilot.py` and `scripts/train_surrogate.py`.

## How it works

- **Patients:** real NHANES adults with diabetes, not on insulin (cycles 2013-14, 2015-16 and 2017-March 2020). Each person's labs are converted to their own model parameters.
- **Physiology:** Topp 2000 glucose and insulin dynamics, ADAG for HbA1c, and a renal filtration model.
- **Drugs act through mechanisms:** liver glucose output, insulin secretion, renal threshold, weight. Combinations work through physiology, and are not added together as fixed HbA1c shifts.
- **Trials:** real eligibility limits, baseline matching by entropy balancing, randomisation, dropout, assay noise, ANCOVA.

## Validation

Parameters and predictions were frozen and committed (commit `9fc4bb6`) before any held-out outcome was opened, and the outcomes were opened once. Git history shows the order. The seal is mechanical: these are famous trials, so the authors knew the literature in general. Full table and analysis of the failures: [docs/VALIDATION.md](docs/VALIDATION.md).

| Check | Pass mark | Result |
|---|---|---|
| Prediction accuracy | Mean error up to 0.25 points, at least 70% within 0.30 | Fail: mean error 0.29, 50% within 0.30 |
| Interval coverage | At least 85% inside the 95% interval | Pass: 85% |
| Kidney effect, never fitted | Weaker at low eGFR, each stratum within 0.30 | Pass: mild -0.61 vs -0.69 observed; moderate -0.47 vs -0.42 observed |
| Beat a rival with no physiology | Whole 95% interval of the error difference below zero | Fail: mean error 0.29 vs rival 0.3, difference -0.01 (95% CI -0.091 to +0.034) |

Accuracy held up in EMPA-REG MET, EMPA-REG RENAL mild, EMPA-REG RENAL moderate, SUSTAIN 2, Sitagliptin monotherapy. It missed in the 12-week semaglutide dose-ranging trial, where it over-predicted benefit, and in the metformin arms of the factorial trial, where it under-predicted. Across all results the physiology did not clearly beat carrying effects forward, so read simulated numbers as a way to think about a study, not as forecasts. Markov chains met the convergence gate.

## Limits

- This predicts average HbA1c effects in trial populations. It says nothing about an individual.
- Cardiovascular and kidney outcomes, intraday glucose curves, sulfonylureas and insulin are not modelled.
- NHANES is a US survey with small eligible pools for some trials (see effective sample sizes in the validation report). It is not an Indian cohort.
- Registry results are sponsor-submitted.
- Hypothetical molecules reflect the numbers you enter. They are not predictions about any real compound.

## Run it

Open the live demo: the real engine runs in your browser through Pyodide, with no server. First load takes about 20 seconds. Locally:

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.lock && pip install -e '.[dev]'
python scripts/fetch_data.py
pytest
uvicorn medlab.api:app --port 8000      # API
cd web && npm ci && npm run dev         # UI, opens on /trials
```

Latest test run: 768 passed in 73.39s (0:01:13).

## Credits

Built on MedBase by Team Aegis. Data, methods and software sources are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Repositories considered and rejected, with reasons, are in [docs/REPO_SURVEY.md](docs/REPO_SURVEY.md).
