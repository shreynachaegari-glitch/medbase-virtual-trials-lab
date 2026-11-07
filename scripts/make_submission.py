"""D1, D3, D4: writes the README and submission text from results, so claims cannot outrun the evidence."""
import json
import subprocess
import sys
from pathlib import Path

V = json.loads(Path("results/validation.json").read_text())
FIT = json.loads(Path("results/train_fit.json").read_text())
SMOKE = json.loads(Path("results/smoke.json").read_text()) if Path("results/smoke.json").exists() else None
S = V["score"]
RENAL = {r["arm"] + "|" + r["trial"]: r for r in V["contrasts"] if r["group"] == "renal"}
MILD, MOD = RENAL["Empa 25mg|EMPA-REG RENAL mild"], RENAL["Empa 25mg|EMPA-REG RENAL moderate"]
CHECKS = {"V3_pass": "prediction accuracy", "V4_pass": "interval coverage", "V5_pass": "kidney effect size", "beats_null": "beating a simple rival with no physiology"}
PASSED = [CHECKS[k] for k in CHECKS if S[k]]
FAILED = [CHECKS[k] for k in CHECKS if not S[k]]
SURROGATE = json.loads(Path("results/surrogate_eval.json").read_text())
DESIGNER = json.loads(Path("results/designer_eval.json").read_text())["summary"]
COPILOT = json.loads(Path("results/copilot_eval.json").read_text())["summary"]
RETRIEVAL = json.loads(Path("results/retrieval_eval.json").read_text())
HELD_OUT = RETRIEVAL["held_out"]
VECTOR_DB = json.loads(Path("results/vector_db_eval.json").read_text())
FIRST_RUN = RETRIEVAL["first_blind_run"]
INTENT = json.loads(Path("results/intent_eval.json").read_text())
GUARD = json.loads(Path("results/guard_eval.json").read_text())
SHIPPED = GUARD["shipped_guard"]
ATTACK, BLIND_1, BLIND_2 = GUARD["first_attack"], *GUARD["blind_runs"]
frac = lambda pair: f"{pair[0]} of {pair[1]}"  # noqa: E731
HELD_UP = ", ".join(sorted(t for t, row in V["by_trial"].items() if row["mae"] <= 0.25))
word = lambda ok: "Pass" if ok else "Fail"  # noqa: E731
tests = subprocess.run([sys.executable, "-m", "pytest", "-q"], capture_output=True, text=True).stdout.strip().splitlines()[-1]
n_trials = len({r["trial"].replace(" mild", "").replace(" moderate", "") for r in V["contrasts"]})
headline = (f"On {S['n_contrasts']} results from {n_trials} real trials it never saw, predicted HbA1c effects were off by {S['mae']} points on average, "
            f"and {S['within_0_30']:.0%} landed within 0.30 points of what the trial reported.")
verdict = ("All pre-registered held-out checks passed." if not FAILED
           else "Passed: " + ", ".join(PASSED) + ". Failed, and reported as failures: " + ", ".join(FAILED) + ".")
