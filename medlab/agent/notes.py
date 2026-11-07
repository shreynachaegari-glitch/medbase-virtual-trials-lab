"""General notes the copilot can retrieve: diabetes basics, how trials work, and how this lab uses AI.

Written for this project, not clinically reviewed. They explain ideas and never say what anyone should take.
"""
from __future__ import annotations

MODEL_NAME = "nvidia/nemotron-3.5-lightning-30b-a3b"

BASICS = (
    ("Insulin resistance", "Insulin resistance means the body's cells respond less to insulin, so more insulin is needed to move glucose out of the blood. It is a central feature of type 2 diabetes."),
    ("Type 1 and type 2 diabetes", "In type 1 diabetes the immune system destroys the insulin-making cells, so the body makes little or no insulin. In type 2 diabetes the body responds poorly to insulin and the pancreas cannot keep up. Type 2 is far more common, and it is the only type this lab simulates."),
    ("Treating type 2 diabetes", "Treatment of type 2 diabetes commonly combines diet and physical activity with medicines such as metformin, GLP-1 receptor agonists, SGLT2 inhibitors, DPP-4 inhibitors, sulfonylureas or insulin. The right choice for a person belongs with their doctor, and this lab cannot make it."),
    ("Obesity and BMI", "Obesity means excess body fat that raises health risks. It is usually screened with body mass index, BMI, which is weight in kilograms divided by height in metres squared. Excess weight is a major risk factor for insulin resistance and type 2 diabetes."),
    ("Chronic kidney disease", "Chronic kidney disease, CKD, is a long-term loss of kidney function, often graded by eGFR. Diabetes is a leading cause. This lab can set a study population's kidney function, which matters most for SGLT2 inhibitors."),
    ("Pancreas", "The pancreas makes insulin and glucagon, two hormones that control blood glucose. In type 2 diabetes its insulin-making beta cells cannot keep up with the body's need."),
    ("Liver and glucose", "The liver stores glucose and releases it into the blood, especially between meals. In type 2 diabetes it tends to release too much, which is the main process metformin acts on."),
    ("Blood glucose", "Blood glucose is the sugar carried in the blood. Fasting plasma glucose measures it at one moment after not eating, while HbA1c reflects the average over about two to three months."),
)

TRIALS = (
    ("Trial phases", "Clinical trials run in phases. Phase 1 tests safety and dosing in a small group. Phase 2 looks for an effect and a suitable dose. Phase 3 compares the treatment with a standard or placebo in a large group. Phase 4 follows it after approval."),
    ("Blinding", "Blinding, or masking, means people in a trial, and often the staff, do not know who receives which treatment, so expectations cannot sway the results. In a double-blind trial neither knows. It differs from this lab's blind test, which sealed real results away from the model."),
    ("Control group", "A control group receives a placebo or a standard treatment instead of the treatment being tested. Comparing against it shows what the treatment itself added."),
    ("Sample size", "Sample size is how many people a trial enrols. Larger trials can detect smaller effects but cost more. It is normally set in advance to reach a chosen statistical power, and this lab can estimate it by simulation."),
    ("Endpoint", "An endpoint is the outcome a trial measures to judge a treatment. The primary endpoint is the main one the trial is designed around. In diabetes trials it is usually the change in HbA1c."),
    ("ANCOVA", "ANCOVA, analysis of covariance, compares groups while adjusting for a baseline measurement. In a diabetes trial that means comparing the final HbA1c between arms after accounting for each person's starting HbA1c, which makes the estimate more precise."),
    ("Entropy balancing", "Entropy balancing reweights a group of people so its averages match a target, such as a trial's published baseline table, while changing the weights as little as possible. This lab uses it to match virtual patients to each study's population."),
    ("Intention to treat", "Intention to treat analyses people in the group they were randomised to, even if they stopped treatment. It protects the fairness that randomisation created."),
    ("Adverse event", "An adverse event, AE, is any unwanted medical occurrence during a trial, whether or not the treatment caused it. A serious adverse event, SAE, is one that is life-threatening or leads to hospital care. This lab does not simulate them: its safety tab shows what real trials and FDA labels reported."),
    ("Trial time and cost", "Large trials commonly run for months to years and can cost millions, which is why researchers plan them carefully. A simulator lets someone explore a design first, but it does not replace running the trial."),
)

