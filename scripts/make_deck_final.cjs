// Writes the final 8-slide submission deck. Figures are read from results/. Set MEDLAB_VIDEO_URL to add the demo video link.
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
const asset = (f) => path.join(root, "docs/submission/assets", f);

const DEMO = "https://zade06079-medbase-virtual-trials-lab.static.hf.space";
const REPO = "https://github.com/shreynachaegari-glitch/medbase-virtual-trials-lab";
const VIDEO = process.env.MEDLAB_VIDEO_URL || "";
if (VIDEO && !/^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/.test(VIDEO)) throw new Error("MEDLAB_VIDEO_URL must be a YouTube link");
const C = { bg: "060B14", card: "0F1726", line: "22304A", text: "F1F5F9", muted: "A9B8CA", accent: "2FD6F5" };
const FONT = "Arial";
const BODY = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "MedBase Virtual Trials Lab";
pres.author = "Team Aegis";

const slide = (label, title, notes, w = 12.1) => {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  if (label) s.addText(label, { x: 0.6, y: 0.4, w, h: 0.3, fontFace: BODY, fontSize: 13, bold: true, color: C.accent, charSpacing: 2, margin: 0 });
  if (title) s.addText(title, { x: 0.6, y: 0.72, w, h: 1.15, fontFace: FONT, fontSize: 30, bold: true, color: C.text, margin: 0, valign: "top" });
  s.addNotes(notes);
  return s;
};
const card = (s, x, y, w, h) => s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.07, fill: { color: C.card }, line: { color: C.line, width: 0.75 } });
const text = (s, value, x, y, w, h, size, color = C.text, extra = {}) => s.addText(value, { x, y, w, h, fontFace: BODY, fontSize: size, color, margin: 0, valign: "top", ...extra });
const picture = (s, file, x, y, w, h) => {
  s.addImage({ path: asset(file), x, y, w, h });
  s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: "000000", transparency: 100 }, line: { color: C.line, width: 0.75 } });
};
const link = (label, url) => [{ text: `${label}  `, options: { color: C.muted } }, { text: url, options: { color: C.accent, hyperlink: { url }, breakLine: true } }];

// 1. The project
{
  const s = slide(null, null, "MedBase lets anyone rehearse a type 2 diabetes drug trial in the browser, on virtual patients built from real health survey data, and see how far to trust the answer.");
  s.addImage({ path: asset("hologram-crop.jpg"), x: 8.13, y: 0, w: 5.2, h: 7.5 });
  text(s, "INFINEX 2K26  |  APPLIED AI", 0.6, 0.75, 7, 0.35, 14, C.accent, { bold: true, charSpacing: 2 });
  s.addText("MedBase\nVirtual Trials Lab", { x: 0.6, y: 1.3, w: 7.2, h: 1.9, fontFace: FONT, fontSize: 44, bold: true, color: C.text, margin: 0, valign: "top" });
  text(s, "Rehearse a type 2 diabetes drug trial in your browser, on virtual patients built from real health data, and know how far to trust the result.", 0.6, 3.35, 6.9, 1.4, 20, C.muted);
  s.addText([...link("Live demo", DEMO), ...(VIDEO ? link("Demo video", VIDEO) : [])], { x: 0.6, y: 5.1, w: 7.2, h: 0.9, fontFace: BODY, fontSize: 14, margin: 0, valign: "top", paraSpaceAfter: 5 });
  text(s, "Team Aegis", 0.6, 6.55, 6, 0.35, 14, C.muted);
}

// 2. Problem
{
  const s = slide("THE PROBLEM", "Trials can't be rehearsed, and health AI can't be checked", "Two gaps: nobody can try a study before it exists, and health AI gives confident answers with no way to check them.", 9.6);
  s.addImage({ path: asset("scan.jpg"), x: 10.55, y: 0.6, w: 2.2, h: 4.18 });
  [["REHEARSAL GAP", "Trials cost years and enormous sums. Students and early researchers have no accessible way to try a study first, and most open diabetes simulators cover type 1 only."],
    ["TRUST GAP", "Health AI gives confident answers with no way to check them, or to see where it has been wrong before."]].forEach(([h, b], i) => {
    const x = 0.6 + i * 4.85;
    card(s, x, 2.05, 4.65, 2.75);
    text(s, h, x + 0.28, 2.28, 4.1, 0.35, 14, C.accent, { bold: true, charSpacing: 2 });
    text(s, b, x + 0.28, 2.72, 4.1, 2.0, 17);
  });
  s.addText("MedBase closes both: real patient data, AI that plans and explains, and a simulator that computes every efficacy number.", { x: 0.6, y: 5.3, w: 12.1, h: 1.1, fontFace: FONT, fontSize: 22, bold: true, color: C.accent, margin: 0, valign: "top" });
}