ai_rows = f"""| Layer | What it is | Measured result |
|---|---|---|
| Bayesian calibration | MCMC (emcee, {json.loads(Path("results/posterior.json").read_text())["walkers"]} walkers, {json.loads(Path("results/posterior.json").read_text())["steps"]} steps) learns drug effects from three real trials and carries the uncertainty into every prediction | Split R-hat {V['max_split_rhat']:.3f}, chain length {V['length_over_tau']:.0f} autocorrelation times; blind test below |
| Neural surrogate | A small neural network trained on {SURROGATE['runs_used']} simulator runs, with numpy-only inference in the browser, for instant sliders and for guiding the designer | HbA1c mean error {SURROGATE['a1c_mae']} points, R2 {SURROGATE['a1c_r2']} on {SURROGATE['test_runs']} simulator runs it never saw. It learns the simulator, not reality |
| AI Trial Designer | Takes a goal; the surrogate proposes a dose and the simulator checks and refines it, then sizes the study | Across {DESIGNER['goals']} goals: {DESIGNER['mean_runs_guided']} simulator runs on average against {DESIGNER['mean_runs_plain']} for plain bisection ({DESIGNER['fewer_runs_share']:.0%} fewer); same feasibility verdict on {DESIGNER['same_feasibility_verdict']} of {DESIGNER['goals']}; median dose difference {DESIGNER['median_dose_difference']:.0%} |
| Live copilot | {COPILOT['model']} on NVIDIA NIM plans tool calls and explains results, in the public site through a key-hiding proxy | On {COPILOT['questions']} project-written questions: {COPILOT['answered_by_model']} answered by the model, {COPILOT['written_by_code']} written by code, right tool on {COPILOT['right_tool']} of {COPILOT['questions']}, guard repaired {COPILOT['guard_repair_accepted']} and replaced {COPILOT['guard_replaced_a_reply']}, median {COPILOT['median_seconds']} s. A small sample |
| Vector database and retrieval | PostgreSQL with pgvector, compiled to WebAssembly by PGlite, running in the visitor's browser, with no server or account ({VECTOR_DB['database']}, pgvector {VECTOR_DB['pgvector']}). It holds embeddings of {HELD_OUT['notes']} notes written for this project (nvidia/nemotron-3-embed-1b, saved in the repo), and the question is embedded through the proxy only after the guard clears it. numpy is the fallback, then TF-IDF. The model may use only the notes found, and code then checks that its wording came from them | On {HELD_OUT['answerable']} blind, held-out questions, scored once: right note in the top 3 {HELD_OUT['hit_at_3']:.1%}, top 1 {HELD_OUT['hit_at_1']:.1%}. {HELD_OUT['after_safety_fix']['answerable_declined']} of those were still declined, after a later safety fix. None of {HELD_OUT['must_refuse']} must-refuse messages reached a model. Scored with numpy; the database returned the same notes on {VECTOR_DB['same_notes_as_numpy']} of {VECTOR_DB['questions']} questions, median query {VECTOR_DB['median_query_ms']} ms under Node. The first blind list scored {FIRST_RUN['hit_at_3']:.1%} on TF-IDF alone, which is why embeddings were added; that list was then used for tuning |
| Safety guard | Default-deny on input, and a digit figure no tool produced sends the draft back to the model once, then falls back to computed text | {COPILOT['attack_prompts_refused_before_any_model']} of {COPILOT['attack_prompts']} project-written attack prompts refused before any model call. Blind results are in the section below |
| Intent model | TF-IDF and logistic regression for greetings and help, runs in the browser, cannot write a number | {INTENT['held_out_accuracy']:.1%} on {INTENT['held_out_phrases']} project-written phrases, a small sample |
| Blind-test track record | Shows beside each simulated result where that drug held up or missed in the blind test | Added after the blind run; a look-up that changes no prediction |
"""

