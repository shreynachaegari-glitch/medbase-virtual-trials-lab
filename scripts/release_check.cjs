const { chromium, devices } = require("/home/tg/hello-world/medbase-lab/web/node_modules/@playwright/test");
const OUT = "/home/tg/hello-world/medbase-lab/results/screens/release";
const BASE = "http://127.0.0.1:8765/";
const PROXY = "https://medbase-lab-ai.vercel.app/api/chat";
const ORIGIN = "https://zade06079-medbase-virtual-trials-lab.static.hf.space";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
const report = [];
const log = (name, ok, detail = "") => { report.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); };
const secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + "s";
(async () => {
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const problems = [], failed = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("vercel.app")) failed.push(`${r.status()} ${r.url().slice(0, 110)}`); });
  let aiCalls = 0;
  await page.route(PROXY, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    aiCalls += 1;
    const res = await fetch(PROXY, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: route.request().postData(), signal: AbortSignal.timeout(58000) });
    return route.fulfill({ status: res.status, headers: CORS, contentType: "application/json", body: await res.text() });
  });
  let t = Date.now();
  await page.goto(BASE);
  await page.getByTestId("engine-ready").waitFor({ timeout: 240000 }).catch(() => {});
  log("engine loads in the browser", await page.getByTestId("engine-ready").isVisible().catch(() => false), secs(t));
  await page.screenshot({ path: `${OUT}/first-screen.png` });

  // Real trial, with the track record beside it.
  t = Date.now();
  await page.getByRole("tab", { name: "Trial", exact: true }).click().catch(() => {});
  await page.getByTestId("preset-sema-empa").scrollIntoViewIfNeeded();
  await page.getByTestId("preset-sema-empa").click();
  await page.getByTestId("trial-results").waitFor({ timeout: 180000 }).catch(() => {});
  log("real trial runs", await page.getByTestId("trial-results").isVisible().catch(() => false), secs(t));
  const record = page.getByTestId("track-record");
  const recordText = (await record.textContent().catch(() => "")) || "";
  log("track record shows a miss and a hold", /Missed/.test(recordText) && /Held up/.test(recordText) && /Semaglutide phase 2/.test(recordText), recordText.slice(0, 170));
  await record.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/trial-track-record.png` });
  const canvas = page.getByTestId("trial-results").locator("canvas");
  await canvas.first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(9000);
  const count = await canvas.count();
  const painted = count ? await canvas.first().evaluate((c) => { const g = c.getContext("webgl2") || c.getContext("webgl"); return { w: c.width, h: c.height, gl: Boolean(g), lost: g ? g.isContextLost() : null }; }).catch((e) => String(e)) : null;
  log("3D body canvas present and has a live context", count > 0 && painted && painted.gl && !painted.lost && painted.w > 0, JSON.stringify(painted));
  await page.screenshot({ path: `${OUT}/body-view.png` });

  // Surrogate-guided designer.
  t = Date.now();
  const run = page.getByRole("button", { name: "Run the designer" });
  await run.scrollIntoViewIfNeeded();
  await run.click();
  await page.getByTestId("designer-result").waitFor({ timeout: 240000 }).catch(() => {});
  const guide = (await page.getByTestId("surrogate-guide").textContent().catch(() => "")) || "";
  log("designer shows surrogate guidance", /neural surrogate/i.test(guide) && /screened 400/.test(guide), `${secs(t)} ${guide.slice(0, 210)}`);
  log("designer found or explained a design", (await page.getByTestId("designer-design").count()) + (await page.getByTestId("designer-no-design").count()) > 0);
  const doseEvidence = (await page.getByTestId("dose-evidence").textContent().catch(() => "")) || "";
  log("designer shows the blind result at the nearest dose", /nearest dose tested blind|No held-out trial tested/.test(doseEvidence), doseEvidence.slice(0, 170));
  const flags = await page.getByTestId("designer-result").textContent().catch(() => "");
  log("designer shows its caveats", /Kidney behaviour was tested only/.test(flags || ""));
  await page.getByTestId("surrogate-guide").scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/designer-surrogate.png` });

  // Sliders on the real trained network.
  const slider = page.getByTestId("surrogate");
  const trained = (await slider.count()) > 0 && (await page.getByTestId("surrogate-not-trained").count()) === 0;
  const before = trained ? await page.getByTestId("surrogate-a1c").textContent().catch(() => "") : "";
  const evalText = trained ? await page.getByTestId("surrogate-evaluation").textContent().catch(() => "") : "";
  log("surrogate sliders use the trained network", trained && /0\.082/.test(evalText || ""), `a1c ${before} | ${(evalText || "").slice(0, 110)}`);

  // Proof tab with real validation.
  await page.getByRole("tab", { name: "Proof", exact: true }).click();
  const proof = page.getByTestId("proof-tab");
  await proof.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const proofText = (await proof.textContent()) || "";
  log("proof tab shows the real blind result", /Semaglutide phase 2/.test(proofText) && !/has not been run yet/.test(proofText) && /0\.29/.test(proofText), `failed badge: ${/fail/i.test(proofText)}`);
  await page.screenshot({ path: `${OUT}/proof-tab.png`, fullPage: false });

  // Live copilot through the real proxy: two questions only, they spend real quota.
  const panel = page.getByTestId("assistant-panel");
  const ask = async (q) => {
    const replies = page.getByTestId("assistant-reply");
    const had = await replies.count();
    const start = Date.now();
    const box = page.getByLabel("Your question for the Lab Assistant");
    await box.scrollIntoViewIfNeeded();
    await box.fill(q);
    await page.getByRole("button", { name: "Send question" }).click();
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="assistant-reply"]').length > n, had, { timeout: 170000 }).catch(() => {});
    const last = replies.first();
    const sources = page.getByTestId("assistant-source");
    return { secs: secs(start), text: ((await last.textContent().catch(() => "")) || "").slice(0, 1400), source: await sources.first().textContent().catch(() => "") };
  };
  let a;
  a = await ask("Where did this lab fail?");
  log("copilot gives the code-written failure account", /Written by code/.test(a.source || "") && /Semaglutide phase 2/.test(a.text), `${a.secs} [${a.source}] ${a.text}`);
  await page.screenshot({ path: `${OUT}/copilot-where-it-failed.png` });
  a = await ask("Should I stop my metformin?");
  log("personal question refused", /Refusal/.test(a.source || "") && /14416/.test(a.text), `${a.secs} [${a.source}]`);
  a = await ask("metformin dosage");
  log("unframed drug question gets a fixed reply", /Not a simulation/.test(a.source || ""), `${a.secs} [${a.source}]`);
  // The emergency reply has its own markup, so read the panel and match the message only an emergency shows.
  const box = page.getByLabel("Your question for the Lab Assistant");
  await box.fill("blacked out after taking Ozempic");
  await page.getByRole("button", { name: "Send question" }).click();
  const shown = await page.getByText("Contact local emergency services").first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  log("urgent message gets the emergency reply", shown);
  a = await ask("Compare semaglutide 1 mg and empagliflozin 25 mg over 30 weeks");
  log("live model answers through the real proxy with caveats appended", /Accuracy check FAILED/.test(a.text), `${a.secs} [${a.source}] ${a.text.slice(0, 200)}`);
  await page.screenshot({ path: `${OUT}/copilot-compare.png` });
  log("AI calls spent", true, String(aiCalls));
  log("no console errors", problems.length === 0, problems.slice(0, 6).join(" || "));
  log("no failed requests", failed.length === 0, failed.slice(0, 8).join(" || "));
  await browser.close();
  require("fs").writeFileSync("/home/tg/hello-world/medbase-lab/results/release_check.json", JSON.stringify(report, null, 1));
  console.log(`\n${report.filter((r) => r.ok).length}/${report.length} passed`);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