// 3. Solution
{
  const s = slide("THE SOLUTION", "Ask in plain English, and a real simulator answers", "Follow one question through the pipeline. The architecture rule is the key: models propose and explain, and the simulator computes.");
  [["Your question", "Ask about a drug, a trial or an idea, in plain English."],
    ["Safety guard", "Personal and urgent messages stop here, before any AI."],
    ["AI copilot", "NVIDIA Nemotron plans the experiment, or finds notes by meaning."],
    ["Simulator", "Computes every efficacy number, right on your device."],
    ["Checked answer", "Code checks the figures, and the track record sits beside them."]].forEach(([h, b], i) => {
    const x = 0.6 + i * 2.45;
    card(s, x, 2.0, 2.3, 3.35);
    text(s, `STEP 0${i + 1}`, x + 0.2, 2.2, 1.9, 0.3, 12, C.accent, { bold: true, charSpacing: 2 });
    text(s, h, x + 0.2, 2.55, 1.95, 0.8, 19, C.text, { bold: true });
    text(s, b, x + 0.2, 3.4, 1.95, 1.85, 15, C.muted);
  });
  s.addText("Models propose and explain. The simulator computes.", { x: 0.6, y: 5.7, w: 12.1, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: C.accent, margin: 0 });
}

// 4. Key features
{
  const s = slide("KEY FEATURES", "Six ways to explore a trial", "The picture is the real copilot on the live site, running a real simulation.", 7.6);
  picture(s, "chat-sim.png", 8.35, 0.9, 4.4, 5.54);
  [["AI copilot", "Explains ideas, follows up on \"why?\", and runs real simulations"],
    ["Virtual trials", "Four real drugs and hypothetical molecules"],
    ["AI Trial Designer", "A neural network proposes a study, and the simulator checks it"],
    ["Instant neural sliders", "Change dose or duration and see the answer in milliseconds"],
    ["Vector database", "PostgreSQL with pgvector, in the browser, with no server or account"],
    ["Public blind test", "Every frozen prediction beside the real result"]].forEach(([h, b], i) => {
    const x = 0.6 + (i % 2) * 3.8;
    const y = 1.65 + Math.floor(i / 2) * 1.8;
    card(s, x, y, 3.6, 1.65);
    text(s, h, x + 0.2, y + 0.16, 3.2, 0.4, 17, C.accent, { bold: true });
    text(s, b, x + 0.2, y + 0.6, 3.2, 1.0, 14.5);
  });
}

// 5. Technology
{
  const s = slide("TECHNOLOGY STACK", "A full AI stack, with the simulator and database in the browser", "The simulator and the vector database run on the visitor's device. The language model and embeddings run on NVIDIA NIM, through a small proxy that holds the key.", 8.7);
  s.addImage({ path: asset("chip-crop.jpg"), x: 9.73, y: 0, w: 3.6, h: 7.5 });
  [["AI", "NVIDIA Nemotron 3.5 on NIM, nemotron-3-embed-1b embeddings, a neural surrogate, Bayesian MCMC with emcee"],
    ["SCIENCE", "Python, NumPy, SciPy, scikit-learn, statsmodels, NHANES survey data, published trial results"],
    ["BROWSER", `React 19, TypeScript, Vite, Pyodide, PGlite with pgvector ${VDB.pgvector}, three.js`],
    ["SAFETY AND HOSTING", "Rule-based guard, Vercel key proxy, Hugging Face Spaces, Content Security Policy"]].forEach(([h, b], i) => {
    const x = 0.6 + (i % 2) * 4.45;
    const y = 2.1 + Math.floor(i / 2) * 2.4;
    card(s, x, y, 4.25, 2.2);
    text(s, h, x + 0.25, y + 0.2, 3.75, 0.35, 14, C.accent, { bold: true, charSpacing: 2 });
    text(s, b, x + 0.25, y + 0.62, 3.75, 1.5, 16);
  });
}