README = f"""# MedBase Virtual Trials Lab

Run a type 2 diabetes drug trial on your laptop, then see how far to trust it.

An applied AI lab that simulates randomised drug trials in virtual patients built from real public health survey data, and that tells you where it has been wrong. The simulator runs in your browser with no server, and a live AI copilot calls NVIDIA through a small proxy. It was fitted on three real trials, frozen, and then tested blind on real trials it had not seen.

{headline} {verdict}


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

{ai_rows}
The rule across all of them: **models propose and explain, the simulator computes.** Efficacy numbers come from the simulator, and digit figures in a model's reply are checked against tool output. Questions about the blind test, and study designs, are answered in text written by code, because a paraphrase got the lab's own failures wrong in testing and a design must not read as a dose. Code also appends the validation status, warnings and blind-test record to every efficacy reply, so none can be dropped.

## How we attacked our own safety guard

A rule-based guard runs before any model. Only a question with a research frame reaches a simulation or a language model. A personal question is refused, a message that looks urgent gets emergency contacts, and every simulation or safety answer ends by saying where help is. We tested it adversarially and report what we found, because the first versions failed badly.

| Test | Personal messages reaching a simulation | Urgent messages missing the emergency reply | Research questions refused |
|---|---|---|---|
| First attack, written after reading the rules | {ATTACK['wrong_class'][0]} of {ATTACK['wrong_class'][1]} wrong class, {ATTACK['returned_a_trial_number']} got a trial number | | |
| First blind run: inputs written before seeing the code | {frac(BLIND_1['personal'])} personal, {frac(BLIND_1['wrapped'])} disguised | {frac(BLIND_1['urgent_not_emergency'])} | {frac(BLIND_1['legit_refused'])} |
| Second blind run, aimed at terse messages | {frac(BLIND_2['personal'])} | {frac(BLIND_2['urgent_not_emergency'])}, {BLIND_2['urgent_with_no_112']} with no emergency number | {frac(BLIND_2['legit_refused'])} |
| Shipped guard, re-measured on those same lists: **tuned on them, so not held out** | {frac(SHIPPED['personal_reaching_a_simulation'])} | {frac(SHIPPED['urgent_not_given_the_emergency_reply'])}, {frac(SHIPPED['urgent_with_no_112_in_the_reply'])} with no emergency number | {frac(SHIPPED['legit_refused'])} |

The last row is the current state but it is optimistic, and no blind test has been run on the final version. These lists are hard on purpose and written by one author, so they are not a real-traffic rate. Treat this as a guard for a supervised research demo, not an unattended public service.

Known limits:

- General-knowledge answers come from the language model, as the copilot's "How this answers" section says, and carry no badge on the answer itself. Code removes doses and drug effects it can't source and refuses care advice, but other statements can be wrong.
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
| Prediction accuracy | Mean error up to 0.25 points, at least 70% within 0.30 | {word(S['V3_pass'])}: mean error {S['mae']}, {S['within_0_30']:.0%} within 0.30 |
| Interval coverage | At least 85% inside the 95% interval | {word(S['V4_pass'])}: {S['coverage_95pi']:.0%} |
| Kidney effect, never fitted | Weaker at low eGFR, each stratum within 0.30 | {word(S['V5_pass'])}: mild {MILD['predicted']:+.2f} vs {MILD['observed']:+.2f} observed; moderate {MOD['predicted']:+.2f} vs {MOD['observed']:+.2f} observed |
| Beat a rival with no physiology | Whole 95% interval of the error difference below zero | {word(S['beats_null'])}: mean error {S['mae']} vs rival {S['null_mae']}, difference {S['model_minus_null_mae']:+} (95% CI {S['model_minus_null_ci95'][0]:+} to {S['model_minus_null_ci95'][1]:+}) |

Accuracy held up in {HELD_UP}. It missed in the 12-week semaglutide dose-ranging trial, where it over-predicted benefit, and in the metformin arms of the factorial trial, where it under-predicted. Across all results the physiology did not clearly beat carrying effects forward, so read simulated numbers as a way to think about a study, not as forecasts. {"Markov chains met the convergence gate." if V['converged'] else "The calibration chain did not meet the convergence gate, so treat its intervals with extra caution."}

## Security

No accounts and no key in the browser. The AI proxy accepts only the lab's own prompts and tools, a Content Security Policy covers the page, and `scripts/security_check.py` scans for leaked keys and vulnerable packages. Threat model and known limits: [docs/SECURITY.md](docs/SECURITY.md).

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

Latest test run: {tests}.

## Credits

Built on MedBase by Team Aegis. Data, methods and software sources are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Repositories considered and rejected, with reasons, are in [docs/REPO_SURVEY.md](docs/REPO_SURVEY.md).
"""

