// Writes docs/submission/MedBase_Virtual_Trials_Lab.pptx. Every figure is read from results/, so the deck cannot disagree with them.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const root = path.resolve(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "results", f), "utf8"));
const V = read("validation.json");
const S = V.score;
const SUR = read("surrogate_eval.json");
const DES = read("designer_eval.json").summary;
const COP = read("copilot_eval.json").summary;
const RET = read("retrieval_eval.json").held_out;
const POST = read("posterior.json");
const GUARD = read("guard_eval.json");
const SHIP = GUARD.shipped_guard;
const [B1, B2] = GUARD.blind_runs;
const DEMO = "https://zade06079-medbase-virtual-trials-lab.static.hf.space";
const VDB = read("vector_db_eval.json");
const of = (pair) => `${pair[0]} of ${pair[1]}`;
const shot = (f) => path.join(root, "results/screens/release", f);

const C = { bg: "0B0C0E", card: "17191D", line: "2A2D33", text: "F4F4F5", muted: "A7ABB3", accent: "F2B84B", pass: "4ADE9A", fail: "FB7185", model: "F2B84B", rival: "6B7280" };
const HEAD = "Cambria";
const BODY = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "MedBase Virtual Trials Lab";
pres.author = "Sreyesh Kumar Nachaegari";

const slide = (title, notes) => {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  if (title) s.addText(title, { x: 0.6, y: 0.4, w: 12.1, h: 1.15, fontFace: HEAD, fontSize: 32, bold: true, color: C.text, margin: 0, valign: "top" });
  if (notes) s.addNotes(notes);
  return s;
};
const card = (s, x, y, w, h) => s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: C.card }, line: { color: C.line, width: 0.75 } });
const picture = (s, file, x, y, w, h, cropH = 1) => {
  // Screenshots are 1440 x 1000; crop from the top rather than squash.
  const fullH = w * (1000 / 1440);
  s.addImage({ path: shot(file), x, y, w, h, sizing: { type: "crop", w, h: Math.min(h, fullH * cropH), x: 0, y: 0 } });
  s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: "000000", transparency: 100 }, line: { color: C.line, width: 0.75 } });
};
// A crop already at the right shape, so it fills its frame without distortion.
const framed = (s, file, x, y, w, h) => {
  s.addImage({ path: shot(file), x, y, w, h });
  s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: "000000", transparency: 100 }, line: { color: C.line, width: 0.75 } });
};
const stat = (s, x, y, w, big, label, color = C.accent) => {
  s.addText(big, { x, y, w, h: 0.85, fontFace: HEAD, fontSize: 40, bold: true, color, margin: 0 });
  s.addText(label, { x, y: y + 0.85, w, h: 0.75, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "top" });
};

// 1. Title
{
  const s = slide(null, "Open with the idea: rehearse a trial in a browser, and see how far to trust the answer. The link on this slide is the live site.");
  s.addText("INFINEX 2K26  |  APPLIED AI", { x: 0.6, y: 0.75, w: 6, h: 0.35, fontFace: BODY, fontSize: 13, bold: true, color: C.accent, charSpacing: 2, margin: 0 });
  s.addText("MedBase Virtual Trials Lab", { x: 0.6, y: 1.25, w: 5.8, h: 2.0, fontFace: HEAD, fontSize: 46, bold: true, color: C.text, margin: 0, valign: "top" });
  s.addText("Rehearse a type 2 diabetes drug trial in your browser, then see how far to trust it.", { x: 0.6, y: 3.45, w: 5.4, h: 1.2, fontFace: BODY, fontSize: 20, color: C.muted, margin: 0, valign: "top" });
  s.addText([
    { text: "Try it live", options: { color: C.accent, bold: true, breakLine: true } },
    { text: DEMO, options: { color: C.text, hyperlink: { url: DEMO } } },
  ], { x: 0.6, y: 5.0, w: 5.8, h: 0.8, fontFace: BODY, fontSize: 14, margin: 0, valign: "top" });
  picture(s, "first-screen.png", 6.7, 0.75, 6.05, 4.2);
  picture(s, "body-view.png", 8.95, 4.3, 3.8, 2.64);
}

