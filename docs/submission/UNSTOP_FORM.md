# INFINEX 2K26 submission text

Paste into the Unstop form. The demo link shows this work only after the site is redeployed. Add the video or deck link last.

**Project title:** MedBase Virtual Trials Lab

**Problem statement:**
Drug trials cost years and enormous sums, yet students and early researchers have no accessible way to explore how a study would behave before it exists. Most open diabetes simulators cover type 1 only, and many health AI tools give confident answers with no way to check them.

**Solution description:**
An applied AI lab that runs type 2 diabetes drug trials on virtual patients built from real NHANES health survey data, with the simulator running in the browser. Bayesian calibration learns drug effects from three real trials. A neural surrogate trained on 2400 simulator runs powers instant what-if sliders and guides an AI Trial Designer, which used 46% fewer simulator runs than plain search on 36 test goals. A live AI copilot on NVIDIA NIM plans experiments from plain English. Models propose and explain, and the simulator computes: a digit figure in an AI reply that no tool produced sends the reply back, and study designs are written by code so they cannot read as a dose.

We tested it the hard way, freezing and publishing predictions before opening the real results. On 20 results from 6 real trials it never saw, predicted HbA1c effects were off by 0.29 points on average, and 50% landed within 0.30 points of what the trial reported. Passed: interval coverage, kidney effect size. Failed, and reported as failures: prediction accuracy, beating a simple rival with no physiology. Those failures stay visible: each simulated result shows where that drug held up or missed in the blind test.

We also attacked our own safety guard with blind tests and published the results, including where it failed. It is for research and education only. It is not medical advice, gives no dosing guidance, and refuses personal treatment questions.

**Key features:**
- AI Trial Designer: a neural surrogate proposes, the simulator checks, and every step is shown
- Live AI copilot with visible tool calls, a number guard and a personal-advice refusal
- Instant neural what-if sliders that one click checks against the full simulator
- Blind-test track record beside every simulated result, including misses
- Safety guard tested blind by adversaries, with urgent messages given emergency contacts, published in the README
- Virtual trials for four real drugs and hypothetical molecules, on patients built from real survey labs
- 3D body view from the Human Reference Atlas, driven by simulated values
- Public proof page with every prediction, a rival model, and each failed check
- The simulator runs in the browser with no server, so it scales at the cost of static hosting

**Technology stack:**
Python, NumPy, SciPy, scikit-learn, statsmodels, emcee (Bayesian MCMC), neural surrogate (MLP), nvidia/nemotron-3.5-lightning-30b-a3b on NVIDIA NIM, Pyodide, React 19, TypeScript, Vite, Tailwind, three.js. Hosting: Hugging Face static Space, Vercel serverless proxy. Data: NHANES, ClinicalTrials.gov, openFDA labels, BioModels, Human Reference Atlas.

**GitHub repository:** https://github.com/shreynachaegari-glitch/medbase-virtual-trials-lab

**Working demo:** https://zade06079-medbase-virtual-trials-lab.static.hf.space

**Demo video or presentation:** (add after recording)