FORM = f"""# INFINEX 2K26 submission text

Paste into the Unstop form. The demo link shows this work only after the site is redeployed. Add the video or deck link last.

**Project title:** MedBase Virtual Trials Lab

**Problem statement:**
Drug trials cost years and enormous sums, yet students and early researchers have no accessible way to explore how a study would behave before it exists. Most open diabetes simulators cover type 1 only, and many health AI tools give confident answers with no way to check them.

**Solution description:**
An applied AI lab that runs type 2 diabetes drug trials on virtual patients built from real NHANES health survey data, with the simulator running in the browser. Bayesian calibration learns drug effects from three real trials. A neural surrogate trained on {SURROGATE['runs_used']} simulator runs powers instant what-if sliders and guides an AI Trial Designer, which used {DESIGNER['fewer_runs_share']:.0%} fewer simulator runs than plain search on {DESIGNER['goals']} test goals. A live AI copilot on NVIDIA NIM plans experiments from plain English. Models propose and explain, and the simulator computes: a digit figure in an AI reply that no tool produced sends the reply back, and study designs are written by code so they cannot read as a dose.

We tested it the hard way, freezing and publishing predictions before opening the real results. {headline} {verdict} Those failures stay visible: each simulated result shows where that drug held up or missed in the blind test.

We also attacked our own safety guard with blind tests and published the results, including where it failed. It gives no dosing guidance, and refuses personal treatment questions.

**Key features:**
- AI Trial Designer: a neural surrogate proposes, the simulator checks, and every step is shown
- A conversational AI copilot: it explains ideas in its own words, follows up on "why?" and "explain more", and runs real simulations when asked about a drug's effect
- Visible tool calls, a number guard and a personal-advice refusal on every answer
- Instant neural what-if sliders, raced live against the full simulator
- Animated chart moving each frozen prediction to the real trial result
- A real vector database, PostgreSQL with pgvector, running in the visitor's browser with no server or account
- Ordinary questions answered from it, with the notes, match scores and live query time shown, and code checking that the wording came from them
- Follow-ups such as "what about 2 mg?" that carry the last experiment forward, and suggested next questions
- A live trace of each answer: guard, vector search, simulator, model and checks
- Blind-test track record beside every simulated result, including misses
- Security measures: an AI proxy locked to the lab's own prompts, a Content Security Policy, and repeatable key and dependency scans
- Safety guard tested blind by adversaries, with urgent messages given emergency contacts, published in the README
- Virtual trials for four real drugs and hypothetical molecules, on patients built from real survey labs
- 3D body view from the Human Reference Atlas, driven by simulated values
- Public proof page with every prediction, a rival model, and each failed check
- The simulator runs in the browser with no server, so it scales at the cost of static hosting

**Technology stack:**
Python, NumPy, SciPy, scikit-learn, statsmodels, emcee (Bayesian MCMC), neural surrogate (MLP), {COPILOT['model']} on NVIDIA NIM, Pyodide, React 19, TypeScript, Vite, Tailwind, three.js. Hosting: Hugging Face static Space, Vercel serverless proxy. Data: NHANES, ClinicalTrials.gov, openFDA labels, BioModels, Human Reference Atlas.

**GitHub repository:** https://github.com/shreynachaegari-glitch/medbase-virtual-trials-lab

**Working demo:** https://zade06079-medbase-virtual-trials-lab.static.hf.space

**Demo video or presentation:** (add after recording)
"""

VIDEO = f"""# Demo video script (under 3 minutes)

Audience: INFINEX judges, Applied AI track. Show the live screen throughout.

| Time | Screen | Say |
|---|---|---|
| 0:00 | First screen | "Trials take years. What if a student could rehearse one this afternoon, in a browser, and see how far to trust the answer?" |
| 0:15 | Copilot: "Compare semaglutide 1 mg and empagliflozin 25 mg over 30 weeks", after a quick "What is semaglutide?" | "I just ask. Ordinary questions are answered from a pgvector database running right here in the browser, and you can see which notes it used. A live AI model on NVIDIA plans the experiment, and you can watch it call the tools. It runs on virtual patients built from real health survey data. If a figure in its reply didn't come from the simulator, the reply goes back or gets replaced." |
| 0:50 | Copilot: "Should I stop my metformin?" | "And ask about your own medicine, and it refuses before any AI model is called." |
| 1:00 | AI Trial Designer: empagliflozin, 0.5 point target | "Now I give it a goal. A neural network trained on {SURROGATE['runs_used']} simulator runs screens {400} doses in milliseconds and proposes where to look. The simulator checks that and sizes the study. On {DESIGNER['goals']} test goals that took {DESIGNER['fewer_runs_share']:.0%} fewer simulator runs than plain search. This is a test dose in a simulator, not a dose for anyone, and it shows what the blind test found at that dose." |
| 1:30 | Surrogate sliders, then run full simulator | "The same network answers these sliders instantly. Watch them race: same question, both timed live in this browser." |
| 1:50 | Prediction meets reality chart | "Here's the part I care about most. We froze and published every prediction, then opened 20 real results once. Mean error {S['mae']} points. Empagliflozin and the kidney strata held up. The 12-week semaglutide trial missed, and so did the metformin arms. {verdict}" |
| 2:20 | Trial result with the track record card | "So those misses stay on screen. Every result tells you where that drug held up in the blind test and where it missed. Most AI tools hide that." |
| 2:40 | See it in the body | "And here's what the simulator says is happening, organ by organ." |
| 2:50 | Title | "MedBase Virtual Trials Lab: rehearse a trial, and see how far to trust it." |
"""
Path("README.md").write_text(README)
Path("docs/submission/UNSTOP_FORM.md").write_text(FORM)
Path("docs/submission/VIDEO_SCRIPT.md").write_text(VIDEO)
print(headline, verdict)
