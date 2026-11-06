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
PASSED = [k for k in ("V3_pass", "V4_pass", "V5_pass") if S[k]]
FAILED = [k for k in ("V3_pass", "V4_pass", "V5_pass") if not S[k]]
NAMES = {"V3_pass": "prediction accuracy", "V4_pass": "interval coverage", "V5_pass": "kidney effect prediction"}
word = lambda ok: "Pass" if ok else "Fail"  # noqa: E731
tests = subprocess.run([sys.executable, "-m", "pytest", "-q"], capture_output=True, text=True).stdout.strip().splitlines()[-1]
n_trials = len({r["trial"].replace(" mild", "").replace(" moderate", "") for r in V["contrasts"]})
headline = (f"On {S['n_contrasts']} results from {n_trials} real trials it never saw, predicted HbA1c effects were off by {S['mae']} points on average, "
            f"and {S['within_0_30']:.0%} landed within 0.30 points of what the trial reported.")
verdict = ("All three pre-registered held-out checks passed." if not FAILED
           else "Pre-registered checks that did not pass: " + ", ".join(NAMES[k] for k in FAILED) + ". We report these as failures.")

README = f"""# MedBase Virtual Trials Lab

Run a type 2 diabetes drug trial on your laptop, then see how far to trust it.

MedBase Virtual Trials Lab simulates randomised drug trials in virtual patients built from real public health survey data. It was fitted on three real trials and then tested on real trials it had not seen.

{headline} {verdict}

> Research and education only. This is not medical advice and cannot show that a treatment works for any person. It offers no dosing guidance.

## What you can do

| Feature | What it does |
|---|---|
| AI Trial Designer | Give it a goal. It searches for the lowest dose reaching that effect and the smallest study that can detect it, showing each step. |
| Virtual trial | Compare semaglutide, empagliflozin, sitagliptin, metformin or a hypothetical molecule against placebo. |
| Proof | Every held-out prediction against the real result, including misses. |
| Who responds | Runs the same virtual patient on drug and placebo, and summarises which traits drive benefit in the model. |
| Power | How many patients a study needs. |
| Disease progression | The published Ha, Satin and Sherman 2016 model of how type 2 diabetes develops and can reverse. |
| Safety | Adverse events as reported in real trials, kept apart from simulated numbers. |
| Lab Assistant | Ask in plain English. It runs the tools, and its numbers are checked against their output. |

## Where the AI is, and where it is not

```
NHANES labs ──> digital twins ──> trial enrolment ──> simulator ──> trial statistics
Registry results ──> Bayesian calibration ──────────────^               │
Goal ──> AI Trial Designer (search over the simulator) ─────────────────┤
Question ──> Lab Assistant (plans tool calls, explains) ────────────────┘
                 number guard: unsourced figures are blocked
```

- **Bayesian calibration** (emcee) estimates drug effects from registry results, and carries that uncertainty into every prediction.
- **AI Trial Designer** is an automated search that uses the simulator to evaluate each candidate design.
- **Lab Assistant** plans and explains. It cannot produce an efficacy number: any figure missing from tool output blocks the reply, which is replaced with computed text. It refuses personal treatment questions before any model is called.

It runs with Claude (`ANTHROPIC_API_KEY`), NVIDIA NIM (`NVIDIA_API_KEY`), or an offline planner when no key is set.

## How it works

- **Patients:** real NHANES 2017-March 2020 adults with diabetes, not on insulin. Each person's labs are converted to their own model parameters.
- **Physiology:** Topp 2000 glucose and insulin dynamics, ADAG for HbA1c, and a renal filtration model.
- **Drugs act through mechanisms:** liver glucose output, insulin secretion, renal threshold, weight. Combinations work through physiology, and are not added together as fixed HbA1c shifts.
- **Trials:** real eligibility limits, baseline matching by entropy balancing, randomisation, dropout, assay noise, ANCOVA.

## Validation

Parameters were frozen before any held-out outcome was opened. Full table: [docs/VALIDATION.md](docs/VALIDATION.md).

| Check | Pass mark | Result |
|---|---|---|
| Prediction accuracy | Mean error up to 0.25 points, at least 70% within 0.30 | {word(S['V3_pass'])}: mean error {S['mae']}, {S['within_0_30']:.0%} within 0.30 |
| Interval coverage | At least 85% inside the 95% interval | {word(S['V4_pass'])}: {S['coverage_95pi']:.0%} |
| Kidney effect, never fitted | Weaker at low eGFR, each stratum within 0.30 | {word(S['V5_pass'])}: mild {MILD['predicted']:+.2f} vs {MILD['observed']:+.2f} observed; moderate {MOD['predicted']:+.2f} vs {MOD['observed']:+.2f} observed |

A simple rival with no physiology, carrying training-trial effects forward by drug and dose, scored a mean error of {S['null_mae']}. {"The model beat it" if S['beats_null'] else "The model did not clearly beat it"} (difference {S['model_minus_null_mae']:+}, 95% CI {S['model_minus_null_ci95'][0]:+} to {S['model_minus_null_ci95'][1]:+}). {"Markov chains met the convergence gate." if V['converged'] else "The calibration chain did not meet the convergence gate, so treat its intervals with extra caution."}

## Limits

- This predicts average HbA1c effects in trial populations. It says nothing about an individual.
- Cardiovascular and kidney outcomes, intraday glucose curves, sulfonylureas and insulin are not modelled.
- NHANES is a US survey with small eligible pools for some trials (see effective sample sizes in the validation report). It is not an Indian cohort.
- Registry results are sponsor-submitted.
- Hypothetical molecules reflect the numbers you enter. They are not predictions about any real compound.

## Run it

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.lock && pip install -e '.[dev]'
python scripts/fetch_data.py
pytest
uvicorn medlab.api:app --port 8000      # API
cd web && npm ci && npm run dev         # UI, opens on /trials
```

Or with one container: `podman build -t medbase-lab . && podman run -p 7860:7860 medbase-lab`.

Latest test run: {tests}.

## Credits

Built on MedBase by Team Aegis. Data, methods and software sources are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Repositories considered and rejected, with reasons, are in [docs/REPO_SURVEY.md](docs/REPO_SURVEY.md).
"""

