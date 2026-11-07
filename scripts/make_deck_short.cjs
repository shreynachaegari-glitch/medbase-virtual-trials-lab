// Writes the 8-slide submission deck, in the order the INFINEX form lists its contents. Figures are read from results/.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const root = path.resolve(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "results", f), "utf8"));
const S = read("validation.json").score;
const SUR = read("surrogate_eval.json");
const DES = read("designer_eval.json").summary;
const RET = read("retrieval_eval.json").held_out;
const VDB = read("vector_db_eval.json");
const shot = (f) => path.join(root, "results/screens/release", f);

const DEMO = "https://zade06079-medbase-virtual-trials-lab.static.hf.space";
const REPO = "https://github.com/shreynachaegari-glitch/medbase-virtual-trials-lab";
const VIDEO = process.env.MEDLAB_VIDEO_URL || "";
if (VIDEO && !/^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/.test(VIDEO)) throw new Error("MEDLAB_VIDEO_URL must be a YouTube link");
const OUTPUT = process.env.MEDLAB_DECK_OUT || path.join(root, "docs/submission/MedBase_Virtual_Trials_Lab_8_slides.pptx");
const C = { bg: "0B0C0E", card: "17191D", line: "2A2D33", text: "F4F4F5", muted: "A7ABB3", accent: "F2B84B", fail: "FB7185" };
const HEAD = "Cambria";
const BODY = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "MedBase Virtual Trials Lab";
pres.author = "Sreyesh Kumar Nachaegari";

const slide = (title, notes) => {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  if (title) s.addText(title, { x: 0.6, y: 0.4, w: 12.1, h: 1.1, fontFace: HEAD, fontSize: 32, bold: true, color: C.text, margin: 0, valign: "top" });
  if (notes) s.addNotes(notes);
  return s;
};
const card = (s, x, y, w, h) => s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: C.card }, line: { color: C.line, width: 0.75 } });
const heading = (s, text, x, y, w, color = C.accent, size = 20) => s.addText(text, { x, y, w, h: 0.5, fontFace: HEAD, fontSize: size, bold: true, color, margin: 0 });
const bullets = (s, items, x, y, w, h, size = 16) => s.addText(items.map((text, i) => ({ text, options: { bullet: true, breakLine: i < items.length - 1 } })), { x, y, w, h, fontFace: BODY, fontSize: size, color: C.text, margin: 0, paraSpaceAfter: 9, valign: "top" });
const stat = (s, big, label, x, y, w) => {
  s.addText(big, { x, y, w, h: 0.8, fontFace: HEAD, fontSize: 36, bold: true, color: C.accent, margin: 0 });
  s.addText(label, { x, y: y + 0.8, w, h: 0.8, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0, valign: "top" });
};
const screenshot = (s, file, x, y, w, h) => {
  s.addImage({ path: shot(file), x, y, w, h, sizing: { type: "crop", w, h: Math.min(h, w * (1000 / 1440)), x: 0, y: 0 } });
  s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: "000000", transparency: 100 }, line: { color: C.line, width: 0.75 } });
};

// 1. The project
{
  const s = slide(null, "Open with the idea, then show the live site if you can.");
  s.addText("INFINEX 2K26  |  APPLIED AI", { x: 0.6, y: 0.75, w: 6, h: 0.35, fontFace: BODY, fontSize: 13, bold: true, color: C.accent, charSpacing: 2, margin: 0 });
  s.addText("MedBase Virtual Trials Lab", { x: 0.6, y: 1.25, w: 5.8, h: 1.8, fontFace: HEAD, fontSize: 46, bold: true, color: C.text, margin: 0, valign: "top" });
  s.addText("Run a simulated type 2 diabetes drug trial in your browser, on virtual patients built from real health survey data, and see how far to trust the answer.", { x: 0.6, y: 3.15, w: 5.5, h: 1.6, fontFace: BODY, fontSize: 19, color: C.muted, margin: 0, valign: "top" });
  s.addText([
    { text: "Try it live", options: { color: C.accent, bold: true, breakLine: true } },
    { text: DEMO, options: { color: C.text, hyperlink: { url: DEMO } } },
  ], { x: 0.6, y: 5.1, w: 5.8, h: 0.8, fontFace: BODY, fontSize: 14, margin: 0, valign: "top" });
  if (VIDEO) {
    s.addText([
      { text: "Watch the demo", options: { color: C.accent, bold: true, breakLine: true } },
      { text: VIDEO, options: { color: C.text, hyperlink: { url: VIDEO } } },
    ], { x: 0.6, y: 5.8, w: 5.8, h: 0.7, fontFace: BODY, fontSize: 14, margin: 0, valign: "top" });
  }
  screenshot(s, "first-screen.png", 6.7, 1.0, 6.05, 4.2);
}