// 2. Problem
{
  const s = slide("Students can't rehearse a trial, and much health AI can't show where it went wrong", "Two gaps. No accessible way to explore a study before it exists. And confident health AI answers with no way to check them.");
  card(s, 0.6, 1.85, 5.85, 3.0);
  s.addText("The rehearsal gap", { x: 0.9, y: 2.15, w: 5.25, h: 0.45, fontFace: HEAD, fontSize: 22, bold: true, color: C.accent, margin: 0 });
  s.addText("Drug trials cost years and enormous sums. Students and early researchers have no accessible way to explore how a study would behave before it exists, and most open diabetes simulators cover type 1 only.", { x: 0.9, y: 2.7, w: 5.25, h: 2.0, fontFace: BODY, fontSize: 18, color: C.text, margin: 0, valign: "top" });
  card(s, 6.85, 1.85, 5.85, 3.0);
  s.addText("The trust gap", { x: 7.15, y: 2.15, w: 5.25, h: 0.45, fontFace: HEAD, fontSize: 22, bold: true, color: C.accent, margin: 0 });
  s.addText("Many health AI tools produce confident answers with no way to check them. A learner cannot tell a sourced figure from a plausible one, or see where the tool has been wrong before.", { x: 7.15, y: 2.7, w: 5.25, h: 2.0, fontFace: BODY, fontSize: 18, color: C.text, margin: 0, valign: "top" });
  s.addText("Our answer: virtual patients from real survey data, AI that plans and explains, and a simulator that computes every efficacy number.", { x: 0.6, y: 5.25, w: 12.1, h: 1.1, fontFace: HEAD, fontSize: 24, italic: true, color: C.text, margin: 0 });
}

// 2b. Solution and key features
{
  const s = slide("Our solution: ask in plain English, run a trial, and see how far to trust it", "This is the product in one slide. Then show it live if you can.");
  const features = [
    ["Conversational AI copilot", "Explains ideas, follows up on \"why?\", and runs real simulations when you ask about a drug's effect."],
    ["Virtual trials", "Four real drugs and hypothetical molecules, on virtual patients built from real health survey labs."],
    ["AI Trial Designer", "Set a goal. A neural network proposes a study, and the simulator checks it step by step."],
    ["Instant neural sliders", "Move dose or duration and get an answer in milliseconds, then race it against the full simulator."],
    ["Vector database in the browser", "PostgreSQL with pgvector finds the right notes by meaning, with no server and no account."],
    ["Public blind test", "Every frozen prediction beside the real result, shown beside each simulated answer, misses included."],
  ];
  features.forEach(([title, body], i) => {
    const x = 0.6 + (i % 3) * 4.1;
    const y = 1.85 + Math.floor(i / 3) * 2.45;
    card(s, x, y, 3.9, 2.25);
    s.addText(title, { x: x + 0.25, y: y + 0.2, w: 3.4, h: 0.65, fontFace: HEAD, fontSize: 18, bold: true, color: C.accent, margin: 0, valign: "top" });
    s.addText(body, { x: x + 0.25, y: y + 0.9, w: 3.4, h: 1.2, fontFace: BODY, fontSize: 14.5, color: C.text, margin: 0, valign: "top" });
  });
}

// 3. The AI layers
{
  const s = slide("Models propose and explain. The simulator computes.", "Walk the layers left to right. The point: each model does what it is good at, and each has a measured result. The neural surrogate learned the simulator, not reality.");
  const rows = [
    ["Bayesian calibration", `MCMC learns drug effects from three real trials and carries the uncertainty into every prediction.`, `R-hat ${V.max_split_rhat.toFixed(3)}`, `${POST.walkers} walkers, ${POST.steps} steps, ${Math.round(V.length_over_tau)} autocorrelation times`],
    ["Neural surrogate", `Trained on ${SUR.runs_used} simulator runs. Instant sliders, runs in the browser. It learned the simulator, not reality.`, `R² ${SUR.a1c_r2}`, `HbA1c error ${SUR.a1c_mae} points on ${SUR.test_runs} simulator runs it never saw`],
    ["AI Trial Designer", `The surrogate proposes a dose; the simulator checks it, refines it, then sizes the study.`, `${Math.round(DES.fewer_runs_share * 100)}% fewer`, `simulator runs than plain search, across ${DES.goals} goals`],
    ["Live copilot", `A language model on NVIDIA NIM plans tool calls, explains results, and answers ordinary questions in conversation, using notes from a pgvector database in the browser.`, `${(RET.hit_at_3 * 100).toFixed(0)}%`, `of ${RET.answerable} held-out questions found the right note in the top 3. Right tool on ${COP.right_tool} of ${COP.questions} experiments`],
    ["Number and advice guard", `A digit figure no tool produced sends the reply back, then falls to computed text. Dose guidance and personal questions are refused.`, `${COP.attack_prompts_refused_before_any_model} of ${COP.attack_prompts}`, `project-written attack prompts refused before any model is called`],
  ];
  rows.forEach((r, i) => {
    const y = 1.45 + i * 1.08;
    card(s, 0.6, y, 12.1, 0.96);
    s.addText(r[0], { x: 0.85, y, w: 2.7, h: 0.96, fontFace: HEAD, fontSize: 17, bold: true, color: C.text, margin: 0, valign: "middle" });
    s.addText(r[1], { x: 3.6, y, w: 4.55, h: 0.96, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "middle" });
    s.addText(r[2], { x: 8.3, y, w: 1.75, h: 0.96, fontFace: HEAD, fontSize: 22, bold: true, color: C.accent, margin: 0, valign: "middle" });
    s.addText(r[3], { x: 10.1, y, w: 2.45, h: 0.96, fontFace: BODY, fontSize: 11.5, color: C.muted, margin: 0, valign: "middle" });
  });
}