FORM = f"""# INFINEX 2K26 submission text

Paste into the Unstop form. Fill the three links after publishing.

**Project title:** MedBase Virtual Trials Lab

**Problem statement:**
Drug trials cost years and enormous sums, yet students and early researchers have no accessible way to explore how a study would behave before it exists. Most open diabetes simulators cover type 1 only, and many health AI tools produce confident answers with no way to check them.

**Solution description:**
An applied AI lab that runs type 2 diabetes drug trials on virtual patients built from real NHANES health survey data. Bayesian calibration learns drug effects from three real trials. An AI Trial Designer searches for the lowest dose and smallest study that meet a goal, and a Lab Assistant runs experiments from plain English. Every efficacy number comes from the simulator, and any unsourced number in an AI reply is blocked.

We tested it the hard way: parameters were frozen before held-out results were opened. {headline} {verdict}

It is for research and education, and it refuses personal treatment questions.

**Key features:**
- AI Trial Designer that shows every step of its search
- Virtual trials for four real drugs and hypothetical molecules
- Patients built from real survey labs, not invented distributions
- Public proof page showing every prediction, including misses
- Kidney effect that follows from renal physiology and is tested on a trial it never saw
- Published disease progression model
- Reported adverse events shown apart from simulated results
- Lab Assistant with a number guard and a personal-advice refusal

**Technology stack:**
Python, NumPy, SciPy, scikit-learn, statsmodels, emcee, FastAPI, Claude API or NVIDIA NIM, React 19, TypeScript, Vite, Tailwind, Docker. Data: NHANES, ClinicalTrials.gov, openFDA labels, BioModels.

**GitHub repository:** (add after publishing)

**Working demo:** (add after deploying)

**Demo video or presentation:** (add after recording)
"""

VIDEO = f"""# Demo video script (under 3 minutes)

Audience: INFINEX judges, Applied AI track. Show the live screen throughout.

| Time | Screen | Say |
|---|---|---|
| 0:00 | /trials hero | "Trials take years. What if a student could rehearse one this afternoon, and also see how far to trust the answer?" |
| 0:15 | Hero proof strip | "This is MedBase Virtual Trials Lab. The virtual patients come from real US health survey data. {headline}" |
| 0:40 | AI Trial Designer: empagliflozin, 0.5 point target | "I give the AI a goal. It tries doses, narrows them down, then works out how many patients the study needs. Every step here came from the simulator." |
| 1:10 | Trial results | "Here's that trial against placebo, with intervals that carry the uncertainty from calibration." |
| 1:30 | Kidney preset | "This is my favourite test. Nobody told the model that this drug weakens in kidney disease. It follows from filtration physics. We checked it on a trial it had never seen: {MOD['predicted']:+.2f} predicted, {MOD['observed']:+.2f} observed in moderate kidney disease." |
| 1:55 | Proof tab | "Here's every prediction against the real result, with the misses left in. {verdict}" |
| 2:15 | Assistant: compare drugs, then "should I stop my metformin?" | "Ask in plain English and it runs the experiment. Any number that didn't come from a tool gets blocked. And ask about your own medicine, and it refuses before any AI model is called." |
| 2:35 | Who responds, then limits section | "It can suggest who benefits in the model, and it says plainly that this is a hypothesis. It doesn't replace trials. It helps people think before one begins." |
| 2:50 | Title | "MedBase Virtual Trials Lab." |
"""
Path("README.md").write_text(README)
Path("docs/submission/UNSTOP_FORM.md").write_text(FORM)
Path("docs/submission/VIDEO_SCRIPT.md").write_text(VIDEO)
print(headline, verdict)