AI_STACK = (
    ("Applied AI in this lab", "This lab applies AI in layers. Bayesian MCMC calibrates drug effects on real trials and keeps the uncertainty. A neural surrogate gives instant answers and guides the trial designer. A language model turns plain English into experiments and calls the simulator's tools. Vector search grounds answers to ordinary questions in notes. A rule-based guard sits in front of all of it, and the simulator computes every number."),
    ("How the copilot works", "The copilot first passes each question through a rule-based guard. Ordinary questions go to vector search, and a language model answers only from the notes found. Experiment questions go to a language model that chooses simulator tools. Code then checks every figure in the reply against what the tools returned, and sends back or replaces anything it cannot match."),
    ("AI model used", f"The copilot's language model is {MODEL_NAME}, an NVIDIA Nemotron model served through NVIDIA NIM. A small proxy holds the API key, so no key is in the browser. If the service is unavailable, a rule-based offline planner answers instead."),
    ("RAG", "RAG means retrieval-augmented generation: find relevant text first, then have a language model answer only from it, so it does not rely on memory. Here the copilot retrieves up to three notes by vector search and shows which ones it used."),
    ("Vector search", "A vector database stores text as lists of numbers so that similar text can be found by distance. This lab runs a real one in your browser: PostgreSQL with the pgvector extension, compiled to WebAssembly by PGlite, so it needs no server or account. The notes are embedded with an NVIDIA model, and a question's embedding is compared with them by cosine distance. If it cannot load, numpy does the same calculation, and if embeddings are unavailable, keyword vectors are used."),
    ("Pyodide", "Pyodide is Python compiled to WebAssembly so it can run in a browser. It lets this lab run its real Python simulator on the visitor's device, with no simulation server."),
    ("AI Trial Designer", "The AI Trial Designer takes a goal, such as a 0.5 point HbA1c effect, and searches for a dose and study size. The neural surrogate proposes a starting dose, the simulator checks it, and the report says how close the blind test came near that dose. The result is a simulated test dose, not dosing guidance."),
    ("Validation checks", "The blind test had four pre-registered checks. V3 asked for a mean error of at most 0.25 HbA1c points with at least 70% of results within 0.30. V4 asked for 95% intervals that cover at least 85% of results. V5 tested the weakening of empagliflozin with falling kidney function. V6 asked it to beat a simple rival with no physiology."),
    ("Data sources", "Virtual patients come from de-identified NHANES survey labs from 2013 to 2020. Drug effects are fitted to published results of real trials, and the blind test used other real trials from ClinicalTrials.gov. Reported side effects come from real trials and FDA labels."),
    ("Privacy", "The simulator runs in your browser and the site has no accounts. Questions that need the language model pass through a proxy to NVIDIA NIM. The proxy keeps no record of them, but the lab does not control what a provider keeps, so please do not type personal or health details."),
    ("Working offline", "After the first load the simulator, sliders and rule-based planner run on your device. The language model needs a network, and if it cannot be reached the offline planner answers instead."),
    ("Clinical status", "This lab has not been clinically validated, reviewed by clinicians or approved by any regulator. It is a research and education tool, and it cannot guide anyone's treatment."),
    ("Who made this project", "MedBase Virtual Trials Lab was made and built as an entry in the Applied AI track of INFINEX 2K26, a project competition. It shows how to combine models with a simulator and an honest test of how far to trust the result."),
)

ALL_NOTES = BASICS + TRIALS + AI_STACK

# How people ask for a note, in their own words. Embedded with the note, so a question finds it by meaning, and never shown.
ASKED_AS = {
    "Privacy": "Do you store what I type? Is my data saved or shared? Who can see my questions? Is this private?",
    "This lab": "What is this website? What does this site do? What am I looking at? What is this project about?",
    "Copilot": "What can the chat assistant help with? What is this chatbot for? What can I ask it?",
    "How the copilot works": "What happens after I type a question? How does the chatbot answer? Walk me through a question.",
    "Applied AI in this lab": "Where is the AI in this project? Is it just a buzzword? What machine learning does it use?",
    "AI model used": "Which LLM runs behind this? What language model is it? Is it ChatGPT?",
    "Using the lab": "How do I start? How do I run a simulation here? Where do I begin? How do I use this?",
    "Limits": "What are the weak points of this tool? What can't it do? What should I not trust it for?",
    "Safety guard": "Why won't it give dosing advice? How does it decide to refuse? What does it block?",
    "Blind test": "How do you know it works on trials it never saw? How was it tested? Was it validated?",
    "Blind test result": "How accurate was it? What were the numbers? Did it pass? Where did it fail?",
    "Rival": "What did you benchmark it against? What is the baseline model? Does it beat something simple?",
    "Data sources": "What data was this built from? Which papers and datasets? Where do the numbers come from?",
    "Validation checks": "What sanity checks confirm the results? How do you know the results aren't garbage? What are V3 to V6?",
    "AI Trial Designer": "Can I describe a study and have it set up for me? Can AI plan a trial? How do I find the right dose for a study?",
    "Who made this project": "Who built this? Who is behind this site? What competition is this for?",
    "Vector search": "How do embeddings find the right passage? How does the search work? Is there a vector database?",
    "Trial analysis": "How are results compared between arms? How is a simulated trial analysed?",
    "Placebo": "The sugar pill in studies. Why do people improve on a dummy treatment?",
    "Intention to treat": "If someone drops out midway do they still count? What about people who quit a trial?",
    "Curve fit": "Is this just fitting a line through old results? Why not just use past trial averages?",
    "Inclusion criteria": "Who gets let into a study and who is kept out?",
    "Obesity and BMI": "How is weight linked to diabetes?",
}