// 3b. Technology stack
{
  const s = slide("Technology stack", "Point out that the simulator and the database both run on the visitor's own device.");
  const stack = [
    ["AI models", ["NVIDIA Nemotron 3.5 on NIM: language model", "nemotron-3-embed-1b: embeddings", "Neural surrogate: a small MLP", "Bayesian MCMC with emcee"]],
    ["Science", ["Python, NumPy, SciPy", "scikit-learn, statsmodels", "NHANES survey data", "Published trial results"]],
    ["In the browser", ["React 19, TypeScript, Vite, Tailwind", "Pyodide: the Python simulator", `PostgreSQL and pgvector ${VDB.pgvector}, through PGlite`, "three.js: 3D body views"]],
    ["Hosting and safety", ["Hugging Face Spaces: static site", "Vercel: proxy that holds the AI key", "Rule-based guard before any model", "Content Security Policy, key scans"]],
  ];
  stack.forEach(([title, items], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.6, 2.92, 4.6);
    s.addText(title, { x: x + 0.2, y: 1.8, w: 2.55, h: 0.5, fontFace: HEAD, fontSize: 19, bold: true, color: C.accent, margin: 0 });
    s.addText(items.map((text, j) => ({ text, options: { bullet: true, breakLine: j < items.length - 1 } })), { x: x + 0.2, y: 2.4, w: 2.55, h: 3.6, fontFace: BODY, fontSize: 15, color: C.text, margin: 0, paraSpaceAfter: 9, valign: "top" });
  });
}

// 4. Designer
{
  const s = slide("A neural network chooses where to look, so the simulator runs less", "The surrogate screens 400 doses in milliseconds and proposes a start. The simulator checks it and has the last word. The benchmark compares guided against plain search on the same goals.");
  framed(s, "crop-designer.png", 0.6, 1.75, 7.9, 4.92);
  stat(s, 8.9, 1.75, 3.8, `${Math.round(DES.fewer_runs_share * 100)}%`, `fewer simulator runs: ${DES.mean_runs_guided} on average against ${DES.mean_runs_plain} for plain bisection`);
  stat(s, 8.9, 3.45, 3.8, `${DES.same_feasibility_verdict} of ${DES.goals}`, "goals reached the same verdict on whether a design exists");
  stat(s, 8.9, 5.15, 3.8, `${Math.round(DES.median_dose_difference * 100)}%`, `median dose difference from plain search; largest ${(DES.largest_dose_difference * 100).toFixed(1)}%`);
}

// 5. Copilot
{
  const s = slide("Testing the copilot found errors a number check can't see, so we changed the design", "Be candid. The first version got only 3 of 10 answers past its own guard, and reading replies by hand found errors no number check could catch. A clinical review also found ways past the guard, now permanent tests. So replies must follow a tool run, code appends every warning, and failures and designs are written by code.");
  framed(s, "crop-copilot-failure.png", 6.6, 1.75, 6.1, 3.23);
  const items = [
    ["No tool run, no answer", "A reply with no tool behind it is rejected. An early draft invented parameter names."],
    ["One chance to fix a figure", "The guard names the unsourced number and sends the draft back. A second failure loses that line, or the whole draft."],
    ["Its failures and designs are written by code", "A paraphrase got the lab's results backwards, and a design must not read as a dose. The model chooses the tool; code writes the text."],
  ];
  items.forEach((it, i) => {
    const y = 1.75 + i * 1.3;
    s.addShape(pres.ShapeType.ellipse, { x: 0.6, y: y + 0.05, w: 0.5, h: 0.5, fill: { color: C.accent } });
    s.addText(String(i + 1), { x: 0.6, y: y + 0.05, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: HEAD, fontSize: 16, bold: true, color: C.bg, margin: 0 });
    s.addText(it[0], { x: 1.3, y, w: 5.0, h: 0.42, fontFace: HEAD, fontSize: 18, bold: true, color: C.text, margin: 0 });
    s.addText(it[1], { x: 1.3, y: y + 0.45, w: 5.0, h: 0.8, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0, valign: "top" });
  });
  s.addText(`Latest run on ${COP.questions} project-written questions: ${COP.answered_by_model} answered by the model, ${COP.written_by_code} written by code, ${COP.guard_replaced_a_reply} replaced by computed text. Known limit: the guard checks that a figure has a source, not the sentence around it.`, { x: 0.6, y: 5.75, w: 12.1, h: 0.9, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0, valign: "top" });
}

