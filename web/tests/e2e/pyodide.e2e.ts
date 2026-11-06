import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { SCREENS, watchConsole } from "./mock-api";

/**
 * The real engine, in real Pyodide, in a real browser, with no API running. Nothing here is mocked
 * except, when a stand-in is supplied, the posterior. Opt in:
 *   MEDLAB_PYODIDE=1 npx playwright test pyodide
 * MEDLAB_TEST_POSTERIOR points at a stand-in kept outside the shipped files. Numbers produced with
 * it mean nothing. They are checked only against a native run of the same stand-in.
 */
test.skip(!process.env.MEDLAB_PYODIDE, "downloads Pyodide: set MEDLAB_PYODIDE=1");
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);

const standIn = process.env.MEDLAB_TEST_POSTERIOR;
const native = process.env.MEDLAB_TEST_NATIVE;
const timing = (label: string, ms: number) => console.log(`TIMING ${label}: ${(ms / 1000).toFixed(1)} s`);

const useStandIn = async (page: Page) => {
    const posterior = readFileSync(standIn!, "utf8");
    await page.route("**/engine/manifest.json", async (route) => {
        const response = await route.fetch();
        const manifest = await response.json();
        await route.fulfill({ response, json: { ...manifest, results: ["posterior.json"] } });
    });
    await page.route("**/engine/posterior.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: posterior }));
};

const waitReady = async (page: Page) => {
    await expect(page.getByTestId("engine-ready")).toBeVisible({ timeout: 300_000 });
};

test("with no posterior: real load, instant saved tabs, honest 503, working model and planner", async ({ page }, info) => {
    test.skip(Boolean(standIn), "the shipped state, so no stand-in");
    test.skip((JSON.parse(readFileSync("public/engine/manifest.json", "utf8")) as { results: string[] }).results.includes("posterior.json"), "for a bundle with no posterior");
    const problems = watchConsole(page);
    const t0 = Date.now();
    await page.goto("/trials");
    await expect(page.getByTestId("mode-badge")).toHaveText("Running in your browser");
    // Usable straight away, while the engine warms up behind it.
    await expect(page.getByLabel("Your question for the Lab Assistant")).toBeEditable();
    const progress = page.getByTestId("engine-progress");
    await expect(progress).toBeVisible();
    await expect(progress).not.toContainText("%");

    // Saved tabs must work while the download is still running.
    await page.getByRole("tab", { name: "Safety", exact: true }).click();
    await expect(page.getByTestId("safety-paper")).toContainText("Boxed warning");
    await expect(page.getByTestId("safety-tab").getByTestId("saved-run-label")).toHaveText("Saved run");
    await expect(page.getByTestId("engine-pill")).toBeVisible();
    timing(`safety visible while engine loads (${info.project.name})`, Date.now() - t0);
    await page.getByRole("tab", { name: "Proof", exact: true }).click();
    await expect(page.getByTestId("parameters-table")).toContainText("Topp et al. 2000");
    await expect(page.getByTestId("proof-tab")).toContainText("has not been run yet");
    await expect(page.getByTestId("engine-pill")).toBeVisible();
    timing(`parameters visible while engine loads (${info.project.name})`, Date.now() - t0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SCREENS}/browser-${info.project.name}-loading.png` });

    await page.getByRole("tab", { name: "Trial", exact: true }).click();
    await page.getByTestId("preset-sema-empa").click();
    await waitReady(page);
    timing(`first load to ready, cold cache (${info.project.name})`, Date.now() - t0);
    console.log(`INFO ${await page.getByTestId("engine-ready").textContent()}`);

    await expect(page.getByTestId("run-error")).toContainText("Calibration results are missing from this site", { timeout: 60_000 });

    const t1 = Date.now();
    await page.getByRole("tab", { name: "Disease progression", exact: true }).click();
    await expect(page.getByTestId("progression-summary")).toHaveCount(2, { timeout: 120_000 });
    timing(`two real progression runs (${info.project.name})`, Date.now() - t1);
    await expect(page.getByTestId("progression-summary").first()).toContainText("Day 1100");
    await expect(page.getByTestId("progression-summary").first()).toContainText("Day 445");
    await expect(page.getByTestId("result-source")).toHaveText("Running in your browser");
    await page.waitForTimeout(1200);
    await page.locator("#panel-progression").screenshot({ path: `${SCREENS}/browser-${info.project.name}-progression.png` });

    const panel = page.getByTestId("assistant-panel");
    await expect(page.getByTestId("assistant-privacy")).toHaveCount(0);
    await panel.getByRole("button", { name: "What side effects were reported for semaglutide?" }).click();
    await expect(page.getByTestId("assistant-source").first()).toHaveText("Offline planner: runs in your browser, nothing is sent anywhere", { timeout: 60_000 });
    await expect(page.getByTestId("assistant-tools").first()).toContainText("Read reported side effects");
    await panel.getByRole("button", { name: "Should I stop taking my metformin?" }).click();
    await expect(page.getByTestId("assistant-source").first()).toHaveText("Refusal");

    await page.getByRole("tab", { name: "Trial", exact: true }).click();
    const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(widths.doc).toBeLessThanOrEqual(widths.win);
    expect(problems).toEqual([]);

    const t2 = Date.now();
    await page.reload();
    await waitReady(page);
    timing(`reload to ready, warm cache (${info.project.name})`, Date.now() - t2);
});

test("with a stand-in posterior: real trial, queue, power, responders, designer", async ({ page }, info) => {
    test.skip(!standIn, "needs MEDLAB_TEST_POSTERIOR");
    const problems = watchConsole(page);
    await useStandIn(page);
    const t0 = Date.now();
    await page.goto("/trials");
    await waitReady(page);
    timing(`first load to ready, cold cache (${info.project.name})`, Date.now() - t0);

    const t1 = Date.now();
    await page.getByTestId("preset-sema-empa").click();
    const results = page.getByTestId("trial-results");
    await expect(results).toContainText("Simulated trial result", { timeout: 300_000 });
    timing(`default-sized preset trial (${info.project.name})`, Date.now() - t1);
    await expect(results.getByTestId("result-source")).toHaveText("Running in your browser");
    await expect(results.getByTestId("not-modelled")).toContainText("Hypoglycaemia is not modelled");
    await expect(results.getByTestId("chain-flag")).toContainText("did not converge");
    // The real engine's organ signals, on real models. Stand-in numbers, so nothing is saved as a screenshot.
    const body = results.getByTestId("body-response");
    await expect(body.getByTestId("body-signal")).toHaveCount(4);
    await expect(body).toContainText("simulated");
    console.log(`INFO organ rows rendered from a real engine response: ${(await body.getByTestId("body-signal").allInnerTexts()).length}`);

    if (native) {
        const expected = JSON.parse(readFileSync(native, "utf8")) as Record<string, string>;
        for (const [arm, effect] of Object.entries(expected)) {
            await expect(results.locator("li").filter({ hasText: arm }).first()).toContainText(effect);
        }
        console.log(`INFO browser HbA1c effects match a native run of the same stand-in: ${JSON.stringify(expected)}`);
    }

    // A page that stays responsive while a run blocks the worker, and a queue that keeps order.
    const t2 = Date.now();
    await page.getByTestId("preset-kidney").click();
    await expect(page.getByTestId("run-progress")).toContainText("1 of 2");
    const frames = await page.evaluate(() => new Promise<number>((resolve) => {
        let count = 0;
        const end = performance.now() + 1000;
        const tick = () => {
            count += 1;
            if (performance.now() < end) requestAnimationFrame(tick);
            else resolve(count);
        };
        requestAnimationFrame(tick);
    }));
    console.log(`INFO frames painted in 1 s during a simulation: ${frames}`);
    expect(frames).toBeGreaterThan(20);
    await expect(page.getByTestId("strata-summary")).toBeVisible({ timeout: 300_000 });
    timing(`kidney preset, two trials (${info.project.name})`, Date.now() - t2);

    const t3 = Date.now();
    await page.getByRole("tab", { name: "Power", exact: true }).click();
    await page.getByRole("button", { name: "Estimate power" }).click();
    await expect(page.getByTestId("power-result")).toBeVisible({ timeout: 300_000 });
    timing(`power (${info.project.name})`, Date.now() - t3);

    const t4 = Date.now();
    await page.getByRole("tab", { name: "Who responds", exact: true }).click();
    await page.getByRole("button", { name: "Find who responds" }).click();
    await expect(page.getByTestId("responders-result")).toBeVisible({ timeout: 300_000 });
    timing(`who responds (${info.project.name})`, Date.now() - t4);

    const t5 = Date.now();
    await page.getByRole("button", { name: "Run the designer" }).click();
    await expect(page.getByTestId("designer-result")).toBeVisible({ timeout: 600_000 });
    const steps = await page.getByTestId("designer-step").count();
    timing(`AI designer, ${steps} steps (${info.project.name})`, Date.now() - t5);
    await expect(page.getByTestId("designer-notice")).toContainText("not a dosing recommendation");
    expect(problems).toEqual([]);
});