// 2. Problem statement
{
  const s = slide("The problem: trials can't be rehearsed, and health AI can't be checked", "Two gaps: no easy way to try a study before it exists, and confident answers with no way to check them.");
  card(s, 0.6, 1.75, 5.85, 3.3);
  heading(s, "The rehearsal gap", 0.9, 2.0, 5.3, C.accent, 22);
  s.addText("Drug trials cost years and enormous sums. Students and early researchers have no accessible way to explore how a study would behave before it exists, and most open diabetes simulators cover type 1 only.", { x: 0.9, y: 2.6, w: 5.3, h: 2.3, fontFace: BODY, fontSize: 18, color: C.text, margin: 0, valign: "top" });
  card(s, 6.85, 1.75, 5.85, 3.3);
  heading(s, "The trust gap", 7.15, 2.0, 5.3, C.accent, 22);
  s.addText("Many health AI tools give confident answers with no way to check them. A learner can't tell a sourced figure from a plausible one, or see where the tool has been wrong before.", { x: 7.15, y: 2.6, w: 5.3, h: 2.3, fontFace: BODY, fontSize: 18, color: C.text, margin: 0, valign: "top" });
  s.addText("Our answer: virtual patients from real survey data, AI that plans and explains, and a simulator that computes every efficacy number.", { x: 0.6, y: 5.4, w: 12.1, h: 1.0, fontFace: HEAD, fontSize: 22, italic: true, color: C.accent, margin: 0, valign: "top" });
}

// 3. Proposed solution
{
  const s = slide("The solution: ask in plain English, and a real simulator answers", "Walk the path of one question from left to right.");
  const steps = [
    ["Your question", "Plain English, such as \"How much does semaglutide lower HbA1c?\""],
    ["Safety guard", "Personal and urgent messages stop here, before any AI"],
    ["AI copilot", "Plans the experiment, or finds notes by meaning"],
    ["Simulator", "Computes every efficacy number on your own device"],
    ["Checked answer", "Code checks the figures, and the track record sits beside them"],
  ];
  steps.forEach(([title, body], i) => {
    const x = 0.6 + i * 2.45;
    card(s, x, 1.75, 2.3, 3.15);
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.2, y: 1.95, w: 0.48, h: 0.48, fill: { color: C.accent } });
    s.addText(String(i + 1), { x: x + 0.2, y: 1.95, w: 0.48, h: 0.48, align: "center", valign: "middle", fontFace: BODY, fontSize: 14, bold: true, color: C.bg, margin: 0 });
    s.addText(title, { x: x + 0.2, y: 2.55, w: 1.95, h: 0.65, fontFace: HEAD, fontSize: 17, bold: true, color: C.text, margin: 0, valign: "top" });
    s.addText(body, { x: x + 0.2, y: 3.2, w: 1.95, h: 1.6, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0, valign: "top" });
  });
  s.addText("Models propose and explain. The simulator computes.", { x: 0.6, y: 5.3, w: 12.1, h: 0.6, fontFace: HEAD, fontSize: 24, italic: true, color: C.accent, margin: 0 });
}

// 4. Key features
{
  const s = slide("Key features", "Show these live if you can.");
  const features = [
    ["Conversational AI copilot", "Explains ideas, follows up on \"why?\", and runs real simulations when you ask about a drug's effect."],
    ["Virtual trials", "Four real drugs and hypothetical molecules, on virtual patients built from real survey labs."],
    ["AI Trial Designer", "Set a goal. A neural network proposes a study, and the simulator checks it step by step."],
    ["Instant neural sliders", "Move dose or duration and get an answer in milliseconds, then race it against the full simulator."],
    ["Vector database in the browser", "PostgreSQL with pgvector finds the right notes by meaning, with no server and no account."],
    ["Public blind test", "Every frozen prediction beside the real result, including the ones it got wrong."],
  ];
  features.forEach(([title, body], i) => {
    const x = 0.6 + (i % 3) * 4.1;
    const y = 1.4 + Math.floor(i / 3) * 2.6;
    card(s, x, y, 3.9, 2.4);
    s.addText(title, { x: x + 0.25, y: y + 0.2, w: 3.4, h: 0.7, fontFace: HEAD, fontSize: 18, bold: true, color: C.accent, margin: 0, valign: "top" });
    s.addText(body, { x: x + 0.25, y: y + 0.95, w: 3.4, h: 1.3, fontFace: BODY, fontSize: 15, color: C.text, margin: 0, valign: "top" });
  });
}

