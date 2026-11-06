import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { watchConsole } from "./mock-api";

/**
 * The live copilot: the real engine in real Pyodide, with no API. Opt in with a build that has VITE_LLM_PROXY set:
 *   VITE_LLM_PROXY=<url> MEDBASE_OUT_DIR=<dir> npm run build:static
 *   MEDLAB_COPILOT=<url> MEDBASE_OUT_DIR=<dir> npx playwright test copilot
 * The model's replies are scripted here unless MEDLAB_REAL_AI=1. Then this forwards to the real proxy, which
 * spends real quota: it asks 1 question. Numbers from a stand-in posterior mean nothing.
 */
const proxy = process.env.MEDLAB_COPILOT;
const realAI = process.env.MEDLAB_REAL_AI === "1";
const standIn = process.env.MEDLAB_TEST_POSTERIOR;
const ALLOWED_ORIGIN = "https://zade06079-medbase-virtual-trials-lab.static.hf.space";
test.skip(!proxy, "needs a build with VITE_LLM_PROXY: set MEDLAB_COPILOT");
test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
type Scripted = { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } | "fail";

/** Plays back the model's turns, and records what it was sent. */
const scriptModel = async (page: Page, turns: Scripted[], sent: { messages: { role: string; content?: string }[]; tools: unknown[] }[]) => {
    let i = 0;
    await page.route(proxy!, async (route: Route) => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
        sent.push(route.request().postDataJSON());
        const turn = turns[Math.min(i, turns.length - 1)];
        i += 1;
        // Long enough to see the page say what it is waiting for.
        await new Promise((r) => setTimeout(r, 700));
        if (turn === "fail") return route.fulfill({ status: 502, headers: CORS, contentType: "application/json", body: JSON.stringify({ error: "AI service error" }) });
        return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ message: { content: turn.content ?? "", tool_calls: turn.tool_calls ?? [] } }) });
    });
};

const tool = (id: string, name: string, args = "{}") => ({ id, function: { name, arguments: args } });
const ask = async (page: Page, question: string) => {
    await page.getByLabel("Your question for the Lab Assistant").fill(question);
    await page.getByRole("button", { name: "Send question" }).click();
};
const NIM = "AI model (NVIDIA NIM), figures checked against the simulator";

test.describe("with the model's replies scripted", () => {
    test.skip(realAI, "the real proxy is covered below");

    test("runs the loop, shows each tool live, and labels the result", async ({ page }) => {
        const problems = watchConsole(page);
        const sent: { messages: { role: string; content?: string }[]; tools: unknown[] }[] = [];
        await scriptModel(page, [
            { tool_calls: [tool("a", "validation_report"), tool("b", "model_assumptions")] },
            { content: "The lab has not run its held-out test yet, so no accuracy claim can be made." },
        ], sent);
        await page.goto("/trials");
        await expect(page.getByTestId("assistant-privacy")).toBeVisible();
        await ask(page, "How accurate is this lab?");

        await expect(page.getByTestId("copilot-deciding")).toContainText("planning", { timeout: 90_000 });
        await expect(page.getByTestId("copilot-step")).toHaveCount(2, { timeout: 60_000 });
        await expect(page.getByTestId("copilot-step").first()).toContainText("validation report");
        await expect(page.getByTestId("copilot-steps")).toHaveAttribute("aria-label", "What the AI did");
        await expect(page.getByTestId("assistant-source")).toHaveText(NIM, { timeout: 60_000 });
        await expect(page.getByTestId("assistant-reply")).toContainText("no accuracy claim");
        await expect(page.getByTestId("assistant-sent")).toHaveText("This question was sent to an AI provider.");
        await expect(page.locator('[data-testid="copilot-step"][data-status="ok"]')).toHaveCount(2);

        // The second call carried the assistant's request and both tool results, as the proxy requires.
        expect(sent).toHaveLength(2);
        expect(sent[0].tools.length).toBeGreaterThan(0);
        expect(sent[1].messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "tool"]);
        expect(JSON.stringify(sent)).not.toMatch(/nvapi-|sk-ant-/);
        expect(problems).toEqual([]);
    });

    test("the guard replaces a reply with a number no tool produced", async ({ page }) => {
        const sent: never[] = [];
        await scriptModel(page, [{ content: "Semaglutide lowers HbA1c by 9.87 points." }], sent);
        await page.goto("/trials");
        await ask(page, "How accurate is this lab?");
        await expect(page.getByTestId("assistant-reply")).toBeVisible({ timeout: 90_000 });
        await expect(page.getByTestId("assistant-reply")).not.toContainText("9.87");
        await expect(page.getByTestId("assistant-guard")).toContainText("numbers no tool produced");
        await expect(page.getByTestId("assistant-source")).not.toHaveText(NIM);
    });

    test("a proxy failure falls back to the offline planner, and says so", async ({ page }) => {
        const sent: never[] = [];
        await scriptModel(page, ["fail"], sent);
        await page.goto("/trials");
        await ask(page, "How accurate is this lab?");
        await expect(page.getByTestId("assistant-guard")).toContainText("The AI service is unavailable", { timeout: 90_000 });
        await expect(page.getByTestId("run-error")).toHaveCount(0);
    });

    test("a personal question is refused without reaching the model", async ({ page }) => {
        const sent: never[] = [];
        await scriptModel(page, [{ content: "should never be seen" }], sent);
        await page.goto("/trials");
        await page.getByTestId("assistant-panel").getByRole("button", { name: "Should I stop taking my metformin?" }).click();
        await expect(page.getByTestId("assistant-source")).toHaveText("Refusal", { timeout: 90_000 });
        expect(sent).toHaveLength(0);
    });
});

