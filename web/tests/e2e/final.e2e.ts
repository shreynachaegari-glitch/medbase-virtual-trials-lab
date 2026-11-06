import { expect, test, type Page, type Route } from "@playwright/test";
import { SCREENS, watchConsole } from "./mock-api";

/**
 * One pass over the deployed shape: the static build with the AI proxy set, real Pyodide, the real bundle, no API.
 *   VITE_LLM_PROXY=<url> MEDBASE_OUT_DIR=<dir> npm run build:static
 *   MEDLAB_FINAL=1 MEDLAB_COPILOT=<url> VITE_LLM_PROXY=<url> MEDBASE_OUT_DIR=<dir> npx playwright test final
 * The bundled posterior may not be final. Screenshots are named prelim, and their numbers are not results.
 * The real AI test asks 1 real question, and only with MEDLAB_REAL_AI=1.
 */
test.skip(!process.env.MEDLAB_FINAL, "needs the static build with the proxy: set MEDLAB_FINAL=1");
test.setTimeout(240_000);
const proxy = process.env.MEDLAB_COPILOT ?? "";
const ALLOWED_ORIGIN = "https://zade06079-medbase-virtual-trials-lab.static.hf.space";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };

const noOverflow = async (page: Page) => {
    const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(widths.doc, `page is ${widths.doc}px wide in a ${widths.win}px window`).toBeLessThanOrEqual(widths.win);
};

test("the root opens the lab: usable at once, then a real trial, flagged, in the body", async ({ page }, info) => {
    const problems = watchConsole(page);
    const t0 = Date.now();
    await page.goto("/");
    await expect(page).toHaveURL(/\/trials$/);
    const box = page.getByLabel("Your question for the Lab Assistant");
    await expect(box).toBeEditable();
    console.log(`TIMING prompt usable (${info.project.name}): ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await expect(page.getByTestId("mode-badge")).toHaveText("Running in your browser");
    await expect(page.getByTestId("engine-pill")).toBeVisible();
    await expect(page.getByTestId("assistant-privacy")).toBeVisible();
    await expect(page.getByTestId("surrogate-not-trained")).toBeVisible();
    await expect(page.getByTestId("quick-proof")).toContainText("has not been run yet");
    const send = (await page.getByRole("button", { name: "Send question" }).boundingBox())!;
    const chat = (await page.getByRole("button", { name: "Open chat" }).boundingBox())!;
    expect(send.y + send.height, "Send button clear of the chat button").toBeLessThan(chat.y);
    await noOverflow(page);
    await page.screenshot({ path: `${SCREENS}/${info.project.name}-static-first-screen.png` });

    await page.getByTestId("preset-sema-empa").scrollIntoViewIfNeeded();
    await page.getByTestId("preset-sema-empa").click();
    const results = page.getByTestId("trial-results");
    await expect(results).toContainText("Simulated trial result", { timeout: 120_000 });
    console.log(`TIMING first click to real trial result, including load (${info.project.name}): ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await expect(results.getByTestId("result-source")).toHaveText("Running in your browser");
    await expect(results.getByTestId("chain-flag")).toContainText("did not converge");
    await expect(results.getByTestId("not-modelled")).toContainText("Hypoglycaemia is not modelled");
    const body = results.getByTestId("body-response");
    await expect(body.getByTestId("body-signal")).toHaveCount(4);
    for (const row of await body.getByTestId("body-signal").all()) await expect(row).toContainText("simulated");
    await expect(body.getByTestId("body-response-canvas").locator("canvas")).toBeVisible();
    await body.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENS}/prelim-unconverged-${info.project.name}-body-response.png` });
    await noOverflow(page);
    expect(problems).toEqual([]);
});

test("reduced motion: results appear settled, and the body bars don't animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const problems = watchConsole(page);
    await page.goto("/#/trials");
    await page.getByTestId("preset-sema-empa").click();
    const bar = page.getByTestId("body-signal-bar").first();
    await expect(bar).toBeVisible({ timeout: 120_000 });
    expect(parseFloat(await bar.evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(0.01);
    await noOverflow(page);
    expect(problems).toEqual([]);
});

test("Learn's 3D body fades everything but the chosen organ", async ({ page }, info) => {
    const problems = watchConsole(page);
    const t0 = Date.now();
    await page.goto("/#/learn"); // landing builds use hash routes
    await expect(page.getByTestId("atlas-canvas").locator("canvas")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("atlas-loading")).toHaveCount(0, { timeout: 90_000 });
    console.log(`TIMING HRA all organs (${info.project.name}): ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await expect(page.getByTestId("atlas-failed")).toHaveCount(0);
    await page.waitForTimeout(800);
    await page.getByTestId("atlas-canvas").screenshot({ path: `${SCREENS}/${info.project.name}-learn-atlas-body.png` });
    await page.getByTestId("atlas-list").getByRole("button", { name: /^Liver/ }).click();
    await expect(page.getByTestId("atlas-detail")).toContainText("Hepatitis B");
    await page.waitForTimeout(2200);
    await page.getByTestId("atlas-canvas").screenshot({ path: `${SCREENS}/${info.project.name}-learn-atlas-liver-focus.png` });
    await noOverflow(page);
    expect(problems).toEqual([]);
});