// 5. Technology stack
{
  const s = slide("Technology stack", "The simulator and the database both run on the visitor's own device.");
  const stack = [
    ["AI models", ["NVIDIA Nemotron 3.5 on NIM: language model", "nemotron-3-embed-1b: embeddings", "Neural surrogate: a small MLP", "Bayesian MCMC with emcee"]],
    ["Science", ["Python, NumPy, SciPy", "scikit-learn, statsmodels", "NHANES survey data", "Published trial results"]],
    ["In the browser", ["React 19, TypeScript, Vite, Tailwind", "Pyodide: the Python simulator", `PostgreSQL and pgvector ${VDB.pgvector}, through PGlite`, "three.js: 3D body views"]],
    ["Hosting and safety", ["Hugging Face Spaces: static site", "Vercel: proxy that holds the AI key", "Rule-based guard before any model", "Content Security Policy, key scans"]],
  ];
  stack.forEach(([title, items], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.4, 2.92, 4.8);
    heading(s, title, x + 0.2, 1.6, 2.55, C.accent, 19);
    bullets(s, items, x + 0.2, 2.2, 2.55, 3.8, 15);
  });
}

// 6. Innovation
{
  const s = slide("Innovation: applied AI you can check", "Each point is something most projects don't do. Be plain that the blind test was mixed.");
  card(s, 0.6, 1.4, 7.0, 5.0);
  heading(s, "What is new", 0.9, 1.6, 6.4, C.accent, 21);
  bullets(s, [
    "A real simulator and a real vector database run inside the browser, at no server cost",
    "The language model plans and explains, while code checks its figures against what actually ran",
    `Predictions were frozen before real results were opened: ${Math.round(S.within_0_30 * S.n_contrasts)} of ${S.n_contrasts} landed within 0.30 HbA1c points, and every miss stays public`,
    "We attacked our own safety guard and published what got through",
  ], 0.9, 2.2, 6.4, 4.0, 17);
  stat(s, `R² ${SUR.a1c_r2}`, `neural surrogate, on ${SUR.test_runs} simulator runs it never trained on`, 8.1, 1.45, 4.6);
  stat(s, `${(RET.hit_at_3 * 100).toFixed(0)}%`, `of ${RET.answerable} held-out questions found the right note in the top 3`, 8.1, 3.1, 4.6);
  stat(s, `${Math.round(VDB.median_query_ms)} ms`, "median vector database query, under Node", 8.1, 4.75, 4.6);
}

// 7. Real-world impact
{
  const s = slide("Real-world impact", "Be plain that nobody outside the project has used it yet. The next step is a pilot with a class.");
  card(s, 0.6, 1.4, 7.0, 5.0);
  heading(s, "Who it helps", 0.9, 1.6, 6.4, C.accent, 21);
  bullets(s, [
    "Students and early researchers can rehearse a study design for free, with no account, on an ordinary laptop",
    "Learners see how far to trust an AI answer, because its track record sits beside it",
    "It costs almost nothing to run, because each visitor's browser does the simulating",
    "Next: pilot it with a class, and add Indian patient data",
  ], 0.9, 2.2, 6.4, 4.0, 17);
  stat(s, `${Math.round(DES.fewer_runs_share * 100)}%`, `fewer simulator runs than a plain search, across ${DES.goals} study goals`, 8.1, 1.6, 4.6);
  stat(s, "0", "servers to run for the simulator, and no account needed", 8.1, 3.5, 4.6);
}

// 8. Limits and links
{
  const s = slide("What it is not, and where to try it", "Close on the limits, then the links. It is a way to think about a study, not a forecast, and never advice for a person.");
  card(s, 0.6, 1.4, 12.1, 2.9);
  heading(s, "What it is not", 0.9, 1.6, 11.5, C.fail, 21);
  bullets(s, [
    "Not clinically validated, and not advice for any person",
    "In its blind test it missed its accuracy mark and did not clearly beat a simple rival",
    "No cardiovascular outcomes, hypoglycaemia or serious adverse events simulated",
    "Virtual patients come from a US survey, not an Indian cohort",
  ], 0.9, 2.15, 11.5, 2.05, 16);
  s.addText([
    { text: "Live demo  ", options: { color: C.muted } },
    { text: DEMO, options: { color: C.text, hyperlink: { url: DEMO }, breakLine: true } },
    ...(VIDEO ? [{ text: "Demo video  ", options: { color: C.muted } }, { text: VIDEO, options: { color: C.text, hyperlink: { url: VIDEO }, breakLine: true } }] : []),
    { text: "Code and validation report  ", options: { color: C.muted } },
    { text: REPO, options: { color: C.text, hyperlink: { url: REPO }, breakLine: true } },
    { text: "Built on MedBase by Team Aegis.", options: { color: C.muted } },
  ], { x: 0.6, y: 4.7, w: 12.1, h: 1.5, fontFace: BODY, fontSize: 17, margin: 0, valign: "top", paraSpaceAfter: 8 });
}

pres.writeFile({ fileName: OUTPUT }).then((f) => console.log("wrote", f));