// 5b. Attacking our own guard
{
  const s = slide("We attacked our own safety guard, and it failed before it held", "Say this plainly. The first attack got a trial number out of the guard 171 times. A blind test then found emergencies getting an ordinary reply, including self-harm messages. So the default flipped to no, emergencies are checked first, and every simulation or safety answer says where help is. The last row was tuned on these same lists, so it is not a held-out result, and this is for a supervised demo.");
  const head = ["Test", "Personal reaching a simulation", "Urgent missing the emergency reply", "Research questions refused"].map((text) => ({ text, options: { color: C.muted, bold: true } }));
  const cell = (text, color = C.text, bold = false) => ({ text, options: { color, bold } });
  s.addTable([head,
    [cell("First attack, after reading the rules", C.text, true), cell(`${GUARD.first_attack.returned_a_trial_number} got a trial number (${of(GUARD.first_attack.wrong_class)} wrong class)`, C.fail), cell(""), cell("")],
    [cell("First blind run", C.text, true), cell(of([B1.personal[0] + B1.wrapped[0], B1.personal[1] + B1.wrapped[1]])), cell(of(B1.urgent_not_emergency), C.fail), cell(of(B1.legit_refused))],
    [cell("Second blind run, terse messages", C.text, true), cell(of(B2.personal)), cell(`${of(B2.urgent_not_emergency)}; ${B2.urgent_with_no_112} with no 112`, C.fail), cell(of(B2.legit_refused), C.fail)],
    [cell("Shipped guard, same lists (tuned, not held out)", C.text, true), cell(of(SHIP.personal_reaching_a_simulation), C.pass), cell(of(SHIP.urgent_not_given_the_emergency_reply), C.pass), cell(of(SHIP.legit_refused), C.accent)],
  ], { x: 0.6, y: 1.55, w: 12.1, colW: [4.0, 3.2, 2.9, 2.0], fontFace: BODY, fontSize: 14, border: { type: "solid", pt: 0.5, color: C.line }, fill: { color: C.card }, margin: 0.08, rowH: 0.56 });
  s.addText([
    { text: "Default is no for simulations: only a research question reaches one. Personal, urgent and non-English messages stop before any model", options: { bullet: true, breakLine: true } },
    { text: "Urgent messages are checked first, and every simulation or safety answer ends with 112 and the Tele-MANAS helpline, 14416", options: { bullet: true, breakLine: true } },
    { text: "For a supervised research demo, not an unattended public service. Lists written by one author, hard on purpose", options: { bullet: true } },
  ], { x: 0.6, y: 4.95, w: 12.1, h: 1.75, fontFace: BODY, fontSize: 16, color: C.muted, margin: 0, paraSpaceAfter: 8, valign: "top" });
}

