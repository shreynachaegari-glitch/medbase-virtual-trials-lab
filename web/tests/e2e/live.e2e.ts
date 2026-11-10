import { expect, test } from "@playwright/test";
import { SCREENS, watchConsole } from "./mock-api";

/**
 * Against a real API, with no mocks. Opt in: start the API, then run
 *   MEDLAB_API=http://localhost:8000 MEDLAB_LIVE=1 npx playwright test live
 * It passes whether or not calibration has finished, by accepting either a result or the API's own
 * message. It reads real values, so it must never be used to write fixtures.
 */
test.skip(!process.env.MEDLAB_LIVE, "needs a running API: set MEDLAB_LIVE=1 and MEDLAB_API");

test("the page loads from the real API with no console errors", async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto("/trials");
    await expect(page.getByTestId("offline-banner")).toHaveCount(0);
    await expect(page.locator("#designer select").first().locator("option")).toHaveCount(4);
    await expect(page.locator("[data-testid=proof-strip], [data-testid=proof-strip-empty]")).toBeVisible();
    await expect(page.locator("#panel-trial")).toContainText("1 to 25");
    expect(problems).toEqual([]);
});

test("a preset gives a result, or the API's plain message", async ({ page }) => {
    await page.goto("/trials");
    await page.getByTestId("preset-sema-empa").click();
    await expect(page.locator("[data-testid=trial-results], [data-testid=run-error]").first()).toBeVisible({ timeout: 120_000 });
    if (await page.getByTestId("trial-results").count()) {
        await expect(page.getByTestId("not-modelled")).toContainText("Hypoglycaemia is not modelled");
        await expect(page.getByTestId("result-notice")).toContainText("Not medical advice");
    } else {
        await expect(page.getByTestId("run-error")).toContainText(/Calibration results are missing|busy|wait a minute/);
    }
});

test("the designer shows its chain, or the API's plain message", async ({ page }) => {
    await page.goto("/trials");
    await page.getByLabel("Target HbA1c effect in points").fill("0.5");
    await page.getByRole("button", { name: "Run the designer" }).click();
    const designer = page.locator("#designer");
    await expect(designer.locator("[data-testid=designer-result], [data-testid=run-error]").first()).toBeVisible({ timeout: 180_000 });
    if (await designer.getByTestId("designer-result").count()) {
        expect(await page.getByTestId("designer-step").count()).toBeGreaterThan(1);
        await expect(page.getByTestId("designer-notice")).toContainText("not a dosing recommendation");
        await expect(designer.locator("[data-testid=designer-design], [data-testid=designer-no-design]")).toBeVisible();
        await expect(designer.getByTestId("not-modelled")).toContainText("Hypoglycaemia is not modelled");
    }
});

for (const [tab, button, result] of [["power", "Estimate power", "power-result"], ["responders", "Find who responds", "responders-result"]] as const) {
    test(`${tab} sends one arm and shows a result, or the API's plain message`, async ({ page }) => {
        await page.goto(`/trials?tab=${tab}`);
        await page.getByRole("button", { name: button }).click();
        await expect(page.locator(`[data-testid=${result}], [data-testid=run-error]`).first()).toBeVisible({ timeout: 120_000 });
        if (await page.getByTestId(result).count()) await expect(page.getByTestId(result).getByTestId("not-modelled")).toContainText("Hypoglycaemia is not modelled");
    });
}

test("a dose past the label limit shows the API's 422", async ({ page }) => {
    await page.goto("/trials");
    await page.locator("input[id$=-mg]").nth(1).fill("50");
    await page.getByRole("button", { name: "Run simulated trial" }).click();
    await expect(page.getByTestId("run-error")).toContainText("empagliflozin 50 mg is outside the modelled range");
});

test("a kidney block shows the API's 422", async ({ page }) => {
    await page.goto("/trials");
    await page.locator("select[id$=-drug]").first().selectOption("metformin");
    await page.locator("input[id$=-mg]").first().fill("1000");
    await page.locator("#trial-egfr_min").fill("20");
    await page.getByRole("button", { name: "Run simulated trial" }).click();
    await expect(page.getByTestId("run-error")).toContainText("Metformin is contraindicated below eGFR 30");
});

test("safety shows real label warnings and real registry rows", async ({ page }) => {
    await page.goto("/trials?tab=safety");
    await expect(page.getByTestId("boxed-warning")).toContainText("thyroid C-cell tumors");
    await expect(page.getByTestId("safety-table")).toContainText("Nausea");
    await expect(page.getByTestId("safety-serious-table")).toContainText("People with any serious event");
    await page.waitForTimeout(800);
    await page.getByTestId("safety-paper").screenshot({ path: `${SCREENS}/live-${test.info().project.name}-safety.png` });
    await page.getByRole("radio", { name: "Metformin" }).click();
    await expect(page.getByTestId("boxed-warning")).toContainText("lactic acidosis");
    await expect(page.getByTestId("no-placebo")).toBeVisible();
    await page.getByRole("radio", { name: "Sitagliptin" }).click();
    await expect(page.getByTestId("boxed-warning")).toHaveCount(0);
});

test("the published model runs and compares scenarios", async ({ page }) => {
    await page.goto("/trials?tab=progression");
    await expect(page.getByTestId("progression-summary")).toHaveCount(2);
    await expect(page.getByTestId("progression-limitations")).toContainText("not a clinically validated individual digital twin");
    await expect(page.getByTestId("progression-limitations")).toContainText("10.1210/en.2015-1564");
    await expect(page.getByTestId("progression-summary").first()).toContainText("Day 1100");
    await page.waitForTimeout(1200);
    await page.locator("#panel-progression").screenshot({ path: `${SCREENS}/live-${test.info().project.name}-progression.png` });
});

test("parameters come from the real list", async ({ page }) => {
    await page.goto("/trials?tab=proof");
    await expect(page.getByTestId("parameters-table")).toContainText("Topp et al. 2000");
});

test("the assistant refuses, escalates, and answers from tools", async ({ page }) => {
    await page.goto("/trials?tab=assistant");
    const panel = page.getByTestId("assistant-panel");
    await panel.getByRole("button", { name: "Should I stop taking my metformin?" }).click();
    await expect(page.getByTestId("assistant-source").first()).toHaveText("Refusal");
    await panel.getByLabel("Your question for the Lab Assistant").fill("I took too many pills and my chest hurts");
    await panel.getByRole("button", { name: "Send question" }).click();
    await expect(page.getByTestId("assistant-emergency")).toContainText("emergency services");
    await panel.getByText("More questions to try").click(); // four starters show; the rest are folded
    await panel.getByRole("button", { name: "What side effects were reported for semaglutide?" }).click();
    await expect(page.getByTestId("assistant-tools").first()).toContainText("Read reported side effects");
});