test.describe("with the real model", () => {
    test.skip(!realAI, "spends real quota: set MEDLAB_REAL_AI=1");

    const forward = async (page: Page) => {
        const log: { ms: number; status: number; bytes: number }[] = [];
        await page.route(proxy!, async (route: Route) => {
            if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
            const t = Date.now();
            const body = route.request().postData() ?? "";
            const response = await route.fetch({ headers: { "content-type": "application/json", origin: ALLOWED_ORIGIN } });
            log.push({ ms: Date.now() - t, status: response.status(), bytes: body.length });
            console.log(`REAL-AI call ${log.length}: ${Date.now() - t} ms, status ${response.status()}, sent ${body.length} chars`);
            await route.fulfill({ status: response.status(), headers: CORS, contentType: "application/json", body: await response.text() });
        });
        return log;
    };

    test("asks the real model, with real tools, and shows its work", async ({ page }) => {
        const problems = watchConsole(page);
        if (standIn) {
            const posterior = readFileSync(standIn, "utf8");
            await page.route("**/engine/manifest.json", async (route) => {
                const response = await route.fetch();
                await route.fulfill({ response, json: { ...(await response.json()), results: ["posterior.json"] } });
            });
            await page.route("**/engine/posterior.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: posterior }));
        }
        const log = await forward(page);
        await page.goto("/trials");
        const seen: string[] = [];
        const run = async (question: string) => {
            const t0 = Date.now();
            await ask(page, question);
            if (process.env.MEDLAB_SHOT_DIR) {
                await page.getByTestId("copilot-deciding").waitFor({ timeout: 30_000 }).catch(() => undefined);
                await page.getByTestId("assistant-panel").screenshot({ path: `${process.env.MEDLAB_SHOT_DIR}/real-ai-live-${seen.length}.png` });
            }
            const latest = page.getByTestId("assistant-log").locator("> li").first();
            await expect(latest.getByTestId("assistant-source")).toBeVisible({ timeout: 300_000 });
            const steps = await latest.getByTestId("copilot-step").allInnerTexts();
            seen.push(...steps);
            console.log(`REAL-AI ${((Date.now() - t0) / 1000).toFixed(1)} s | source: ${await latest.getByTestId("assistant-source").textContent()} | steps: ${JSON.stringify(steps)}`);
            const guard = latest.getByTestId("assistant-guard");
            console.log(`REAL-AI guard note: ${(await guard.count()) ? await guard.textContent() : "none"}`);
        };
        await page.getByTestId("engine-ready").waitFor({ timeout: 90_000 });
        await run(standIn ? "Does empagliflozin weaken in kidney disease? Run it and compare with normal kidney function." : "How accurate is this lab, and which of its parameters are assumed?");
        console.log(`REAL-AI proxy calls: ${JSON.stringify(log)}`);
        // Outside results/: with a stand-in posterior these numbers mean nothing.
        if (process.env.MEDLAB_SHOT_DIR) await page.getByTestId("assistant-panel").screenshot({ path: `${process.env.MEDLAB_SHOT_DIR}/real-ai-panel.png` });
        expect(problems).toEqual([]);
    });
});