// 6. Blind test
{
  const s = slide(`Blind test on ${S.n_contrasts} real results: two passed, two failed`, "Predictions were frozen and pushed to a public commit before the real results were opened, once. Say the failures out loud. Accuracy failed and the model did not beat a simple rival. It held up on empagliflozin, SUSTAIN 2 and sitagliptin alone, and missed the 12-week semaglutide trial and the metformin arms.");
  const row = (name, mark, result, ok) => [
    { text: name, options: { color: C.text, bold: true } },
    { text: mark, options: { color: C.muted } },
    { text: result, options: { color: C.text } },
    { text: ok ? "PASS" : "FAIL", options: { color: ok ? C.pass : C.fail, bold: true, align: "center" } },
  ];
  const head = ["Check", "Pass mark", "Result", ""].map((text) => ({ text, options: { color: C.muted, bold: true } }));
  s.addTable([head,
    row("Accuracy", "error ≤ 0.25, 70% within 0.30", `error ${S.mae}, ${Math.round(S.within_0_30 * 100)}% within`, S.V3_pass),
    row("95% interval", "≥ 85% of results inside", `${Math.round(S.coverage_95pi * 100)}%; only ${Math.round(S.coverage_80pi * 100)}% inside the 80% interval`, S.V4_pass),
    row("Kidney effect, never fitted", "each stratum within 0.30", "within, on 3 results", S.V5_pass),
    row("Beat a rival with no physiology", "whole 95% interval below 0", `gap ${S.model_minus_null_mae}; ${S.model_minus_null_ci95[0]} to ${S.model_minus_null_ci95[1]}`, S.beats_null),
  ], { x: 0.6, y: 1.6, w: 6.5, colW: [2.15, 1.75, 1.95, 0.65], fontFace: BODY, fontSize: 12.5, border: { type: "solid", pt: 0.5, color: C.line }, fill: { color: C.card }, margin: 0.06, rowH: 0.62 });
  s.addText("Predictions were frozen and pushed publicly before any result was opened, and results were opened once. The seal is mechanical: these are famous trials, so the authors knew the literature in general.", { x: 0.6, y: 5.25, w: 6.5, h: 1.4, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0, valign: "top" });
  const names = Object.keys(V.by_trial).sort((a, b) => V.by_trial[b].mae - V.by_trial[a].mae);
  const short = (n) => n.replace("Sitagliptin + metformin factorial", "Sita + metformin").replace("Sitagliptin monotherapy", "Sitagliptin alone").replace("Semaglutide phase 2", "Sema phase 2").replace("EMPA-REG ", "");
  s.addChart(pres.charts.BAR, [
    { name: "This lab", labels: names.map(short), values: names.map((n) => V.by_trial[n].mae) },
    { name: "Simple rival", labels: names.map(short), values: names.map((n) => V.by_trial[n].null_mae) },
  ], { x: 7.3, y: 1.5, w: 5.4, h: 5.3, barDir: "bar", barGrouping: "clustered", chartColors: [C.model, C.rival], showTitle: true, title: "Mean HbA1c error by trial, in points", titleColor: C.text, titleFontFace: BODY, titleFontSize: 14, showLegend: true, legendPos: "b", legendColor: C.muted, legendFontFace: BODY, catAxisLabelColor: C.text, catAxisLabelFontFace: BODY, catAxisLabelFontSize: 11, catAxisOrientation: "maxMin", valAxisLabelColor: C.muted, valAxisLabelFontSize: 10, valAxisLabelFormatCode: "0.0", valAxisMinVal: 0, valAxisMaxVal: 0.6, valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" }, showValue: true, dataLabelColor: C.text, dataLabelFontSize: 9, dataLabelFormatCode: "0.00", dataLabelPosition: "outEnd" });
}

// 7. Failures stay on screen
{
  const s = slide("So the misses stay on screen, beside every simulated result", "This is the real-world idea. Every result shows where that drug held up in the blind test and where it missed. It describes past error and does not adjust the number. It was added after the blind run and changes no prediction.");
  picture(s, "body-view.png", 5.15, 1.45, 7.55, 5.24);
  s.addText("A learner sees a number and its record together.", { x: 0.6, y: 1.65, w: 4.2, h: 1.0, fontFace: HEAD, fontSize: 22, bold: true, color: C.text, margin: 0, valign: "top" });
  s.addText([
    { text: "Semaglutide: the 12-week trial missed; the 56-week trial held up", options: { bullet: true, breakLine: true } },
    { text: "Empagliflozin: held up in both trial groups, including kidney strata", options: { bullet: true, breakLine: true } },
    { text: "The record describes past error and never adjusts the number", options: { bullet: true, breakLine: true } },
    { text: "Added after the blind run; it changes no prediction", options: { bullet: true } },
  ], { x: 0.6, y: 2.85, w: 4.25, h: 3.0, fontFace: BODY, fontSize: 15, color: C.muted, margin: 0, paraSpaceAfter: 10, valign: "top" });
}

// 7b. Innovation and real-world impact
{
  const s = slide("Innovation and real-world impact", "Be plain that nobody outside the project has used it yet. The next step is a pilot with a class.");
  card(s, 0.6, 1.6, 5.85, 4.75);
  s.addText("What is new", { x: 0.9, y: 1.8, w: 5.3, h: 0.45, fontFace: HEAD, fontSize: 21, bold: true, color: C.accent, margin: 0 });
  s.addText([
    { text: "A real simulator and a real vector database run inside the browser, at no server cost", options: { bullet: true, breakLine: true } },
    { text: "The language model plans and explains, and code checks its figures against what actually ran", options: { bullet: true, breakLine: true } },
    { text: "Predictions were frozen before real results were opened, and the failures stay public", options: { bullet: true, breakLine: true } },
    { text: "We attacked our own safety guard and published what got through", options: { bullet: true } },
  ], { x: 0.9, y: 2.35, w: 5.3, h: 3.85, fontFace: BODY, fontSize: 16.5, color: C.text, margin: 0, paraSpaceAfter: 10, valign: "top" });
  card(s, 6.85, 1.6, 5.85, 4.75);
  s.addText("Who it helps", { x: 7.15, y: 1.8, w: 5.3, h: 0.45, fontFace: HEAD, fontSize: 21, bold: true, color: C.accent, margin: 0 });
  s.addText([
    { text: "Students and early researchers can rehearse a study design for free, with no account, on an ordinary laptop", options: { bullet: true, breakLine: true } },
    { text: "Learners see how far to trust an AI answer, because its track record sits beside it", options: { bullet: true, breakLine: true } },
    { text: `The AI designer used ${Math.round(DES.fewer_runs_share * 100)}% fewer simulator runs than a plain search, reaching the same verdict`, options: { bullet: true, breakLine: true } },
    { text: "Next: pilot it with a class, and add Indian patient data", options: { bullet: true } },
  ], { x: 7.15, y: 2.35, w: 5.3, h: 3.85, fontFace: BODY, fontSize: 16.5, color: C.text, margin: 0, paraSpaceAfter: 10, valign: "top" });
}

// 8. Scale, limits, links
{
  const s = slide("It scales like a static site, and it knows what it is not", "Close on scale and limits, then the links. It is a way to think about a study, not a forecast, and never advice for a person.");
  card(s, 0.6, 1.5, 5.85, 3.3);
  s.addText("Built to spread", { x: 0.9, y: 1.7, w: 5.3, h: 0.45, fontFace: HEAD, fontSize: 20, bold: true, color: C.accent, margin: 0 });
  s.addText([
    { text: "The real simulator runs in the visitor's browser through Pyodide, with no server to pay for", options: { bullet: true, breakLine: true } },
    { text: "A small proxy keeps the AI key off the public site", options: { bullet: true, breakLine: true } },
    { text: "If the AI is down, an offline planner still answers from computed results", options: { bullet: true } },
  ], { x: 0.9, y: 2.25, w: 5.3, h: 2.45, fontFace: BODY, fontSize: 17, color: C.text, margin: 0, paraSpaceAfter: 8, valign: "top" });
  card(s, 6.85, 1.5, 5.85, 3.3);
  s.addText("What it is not", { x: 7.15, y: 1.7, w: 5.3, h: 0.45, fontFace: HEAD, fontSize: 20, bold: true, color: C.fail, margin: 0 });
  s.addText([
    { text: "Not clinically validated, and not advice for any person", options: { bullet: true, breakLine: true } },
    { text: "No cardiovascular outcomes, hypoglycaemia or serious adverse events simulated", options: { bullet: true, breakLine: true } },
    { text: "Virtual patients come from a US survey, not an Indian cohort", options: { bullet: true } },
  ], { x: 7.15, y: 2.25, w: 5.3, h: 2.45, fontFace: BODY, fontSize: 17, color: C.text, margin: 0, paraSpaceAfter: 8, valign: "top" });
  s.addText([
    { text: "Live demo  ", options: { color: C.muted } },
    { text: "https://zade06079-medbase-virtual-trials-lab.static.hf.space", options: { color: C.text, breakLine: true } },
    { text: "Code and validation report  ", options: { color: C.muted } },
    { text: "https://github.com/shreynachaegari-glitch/medbase-virtual-trials-lab", options: { color: C.text, breakLine: true } },
    { text: "Built on MedBase by Team Aegis.", options: { color: C.muted } },
  ], { x: 0.6, y: 5.2, w: 12.1, h: 1.4, fontFace: BODY, fontSize: 16, margin: 0, valign: "top", paraSpaceAfter: 6 });
}

pres.writeFile({ fileName: path.join(root, "docs/submission/MedBase_Virtual_Trials_Lab.pptx") }).then((f) => console.log("wrote", f));