test("a model call that stalls gives up, says so plainly, and the planner answers", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "one is enough");
    await page.route(proxy, async (route: Route) => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
        await new Promise(() => undefined); // never answers
    });
    await page.goto("/#/trials");
    await page.getByTestId("engine-ready").waitFor({ timeout: 90_000 });
    const t0 = Date.now();
    await page.getByLabel("Your question for the Lab Assistant").fill("How accurate is this lab?");
    await page.getByRole("button", { name: "Send question" }).click();
    await expect(page.getByTestId("copilot-deciding")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("assistant-guard")).toContainText("The AI service is unavailable", { timeout: 75_000 });
    console.log(`TIMING stalled model call gave up after: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await expect(page.getByTestId("assistant-source")).toHaveText("Offline planner, in place of the AI's reply");
    await expect(page.getByTestId("assistant-reply")).not.toContainText("nothing is sent");
});

test("one real question through the real proxy, on the real engine", async ({ page }, info) => {
    test.skip(process.env.MEDLAB_REAL_AI !== "1" || info.project.name !== "desktop", "spends real quota");
    const problems = watchConsole(page);
    const calls: string[] = [];
    await page.route(proxy, async (route: Route) => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
        const t = Date.now();
        const response = await route.fetch({ headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN } });
        calls.push(`${Date.now() - t} ms status ${response.status()}`);
        await route.fulfill({ status: response.status(), headers: CORS, contentType: "application/json", body: await response.text() });
    });
    await page.goto("/#/trials");
    await page.getByTestId("engine-ready").waitFor({ timeout: 90_000 });
    const t0 = Date.now();
    await page.getByLabel("Your question for the Lab Assistant").fill("Compare semaglutide 1 mg and empagliflozin 25 mg over 30 weeks");
    await page.getByRole("button", { name: "Send question" }).click();
    await expect(page.getByTestId("copilot-deciding")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("assistant-source")).toBeVisible({ timeout: 180_000 });
    const guard = page.getByTestId("assistant-guard");
    console.log(`REAL-AI ${((Date.now() - t0) / 1000).toFixed(1)} s | source: ${await page.getByTestId("assistant-source").textContent()} | guard: ${(await guard.count()) ? await guard.textContent() : "none"} | calls: ${calls.join(", ")}`);
    console.log(`REAL-AI steps: ${JSON.stringify(await page.getByTestId("copilot-step").allInnerTexts())}`);
    await expect(page.getByTestId("assistant-sent")).toHaveText("This question was sent to an AI provider.");
    await expect(page.getByTestId("assistant-reply")).not.toContainText("nothing is sent");
    expect(calls.length).toBeGreaterThan(0);
    await page.getByTestId("assistant-panel").screenshot({ path: `${SCREENS}/prelim-unconverged-copilot.png` });
    expect(problems).toEqual([]);
});