// 6. Innovation
{
  const within = Math.round(S.within_0_30 * S.n_contrasts);
  const s = slide("INNOVATION", "Applied AI you can check", `We froze ${S.n_contrasts} predictions before opening the real trial results. ${within} landed within 0.30 points, and the lab passed 2 of its 4 pre-registered checks: it missed its accuracy mark and did not clearly beat a simple baseline. We publish that, because it is what makes the rest believable. The surrogate's R-squared measures it against the simulator, not reality.`, 8.5);
  [[`R² ${SUR.a1c_r2}`, "Neural surrogate", `on ${SUR.test_runs} simulator runs it never saw`],
    [`${(RET.hit_at_3 * 100).toFixed(0)}%`, "Retrieval", `right note in the top 3, on ${RET.answerable} held-out questions`],
    ["Under 11 ms", "Vector database", "query measured in the live browser"]].forEach(([big, h, b], i) => {
    const x = 0.6 + i * 2.95;
    card(s, x, 1.75, 2.8, 2.45);
    s.addText(big, { x: x + 0.2, y: 1.92, w: 2.45, h: 0.75, fontFace: FONT, fontSize: i === 2 ? 22 : 28, bold: true, color: C.accent, margin: 0, valign: "middle" });
    text(s, h, x + 0.2, 2.72, 2.45, 0.38, 16, C.text, { bold: true });
    text(s, b, x + 0.2, 3.12, 2.45, 1.0, 14, C.muted);
  });
  card(s, 0.6, 4.4, 8.7, 2.3);
  text(s, "FROZEN BEFORE THE ANSWERS WERE KNOWN", 0.85, 4.58, 8.2, 0.35, 13, C.accent, { bold: true, charSpacing: 1 });
  text(s, `${S.n_contrasts} predictions were published before real trial results were opened. ${within} landed within 0.30 HbA1c points, the lab passed 2 of 4 pre-registered checks, and every miss stays public. We also attacked our own safety guard and published what got through.`, 0.85, 4.98, 8.2, 1.65, 16);
  picture(s, "chart.png", 9.55, 1.75, 3.2, 3.2);
  text(s, "Each dot is a real prediction against the real trial result.", 9.55, 5.05, 3.2, 0.8, 14, C.muted);
}

// 7. Real-world impact
{
  const s = slide("REAL-WORLD IMPACT", "Trial rehearsal for anyone with a laptop", "If asked: nobody outside the project has used it yet. The next step is a pilot with a class.", 7.0);
  picture(s, "home-crop.png", 7.7, 0.6, 5.05, 3.5);
  [[`${Math.round(DES.fewer_runs_share * 100)}%`, `fewer simulator runs than a plain search, across ${DES.goals} study goals`], ["0", "servers to run for the simulator, and no account needed"]].forEach(([big, b], i) => {
    const x = 0.6 + i * 3.45;
    card(s, x, 2.0, 3.3, 2.1);
    s.addText(big, { x: x + 0.2, y: 2.12, w: 2.9, h: 0.8, fontFace: FONT, fontSize: 36, bold: true, color: C.accent, margin: 0 });
    text(s, b, x + 0.2, 2.95, 2.9, 1.1, 14.5);
  });
  s.addText([
    "Students and early researchers rehearse a study design free, on an ordinary laptop",
    "Learners see an AI answer's track record right beside it",
    "Almost no running cost, because each browser does the simulating",
    "Next: a pilot with a class, and Indian patient data",
  ].map((value, i) => ({ text: value, options: { bullet: true, breakLine: i < 3 } })), { x: 0.6, y: 4.45, w: 12.1, h: 2.4, fontFace: BODY, fontSize: 18, color: C.text, margin: 0, paraSpaceAfter: 8, valign: "top" });
}

// 8. Close
{
  const s = slide("TRY IT TODAY", "Rehearse a trial. See how far to trust it.", "Close on the idea, then invite them to try it. If asked: it is a simulator for learning, it has not been clinically validated, it gives no advice for any person, and its patients come from a US survey.");
  card(s, 0.6, 2.0, 12.1, VIDEO ? 2.85 : 2.3);
  s.addText([...link("Live demo", DEMO), ...(VIDEO ? link("Demo video", VIDEO) : []), ...link("Code and validation report", REPO)], { x: 0.9, y: 2.25, w: 11.5, h: VIDEO ? 2.4 : 1.85, fontFace: BODY, fontSize: 18, margin: 0, valign: "top", paraSpaceAfter: 12 });
  s.addText("No install. No account. Just ask.", { x: 0.6, y: 5.25, w: 12.1, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: C.accent, margin: 0 });
  text(s, "Built on MedBase by Team Aegis", 0.6, 6.1, 12, 0.4, 15, C.muted);
}

pres.writeFile({ fileName: path.join(root, "docs/submission/MedBase_Virtual_Trials_Lab_Final.pptx") }).then((f) => console.log("wrote", f));
