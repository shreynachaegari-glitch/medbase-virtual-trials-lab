import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import * as fx from "../fixtures/api";
import { mockApi, SCREENS, watchConsole } from "./mock-api";

const noOverflow = async (page: Page) => {
    const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(widths.doc, `page is ${widths.doc}px wide in a ${widths.win}px window`).toBeLessThanOrEqual(widths.win);
};

/** Waits out the JavaScript-driven entrance animations, which the screenshot option cannot freeze. */
const shot = async (page: Page, name: string, projectName: string, fullPage = true) => {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SCREENS}/${projectName}-${name}.png`, fullPage, animations: "disabled" });
};

const openTab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();

const runPreset = async (page: Page, id: string) => {
    await page.getByTestId(`preset-${id}`).click();
};

test.describe("with the API up", () => {
    let problems: string[];

    test.beforeEach(async ({ page }) => {
        problems = watchConsole(page);
        await mockApi(page);
    });

    test.afterEach(async ({ page }) => {
        await noOverflow(page);
        expect(problems).toEqual([]);
    });

    test("is reachable from the header, and states what it is", async ({ page, isMobile }) => {
        await page.goto("/");
        if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
        await page.getByRole("link", { name: "Virtual Trials" }).first().click();
        await expect(page).toHaveURL(/\/trials$/);
        await expect(page.getByRole("heading", { level: 1 })).toContainText("simulated type 2 diabetes drug trial");
        await expect(page.getByTestId("research-notice")).toHaveText("Research and education only. Not medical advice.");
    });

    test("hero shows the proof strip with a failure as loud as a pass", async ({ page }, info) => {
        await page.goto("/trials");
        const strip = page.getByTestId("proof-strip");
        await expect(strip).toContainText("6");
        await expect(strip).toContainText("0.31");
        const fail = strip.locator('[data-testid=check-badge][data-state=fail]');
        const pass = strip.locator('[data-testid=check-badge][data-state=pass]').first();
        await expect(fail).toHaveCount(1);
        await expect(fail).toHaveText("FAIL");
        const [failBox, passBox] = [await fail.boundingBox(), await pass.boundingBox()];
        expect(failBox?.height).toBe(passBox?.height);
        expect(failBox?.width).toBe(passBox?.width);
        const weight = (loc: typeof fail) => loc.evaluate((el) => `${getComputedStyle(el).fontWeight}/${getComputedStyle(el).fontSize}`);
        expect(await weight(fail)).toBe(await weight(pass));
        await shot(page, "hero", info.project.name, false);
    });

    test("the page says it is using the live server, and results say so too", async ({ page }) => {
        await page.goto("/trials");
        await expect(page.getByTestId("mode-badge")).toHaveText("Live server");
        await runPreset(page, "sema-empa");
        await expect(page.getByTestId("trial-results").getByTestId("result-source")).toHaveText("Live server");
    });

    test("proof shows V6, chain, coverage, trials, sensitivity and the reading note", async ({ page }, info) => {
        await page.goto("/trials?tab=proof");
        await expect(page.locator('[data-check="V6"]')).toContainText("Beats a simple rival");
        const chain = page.getByTestId("chain-panel");
        await expect(chain).toContainText("1.02");
        await expect(chain).toContainText("61.5");
        await expect(chain).toContainText("Sealed run");
        const rival = page.getByTestId("rival-panel");
        await expect(rival).toContainText("0.40");
        await expect(rival).toContainText("\u22120.09");
        await expect(rival).toContainText("\u22120.20 to \u22120.01");
        const coverage = page.getByTestId("coverage-panel");
        await expect(coverage).toContainText("40%");
        await expect(coverage).toContainText("70%");
        await expect(coverage).toContainText("0.90 pts");
        const byTrial = page.getByTestId("by-trial-table");
        await expect(byTrial).toContainText("Fixture RENAL moderate");
        await expect(byTrial.getByTestId("thin-tag")).toHaveCount(1);
        await expect(page.getByTestId("contrast-table").getByTestId("thin-tag")).toHaveCount(2);
        await expect(page.getByTestId("null-predicted").first()).toBeVisible();
        await expect(page.getByTestId("contrast-table")).toContainText("Simple rival");
        await expect(page.getByTestId("sensitivity-panel")).toContainText("rtg0=200");
        await expect(page.getByTestId("renal-panel")).toContainText("FIXTURE reference");
        await expect(page.getByTestId("reading-note")).toContainText("largely built into the structure");
        await expect(page.locator('[data-check="V5"]')).toContainText("largely built into the model\u2019s structure".replace("\u2019", "'"));
        await shot(page, "proof-v2", info.project.name);
    });

    test("the provider notice shows when a server could send questions on", async ({ page }) => {
        await page.goto("/trials");
        await expect(page.getByTestId("assistant-privacy")).toBeVisible();
    });

    test("the first screen invites action straight away", async ({ page }, info) => {
        await page.goto("/trials");
        const box = page.getByLabel("Your question for the Lab Assistant");
        await expect(box).toBeEditable();
        const height = page.viewportSize()!.height;
        expect((await box.boundingBox())!.y).toBeLessThan(height);
        // The copilot is on screen here, so nothing in the corner competes with it.
        await expect(page.getByTestId("copilot-launcher")).toHaveCount(0);
        await expect(page.getByRole("heading", { level: 1 })).toContainText("simulated");
        await expect(page.getByTestId("quick-proof")).toHaveCount(0);
        await expect(page.getByTestId("surrogate")).toBeVisible();
        expect(page.locator("#designer")).toBeTruthy();
        await shot(page, "first-screen", info.project.name, false);
    });

    test("see it in the body: real numbers from the run, labelled simulated, brightness in proportion", async ({ page }, info) => {
        await page.goto("/trials");
        await runPreset(page, "sema-empa");
        const section = page.getByTestId("body-response");
        await expect(section).toContainText("See it in the body");
        const row = (key: string) => section.locator(`[data-signal="${key}"]`);
        await expect(row("liver_glucose_output_change_pct")).toContainText("\u221212.5 %");
        await expect(row("liver_glucose_output_change_pct")).toContainText("simulated");
        await expect(row("insulin_secretion_capacity_change_pct")).toContainText("+18.0 %");
        await expect(row("urinary_glucose_change_g_day")).toContainText("+1.0 g/day");
        await expect(row("weight_change_kg")).toContainText("\u22124.0 kg");
        await expect(section).toContainText("\u221230.0 mg/dL");
        // Against the same signals in this run's other arms. The second arm has the largest urinary change.
        const scale = async (key: string) => {
            await page.waitForTimeout(900);
            const transform = await row(key).getByTestId("body-signal-bar").evaluate((el) => (el as HTMLElement).style.transform);
            return Number(/scaleX\(([\d.]+)\)/.exec(transform)?.[1]);
        };
        expect(await scale("liver_glucose_output_change_pct")).toBeCloseTo(1, 3);
        expect(await scale("urinary_glucose_change_g_day")).toBeCloseTo(1 / 60, 3);
        await section.getByRole("radio", { name: "Empagliflozin 25 mg/day" }).click();
        await expect(row("urinary_glucose_change_g_day")).toContainText("+60.0 g/day");
        expect(await scale("urinary_glucose_change_g_day")).toBeCloseTo(1, 3);
        await expect(section).toContainText("Human Reference Atlas");
        await shot(page, "body-response", info.project.name, false);
    });

    test("a run without organ signals shows no body section, rather than inventing one", async ({ page }) => {
        await page.route("**/api/trial", async (route) => {
            const body = fx.trialFor(route.request().postDataJSON());
            for (const arm of Object.values(body.arms)) delete arm.organ_signals;
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        });
        await page.goto("/trials");
        await runPreset(page, "sema-empa");
        await expect(page.getByTestId("trial-results")).toContainText("HbA1c over time");
        await expect(page.getByTestId("body-response")).toHaveCount(0);
    });

    test("AI designer shows the whole chain and a simulated design, before anything else", async ({ page }, info) => {
        await page.goto("/trials");
        const designer = page.locator("#designer");
        const tabs = page.getByRole("tablist", { name: "Virtual Trials workspace" });
        expect((await designer.boundingBox())!.y).toBeLessThan((await tabs.boundingBox())!.y);
        await designer.getByRole("button", { name: "Run the designer" }).click();
        await expect(page.getByTestId("designer-step")).toHaveCount(5);
        await expect(page.getByTestId("designer-chain")).toContainText("Bisect: try 0.447 mg/week");
        await expect(page.getByTestId("designer-chain")).toContainText("Target not met");
        const design = page.getByTestId("designer-design");
        await expect(design).toContainText("Simulated study design");
        await expect(design).toContainText("Semaglutide 0.5 mg/week");
        // The notice sits above the design, and nothing presents the design as advice.
        const notice = page.getByTestId("designer-notice");
        await expect(notice).toContainText("not a dosing recommendation");
        expect((await notice.boundingBox())!.y).toBeLessThan((await design.boundingBox())!.y);
        await expect(design).not.toContainText(/recommend|suggested dose|proposed/i);
        await expect(designer.getByTestId("validation-panel")).toBeVisible();
        await expect(designer.getByTestId("not-modelled")).toContainText("Hypoglycaemia is not modelled");
        await shot(page, "designer", info.project.name);

        // The proposal carries through into a full trial.
        await design.getByRole("button", { name: "Run this design as a full simulated trial" }).click();
        await expect(page.getByTestId("trial-results")).toContainText("26 weeks · 100 per arm");
    });

    test("AI designer states it when no design meets the goal", async ({ page }) => {
        await page.goto("/trials");
        await page.getByLabel("Target HbA1c effect in points").fill("2.8");
        await page.getByRole("button", { name: "Run the designer" }).click();
        await expect(page.getByTestId("designer-no-design")).toContainText("No design met this goal");
        await expect(page.getByTestId("designer-step")).toHaveCount(1);
    });

    test("preset runs a trial and shows every result beside its status", async ({ page }, info) => {
        await page.goto("/trials");
        await runPreset(page, "sema-empa");
        const results = page.getByTestId("trial-results");
        await expect(results).toContainText("Simulated trial result");
        await expect(results).toContainText("HbA1c over time");
        await expect(results).toContainText("Fasting glucose");
        await expect(results).toContainText("Weight");
        await expect(results).toContainText("Urinary glucose");
        await expect(results).toContainText("92%");
        await expect(results.getByTestId("enrolment-panel")).toContainText("195");
        await expect(results.getByTestId("enrolment-panel")).toContainText("72.3");
        await expect(results.getByTestId("result-notice")).toContainText("Not medical advice");
        await expect(results.getByTestId("thin-pool")).toHaveCount(0);
        await expect(results.getByTestId("not-modelled")).toContainText("Hypoglycaemia is not modelled");
        await expect(results.getByTestId("label-flags")).toHaveCount(0);
        await shot(page, "trial-results", info.project.name);
    });

    test("kidney preset compares two ranges and warns about the thin pool", async ({ page }, info) => {
        const bodies: { egfr_min: number; egfr_max: number }[] = [];
        page.on("request", (r) => {
            if (r.url().endsWith("/api/trial")) bodies.push(r.postDataJSON());
        });
        await page.goto("/trials");
        await runPreset(page, "kidney");
        const summary = page.getByTestId("strata-summary");
        await expect(summary).toContainText("eGFR 30 to 60");
        await expect(summary).toContainText("eGFR 90 and above");
        await expect(summary).toContainText("0.60 points weaker at eGFR 30 to 60");
        await expect(summary.getByTestId("thin-pool")).toContainText("Only 17 real participants");
        await expect(page.getByTestId("enrolment-panel")).toContainText("17");
        expect(bodies.map((b) => [b.egfr_min, b.egfr_max])).toEqual([[30, 60], [90, 400]]);
        await shot(page, "kidney", info.project.name);
    });

    test("candidate is always labelled hypothetical, in the form and in the results", async ({ page }, info) => {
        await page.goto("/trials");
        await runPreset(page, "candidate");
        await expect(page.getByTestId("candidate-form")).toContainText("Hypothetical");
        await expect(page.getByTestId("candidate-form")).toContainText("placeholders");
        await expect(page.getByTestId("trial-results")).toHaveCount(0);
        await page.getByRole("button", { name: "Run simulated trial" }).click();
        const results = page.getByTestId("trial-results");
        await expect(results).toContainText("(hypothetical)");
        await expect(results.getByText("Hypothetical", { exact: true }).first()).toBeVisible();
        await expect(results.getByTestId("validation-scope")).toContainText("Validation does not apply");
        await shot(page, "candidate", info.project.name);
    });

    test("no way to enter your own labs exists", async ({ page }) => {
        await page.goto("/trials");
        await expect(page.getByText("There is no mode for entering your own.")).toBeVisible();
        await expect(page.getByLabel(/my (hba1c|glucose|labs)/i)).toHaveCount(0);
    });

    test("proof tab shows every miss, the band and identity line, and the parameters", async ({ page }, info) => {
        await page.goto("/trials?tab=proof");
        const table = page.getByTestId("contrast-table");
        await expect(page.getByTestId("contrast-row")).toHaveCount(6);
        await expect(table.locator('[data-miss="true"]')).toHaveCount(2);
        await expect(page.getByTestId("contrast-row").first()).toContainText("Fixture drug 2 mg");
        await page.getByRole("button", { name: /^Misses/ }).click();
        await expect(page.getByTestId("contrast-row")).toHaveCount(2);
        await page.getByRole("button", { name: /^All/ }).first().click();
        await expect(page.getByTestId("seal-record")).toContainText("sealed");
        await expect(page.getByText("What sealed validation means")).toBeVisible();
        await expect(page.getByText("Identity line")).toBeVisible();
        const parameters = page.getByTestId("parameters-table");
        await expect(parameters).toContainText("published");
        await expect(parameters).toContainText("calibrated");
        await expect(parameters).toContainText("assumed");
        await expect(parameters).toContainText("Fixture citation");
        // The scatter can be read from the keyboard.
        await page.getByRole("group", { name: /Predicted against observed/ }).focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("status").filter({ hasText: "Predicted" }).first()).toContainText("Observed");
        await shot(page, "proof", info.project.name);
    });

    test("who responds says it describes the model, not biology", async ({ page }, info) => {
        await page.goto("/trials?tab=responders");
        await expect(page.getByTestId("responders-model-note")).toContainText("describes the model, not biology");
        await page.getByRole("button", { name: "Find who responds" }).click();
        await expect(page.getByTestId("subgroups")).toContainText("baseline fasting glucose above 177.1, up to 259.2");
        await expect(page.getByTestId("responders-model-note")).toContainText("cannot discover biology");
        await expect(page.getByTestId("responders-result").getByTestId("validation-panel")).toBeVisible();
        await expect(page.getByTestId("responders-result").getByTestId("not-modelled")).toContainText("Hypoglycaemia is not modelled");
        await shot(page, "responders", info.project.name);
    });

    test("power tab reads the answer from the API", async ({ page }, info) => {
        await page.goto("/trials?tab=power");
        await page.getByRole("button", { name: "Estimate power" }).click();
        await expect(page.getByTestId("power-answer")).toContainText("200");
        await expect(page.getByTestId("power-result").getByTestId("validation-panel")).toBeVisible();
        await expect(page.getByTestId("power-result").getByTestId("not-modelled")).toContainText("Hypoglycaemia is not modelled");
        await shot(page, "power", info.project.name);
    });

    test("safety is on paper, with warnings above the table and absence explained", async ({ page }, info) => {
        await page.goto("/trials?tab=safety");
        const paper = page.getByTestId("safety-paper");
        await expect(paper).toContainText("as reported in a real trial, not simulated");
        await expect(paper).toContainText("23.8%");
        await expect(paper.getByRole("link", { name: /NCT00000000/ })).toHaveAttribute("href", /clinicaltrials\.gov\/study\/NCT00000000/);
        expect(await paper.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));

        // Warnings come first, and a boxed warning is the loudest thing there.
        const boxed = page.getByTestId("boxed-warning");
        await expect(boxed).toContainText("Boxed warning: fixture boxed risk");
        const table = page.getByTestId("safety-table");
        expect((await page.getByTestId("label-warnings").boundingBox())!.y).toBeLessThan((await table.boundingBox())!.y);
        expect((await boxed.boundingBox())!.y).toBeLessThan((await page.getByText("Other warnings on the label").boundingBox())!.y);
        await expect(paper).toContainText("FIXTURE label source");

        // An absent event is never presented as none, and common events are not buried by rare ones.
        await expect(table).toContainText("Not reported");
        await expect(page.getByTestId("absent-note")).toContainText("not reported at the sponsor\u2019s threshold");
        await expect(table).not.toContainText(/\bnone\b/i);
        await expect(table.locator("tbody tr").first()).toContainText("Nausea");
        const serious = page.getByTestId("safety-serious-table");
        await expect(serious).toContainText("Fixture serious event");
        await expect(serious).toContainText("People with any serious event");

        // Long records are cut to the most frequent events until asked.
        await expect(table.locator("tbody tr")).toHaveCount(12);
        await paper.getByRole("button", { name: /Show all 16 reported/ }).click();
        await expect(table.locator("tbody tr")).toHaveCount(16);
        await shot(page, "safety", info.project.name);

        await page.getByTestId("safety-tab").getByRole("radio", { name: "Metformin" }).click();
        await expect(paper).toContainText("Fixture metformin arm");
        await expect(page.getByTestId("no-placebo")).toBeVisible();
        await expect(table).toContainText("Comparator");
        await page.getByTestId("safety-tab").getByRole("radio", { name: "Empagliflozin" }).click();
        await expect(paper).toContainText("Fixture empagliflozin arm");
        await expect(boxed).toHaveCount(0);
    });

    test("disease progression is labelled, compares scenarios, and shows its limits", async ({ page }, info) => {
        const runs: string[] = [];
        page.on("request", (r) => {
            if (r.url().endsWith("/api/progression/run")) runs.push(r.postDataJSON().scenario);
        });
        await page.goto("/trials?tab=progression");
        await expect(page.getByTestId("progression-label")).toContainText("One model scenario. Not a drug effect, and not any person");
        await expect(page.getByTestId("progression-summary")).toHaveCount(2);
        await expect(page.getByTestId("progression-limitations")).toContainText("FIXTURE limitation");
        await expect(page.getByTestId("progression-limitations")).toContainText("Fixture model paper");
        await expect(page.getByTestId("progression-summary").first()).toContainText("Day 1100");
        await expect(page.locator("#panel-progression")).toContainText("126 mg/dL, a fasting reference line");
        await page.getByRole("button", { name: "Fixture earlier transition" }).click();
        await expect(page.getByTestId("progression-summary")).toHaveCount(3);
        await page.getByRole("group", { name: /Glucose, beta-cell state and insulin sensitivity/ }).focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator("#panel-progression").getByRole("status").last()).toContainText("mg/dL");
        await shot(page, "progression", info.project.name);
        // Toggling a scenario back on does not spend another request.
        const before = runs.length;
        await page.getByRole("button", { name: "Fixture earlier transition" }).click();
        await page.getByRole("button", { name: "Fixture earlier transition" }).click();
        await expect(page.getByTestId("progression-summary")).toHaveCount(3);
        expect(runs.length).toBe(before);
        // Changing settings is sent, and is marked in the result.
        await page.getByLabel("Intervention day").fill("900");
        await page.getByRole("button", { name: "Apply changes" }).click();
        await expect(page.getByTestId("progression-summary").first()).toContainText("Day 900");
        await expect(page.getByTestId("progression-summary").first()).toContainText("with your changes");
    });

    test("assistant shows tools, source, guard note, refusals and emergencies, and leaves the chatbot alone", async ({ page }, info) => {
        await page.goto("/trials");
        const panel = page.getByTestId("assistant-panel");
        await expect(page.getByTestId("assistant-privacy")).toHaveText("Questions may be sent to an AI provider. Don\u2019t enter personal or health details.");
        await panel.getByRole("button", { name: "How accurate is this lab?" }).click();
        await expect(page.getByTestId("assistant-source").first()).toHaveText("Offline planner");
        await expect(page.getByTestId("assistant-guard").first()).toContainText("no tool produced");
        await expect(page.getByTestId("assistant-tools").first()).toContainText("Read the validation report");
        await expect(page.getByTestId("assistant-sent").first()).toHaveText("This question was not sent to an AI provider.");
        await panel.getByRole("button", { name: "Should I stop taking my metformin?" }).click();
        await expect(page.getByTestId("assistant-source").first()).toHaveText("Refusal");
        const box = panel.getByLabel("Your question for the Lab Assistant");
        await box.fill("Can I combine glipizide with this?");
        await panel.getByRole("button", { name: "Send question" }).click();
        await expect(page.getByTestId("assistant-source").first()).toHaveText("Not modelled");
        await box.fill("\u0915\u094d\u092f\u093e \u092e\u0941\u091d\u0947 \u0926\u0935\u093e \u0932\u0947\u0928\u0940 \u091a\u093e\u0939\u093f\u090f?");
        await panel.getByRole("button", { name: "Send question" }).click();
        await expect(page.getByTestId("assistant-source").first()).toHaveText("English only");
        await box.fill("Compare semaglutide and empagliflozin");
        await panel.getByRole("button", { name: "Send question" }).click();
        await expect(page.getByTestId("assistant-source").first()).toHaveText("Claude");
        await expect(page.getByTestId("assistant-tools").first()).toContainText("Searched ClinicalTrials.gov, failed");
        await expect(page.getByTestId("assistant-tools").first()).toBeVisible();
        await expect(page.getByTestId("assistant-sent").first()).toHaveText("This question was sent to an AI provider.");
        await box.fill("I took an overdose and my chest hurts");
        await panel.getByRole("button", { name: "Send question" }).click();
        const emergency = page.getByTestId("assistant-emergency");
        await expect(emergency).toContainText("Contact local emergency services");
        await expect(emergency).toHaveAttribute("role", "alert");
        const size = await emergency.locator("p").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(size).toBeGreaterThanOrEqual(18);
        await shot(page, "assistant", info.project.name);
    });

    test("kidney-range flags from the API sit prominently beside the result", async ({ page }) => {
        await page.goto("/trials");
        await page.locator("select[id$=-drug]").first().selectOption("sitagliptin");
        await page.locator("input[id$=-mg]").first().fill("100");
        await page.locator("#trial-egfr_max").fill("60");
        await page.getByRole("button", { name: "Run simulated trial" }).click();
        const flags = page.getByTestId("trial-results").getByTestId("label-flags");
        await expect(flags).toContainText("Sitagliptin label");
        const panel = page.getByTestId("trial-results").getByTestId("validation-panel");
        expect((await flags.boundingBox())!.y).toBeLessThan((await panel.boundingBox())!.y);
    });

    test("power and who-responds send exactly one active arm, chosen by a single-drug picker", async ({ page }) => {
        const sent: { arms: { drug?: string; mg?: number }[]; dropout: number }[] = [];
        page.on("request", (r) => {
            if (/\/api\/(power|responders)$/.test(r.url())) sent.push(r.postDataJSON());
        });
        await page.goto("/trials?tab=power");
        const picker = page.locator("#power-arm");
        await expect(picker.locator("option")).toHaveCount(4);
        await picker.selectOption("sitagliptin");
        await expect(page.locator("#power-arm-mg")).toHaveValue("12.5");
        await expect(page.getByTestId("power-tab")).toContainText("12.5 to 100");
        await page.locator("#power-arm-mg").fill("50");
        await page.getByRole("button", { name: "Estimate power" }).click();
        await expect(page.getByTestId("power-result")).toContainText("Sitagliptin 50 mg/day");
        await openTab(page, "Who responds");
        await page.getByRole("button", { name: "Find who responds" }).click();
        await expect(page.getByTestId("responders-result")).toBeVisible();
        expect(sent.map((b) => b.arms)).toEqual([[{ drug: "sitagliptin", mg: 50 }], [{ drug: "semaglutide", mg: 1 }]]);
    });

    test("dropout defaults to none and is labelled a what-if", async ({ page }) => {
        const sent: { dropout: number }[] = [];
        page.on("request", (r) => {
            if (r.url().endsWith("/api/trial")) sent.push(r.postDataJSON());
        });
        await page.goto("/trials");
        await expect(page.getByLabel("Dropout what-if, %")).toHaveValue("0");
        await expect(page.getByText("A what-if, not a measured quantity")).toBeVisible();
        await runPreset(page, "sema-empa");
        await expect(page.getByTestId("trial-results")).not.toContainText("dropout");
        expect(sent[0].dropout).toBe(0);
    });

    test("dose limits come from the API, and going past one reaches the API's own message", async ({ page }) => {
        const sent: unknown[] = [];
        page.on("request", (r) => {
            if (r.url().endsWith("/api/trial")) sent.push(r.postDataJSON());
        });
        await page.route("**/api/trial", (route) => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "empagliflozin 50 mg is outside the modelled range 1-25 mg" }) }));
        await page.goto("/trials");
        const dose = page.locator("input[id$=-mg]").nth(1);
        await expect(dose).toHaveAttribute("max", "25");
        await expect(page.locator("#panel-trial")).toContainText("1 to 25");
        await dose.fill("50");
        await page.getByRole("button", { name: "Run simulated trial" }).click();
        await expect(page.getByTestId("run-error")).toContainText("outside the modelled range 1-25 mg");
        expect(sent).toHaveLength(1);
    });

    test("tabs work from the keyboard, with a visible focus ring", async ({ page }) => {
        await page.goto("/trials");
        const first = page.getByRole("tab", { name: "Trial", exact: true });
        await first.focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("tab", { name: "Disease progression" })).toBeFocused();
        await expect(page).toHaveURL(/tab=progression/);
        const ring = await page.getByRole("tab", { name: "Disease progression" }).evaluate((el) => getComputedStyle(el).boxShadow);
        // The ring only appears for keyboard focus, which this was.
        expect(ring).not.toBe("none");
        await page.keyboard.press("End");
        await expect(page.getByRole("tab", { name: "Safety" })).toBeFocused();
    });

    test("automated accessibility checks pass on every tab", async ({ page }) => {
        await page.goto("/trials");
        await runPreset(page, "sema-empa");
        await expect(page.getByTestId("trial-results")).toBeVisible();
        const check = async (label: string) => {
            await page.waitForTimeout(1000); // let entrance animations settle, so contrast reads true colours
            const results = await new AxeBuilder({ page: page as never }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
            const found = results.violations.map((v) => ({ tab: label, id: v.id, nodes: v.nodes.map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1]?.trim()}`).slice(0, 6) }));
            expect(found).toEqual([]);
        };
        await check("trial");
        await page.getByRole("button", { name: "Run the designer" }).click();
        await expect(page.getByTestId("designer-design")).toBeVisible();
        await check("designer");
        for (const name of ["Disease progression", "Proof", "Safety"]) {
            await openTab(page, name);
            await check(name);
        }
        await openTab(page, "Who responds");
        await page.getByRole("button", { name: "Find who responds" }).click();
        await expect(page.getByTestId("responders-result")).toBeVisible();
        await check("responders");
        await openTab(page, "Power");
        await page.getByRole("button", { name: "Estimate power" }).click();
        await expect(page.getByTestId("power-result")).toBeVisible();
        await check("power");
    });
});

test.describe("following the validation report", () => {
    const withReport = (page: Page, patch: Partial<typeof fx.validation>) =>
        mockApi(page, {
            override: async (route, path) => {
                if (path !== "/api/validation") return false;
                await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...fx.validation, ...patch }) });
                return true;
            },
        });

    test("takes pass marks from the report, not from the page", async ({ page }) => {
        await withReport(page, { pass_marks: { mae_max: 0.123, within_0_30_min: 0.91, coverage_95_min: 0.97, renal_tolerance: 0.456 } });
        await page.goto("/trials?tab=proof");
        await expect(page.locator('[data-check="V3"]')).toContainText("0.123");
        await expect(page.locator('[data-check="V3"]')).toContainText("91%");
        await expect(page.locator('[data-check="V4"]')).toContainText("97%");
        await expect(page.locator('[data-check="V5"]')).toContainText("0.456");
    });

    test("flags an unconverged chain next to the hero and next to every result", async ({ page }, info) => {
        await withReport(page, { converged: false, max_split_rhat: 1.31, length_over_tau: 9.2 });
        await page.goto("/trials");
        await expect(page.getByTestId("proof-strip").getByTestId("chain-flag")).toContainText("did not converge");
        await runPreset(page, "sema-empa");
        const panel = page.getByTestId("trial-results").getByTestId("validation-panel");
        await expect(panel.getByTestId("chain-flag")).toContainText("1.31");
        await expect(panel.getByTestId("chain-flag")).toContainText("9.2");
        if (info.project.name === "mobile") await expect(page.getByTestId("trial-results").getByTestId("validation-strip")).toContainText("Chain not converged");
        await openTab(page, "Proof");
        await expect(page.getByTestId("chain-panel").locator("[data-testid=check-badge]")).toHaveAttribute("data-state", "fail");
    });

    test("flags an unconverged chain even before validation has run", async ({ page }) => {
        await mockApi(page, {
            override: async (route, path) => {
                if (path === "/api/validation") {
                    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Validation has not been run." }) });
                    return true;
                }
                if (path === "/api/calibration") {
                    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...fx.calibration, converged: false, max_split_rhat: 1.4 }) });
                    return true;
                }
                return false;
            },
        });
        await page.goto("/trials");
        await runPreset(page, "sema-empa");
        await expect(page.getByTestId("trial-results").getByTestId("chain-flag")).toContainText("1.40");
    });

    test("a failed V6 has the same weight as any pass", async ({ page }) => {
        await withReport(page, { score: { ...fx.validation.score, beats_null: false } });
        await page.goto("/trials?tab=proof");
        const fail = page.locator('[data-check="V6"]').getByTestId("check-badge");
        const pass = page.locator('[data-check="V4"]').getByTestId("check-badge");
        await expect(fail).toHaveText("FAIL");
        expect((await fail.boundingBox())!.width).toBe((await pass.boundingBox())!.width);
        expect((await fail.boundingBox())!.height).toBe((await pass.boundingBox())!.height);
    });

    test("126 and 80% are labelled as reference lines", async ({ page }) => {
        await mockApi(page);
        await page.goto("/trials?tab=progression");
        await expect(page.locator("#panel-progression")).toContainText("126 mg/dL, a fasting reference line");
        await page.getByRole("tab", { name: "Power", exact: true }).click();
        await page.getByRole("button", { name: "Estimate power" }).click();
        await expect(page.getByTestId("power-result")).toContainText("80% power, a reference line");
        await expect(page.getByTestId("power-answer")).toContainText("80% reference");
    });
});

test.describe("waiting and failing", () => {
    test("shows honest progress, keeps inputs editable, and flags results as stale", async ({ page }, info) => {
        const problems = watchConsole(page);
        await mockApi(page, { delayMs: 1800 });
        await page.goto("/trials");
        await runPreset(page, "sema-empa");
        const progress = page.getByTestId("run-progress");
        await expect(progress).toBeVisible();
        await expect(progress).toContainText("Simulating");
        await expect(progress).not.toContainText("%");
        await shot(page, "progress", info.project.name, false);
        const weeks = page.locator("#trial-weeks");
        await expect(weeks).toBeEditable();
        await weeks.fill("12");
        await expect(page.getByTestId("trial-results")).toContainText("Simulated trial result");
        await expect(progress).toHaveCount(0);
        await expect(page.getByTestId("stale-note")).toContainText("changed the design");
        expect(problems).toEqual([]);
    });

    test("a reader can stop waiting", async ({ page }) => {
        await mockApi(page, { delayMs: 5000 });
        await page.goto("/trials");
        await runPreset(page, "sema-empa");
        await page.getByRole("button", { name: "Stop waiting" }).click();
        await expect(page.getByTestId("run-progress")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Run simulated trial" })).toBeEnabled();
    });

    const failing = [
        { name: "422 with the app's message", status: 422, body: { detail: "only 3 eligible NHANES participants; relax the criteria" }, expected: "only 3 eligible NHANES participants; relax the criteria", retry: false },
        { name: "422 with FastAPI's list", status: 422, body: { detail: [{ loc: ["body", "weeks"], msg: "Input should be less than or equal to 156" }] }, expected: "Weeks: Input should be less than or equal to 156", retry: false },
        { name: "429", status: 429, body: { detail: "Too many requests." }, expected: "wait a minute", retry: true },
        { name: "503 busy", status: 503, body: { detail: "The lab is busy. Please try again shortly." }, expected: "The lab is busy", retry: true },
        { name: "422 for a renal block", status: 422, body: { detail: "Metformin is contraindicated below eGFR 30 per its label, so this lab does not simulate it there." }, expected: "Metformin is contraindicated below eGFR 30", retry: false },
        { name: "503 uncalibrated", status: 503, body: { detail: "Calibration results are missing on this server." }, expected: "Calibration results are missing", retry: true },
    ];
    for (const { name, status, body, expected, retry } of failing) {
        test(`explains ${name} in plain language`, async ({ page }) => {
            const problems = watchConsole(page);
            await mockApi(page, {
                override: async (route, path) => {
                    if (path !== "/api/trial") return false;
                    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
                    return true;
                },
            });
            await page.goto("/trials");
            await runPreset(page, "sema-empa");
            const error = page.getByTestId("run-error");
            await expect(error).toContainText(expected);
            await expect(error.getByRole("button", { name: "Try again" })).toHaveCount(retry ? 1 : 0);
            expect(problems).toEqual([]);
        });
    }

    test("retry after a busy lab succeeds", async ({ page }) => {
        let calls = 0;
        await mockApi(page, {
            override: async (route, path) => {
                if (path !== "/api/trial" || ++calls > 1) return false;
                await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "The lab is busy. Please try again shortly." }) });
                return true;
            },
        });
        await page.goto("/trials");
        await runPreset(page, "sema-empa");
        await page.getByTestId("run-error").getByRole("button", { name: "Try again" }).click();
        await expect(page.getByTestId("trial-results")).toBeVisible();
        await expect(page.getByTestId("run-error")).toHaveCount(0);
    });

    test("a blank field is caught at the field, with focus moved to it", async ({ page }) => {
        await mockApi(page);
        await page.goto("/trials");
        await page.locator("#trial-weeks").fill("");
        await page.getByRole("button", { name: "Run simulated trial" }).click();
        await expect(page.locator("#trial-weeks-error")).toHaveText("Enter a number for weeks.");
        await expect(page.locator("#trial-weeks")).toBeFocused();
    });

    test("validation that has not been run is said plainly, with no claim", async ({ page }, info) => {
        const problems = watchConsole(page);
        await mockApi(page, {
            override: async (route, path) => {
                if (path === "/api/validation") {
                    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Validation has not been run." }) });
                    return true;
                }
                if (path === "/api/health") {
                    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...fx.health, calibrated: false, validated: false }) });
                    return true;
                }
                return false;
            },
        });
        await page.goto("/trials");
        await expect(page.getByTestId("proof-strip-empty")).toContainText("has not been run yet");
        await expect(page.getByTestId("uncalibrated-banner")).toBeVisible();
        await expect(page.locator("[data-testid=check-badge]")).toHaveCount(0);
        await shot(page, "not-validated", info.project.name, false);
        await openTab(page, "Proof");
        await expect(page.getByTestId("proof-tab")).toContainText("no contrasts to show");
        expect(problems).toEqual([]);
    });
});

test.describe("with the simulator offline", () => {
    const offline = async (page: Page, saved: Record<string, unknown> = {}) => {
        await page.route("**/api/**", (route) => route.abort("connectionrefused"));
        await page.route("**/engine/**", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "missing" }));
        await page.route("**/snapshots/**", (route) => {
            const file = new URL(route.request().url()).pathname.split("/").pop() ?? "";
            if (file in saved) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saved[file]) });
            return route.fulfill({ status: 404, contentType: "text/plain", body: "missing" });
        });
    };

    test("loads saved runs and labels every one of them", async ({ page }, info) => {
        const problems = watchConsole(page);
        const body = { arms: [{ drug: "semaglutide", mg: 1 }, { drug: "empagliflozin", mg: 25 }], weeks: 30, n_per_arm: 200, egfr_min: 30, egfr_max: 400 };
        await offline(page, {
            "validation.json": fx.validation,
            "drugs.json": fx.drugs,
            "parameters.json": fx.parameters,
            "trial-sema-vs-empa-30wk.json": fx.trialFor(body),
            "design-semaglutide.json": fx.designFor({ drug: "semaglutide", target_effect: 1, weeks: 26, background: "any" }),
            "safety-semaglutide.json": fx.safetyFor("semaglutide"),
            "progression-scenarios.json": fx.scenarios,
            "progression-published-figure7-reference.json": fx.progressionFor({ scenario: "published-figure7-reference" }),
            "progression-no-sensitivity-recovery-control.json": fx.progressionFor({ scenario: "no-sensitivity-recovery-control" }),
            "responders.json": fx.respondersFor(body),
            "power.json": fx.powerFor(body),
            "assistant-starters.json": [{ question: "How accurate is this lab?", reply: fx.assistantFor("How accurate is this lab?") }],
        });
        await page.goto("/trials");
        await expect(page.getByTestId("offline-banner")).toBeVisible();
        await expect(page.getByTestId("mode-badge")).toHaveText("Saved run");
        await expect(page.getByTestId("proof-strip").getByTestId("saved-run-label")).toHaveText("Saved run, live simulator offline");
        await expect(page.getByTestId("designer-result").getByTestId("saved-run-label").first()).toBeVisible();
        await expect(page.getByTestId("trial-results").getByTestId("saved-run-label").first()).toBeVisible();
        await shot(page, "saved-mode", info.project.name, false);
        for (const [tab, testid] of [["Safety", "safety-tab"], ["Disease progression", "progression-tab"], ["Who responds", "responders-tab"], ["Power", "power-tab"], ["Proof", "proof-tab"]] as const) {
            await openTab(page, tab);
            await expect(page.getByTestId(testid).getByTestId("saved-run-label").first()).toBeVisible();
        }
        await page.getByTestId("assistant-panel").getByRole("button", { name: "How accurate is this lab?" }).click();
        await expect(page.getByTestId("assistant-reply").getByTestId("saved-run-label")).toBeVisible();
        await noOverflow(page);
        expect(problems).toEqual([]);
    });

    test("a preset answers from its saved run; an edited design says it cannot", async ({ page }) => {
        const body = { arms: [{ drug: "empagliflozin", mg: 25 }], weeks: 26, n_per_arm: 200, egfr_min: 30, egfr_max: 60 };
        await offline(page, {
            "trial-kidney-egfr-30-60.json": fx.trialFor(body),
            "trial-kidney-egfr-90-plus.json": fx.trialFor({ ...body, egfr_min: 90, egfr_max: 400 }),
        });
        await page.goto("/trials");
        await expect(page.getByTestId("offline-banner")).toBeVisible();
        await runPreset(page, "kidney");
        await expect(page.getByTestId("strata-summary")).toBeVisible();
        await expect(page.getByTestId("trial-results").getByTestId("saved-run-label").first()).toBeVisible();
        await page.locator("#trial-weeks").fill("27");
        await page.getByRole("button", { name: "Run simulated trial" }).click();
        await expect(page.getByTestId("run-error")).toContainText("Can't reach the live simulator");
    });

    test("with no saved files, shows empty states and invents nothing", async ({ page }, info) => {
        const problems = watchConsole(page);
        await offline(page);
        await page.goto("/trials");
        await expect(page.getByTestId("offline-banner")).toBeVisible();
        await expect(page.getByTestId("proof-strip-empty")).toContainText("no saved run");
        await expect(page.getByTestId("trial-empty")).toContainText("no saved runs are available yet");
        await expect(page.getByTestId("designer-empty")).toBeVisible();
        await expect(page.locator("[data-testid=check-badge]")).toHaveCount(0);
        await shot(page, "offline-empty", info.project.name, false);
        await noOverflow(page);
        expect(problems).toEqual([]);
    });
});

test("when the simulator cannot download, the page falls back to saved files and says why", async ({ page }) => {
    const problems = watchConsole(page);
    await page.route("**/api/**", (route) => route.abort("connectionrefused"));
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort("failed"));
    await page.route("**/snapshots/**", (route) => {
        const file = new URL(route.request().url()).pathname.split("/").pop() ?? "";
        if (file === "validation.json") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fx.validation) });
        return route.fulfill({ status: 404, contentType: "text/plain", body: "missing" });
    });
    await page.goto("/trials");
    await expect(page.getByTestId("offline-banner")).toContainText("couldn\u2019t start in this browser", { timeout: 30_000 });
    await expect(page.getByTestId("mode-badge")).toHaveText("Saved run");
    await expect(page.getByTestId("proof-strip").getByTestId("saved-run-label")).toBeVisible();
    await page.getByTestId("preset-sema-empa").click();
    await expect(page.getByTestId("run-error")).toContainText("no saved run");
    expect(problems).toEqual([]);
});

test("reduced motion: content appears without entrance animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockApi(page);
    await page.goto("/trials");
    await page.getByRole("button", { name: "Run the designer" }).click();
    const step = page.getByTestId("designer-step").last();
    await expect(step).toBeVisible();
    const opacity = await step.evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe("1");
});

test("layout holds at phone and tablet widths, with the header intact", async ({ page }) => {
    await mockApi(page);
    await page.goto("/trials");
    for (const width of [360, 640, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(150);
        await noOverflow(page);
        const header = await page.locator("header").first().evaluate((el) => el.scrollWidth <= el.clientWidth);
        expect(header, `header overflows at ${width}`).toBe(true);
    }
});

test("the drug note in the Lab now links to Virtual Trials", async ({ page }) => {
    await mockApi(page);
    await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
    await page.goto("/lab?tab=drugs");
    await page.getByText("Where drugs are simulated, and what is left out").click();
    const link = page.getByRole("link", { name: "Virtual Trials page" });
    await expect(link).toHaveAttribute("href", "/trials");
    await expect(page.getByText("What is not", { exact: true })).toBeVisible();
    await expect(page.getByText("Why there is no drug simulation here")).toHaveCount(0);
});

test("the older Lab carries the new cautions, and nothing asks anyone to sign in", async ({ page }, info) => {
    await mockApi(page);
    await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
    await page.goto("/lab");
    await expect(page.getByTestId("share-link-note")).toContainText("Don\u2019t enter real patient values");
    await expect(page.locator("main")).toContainText("Hypoglycaemia is not modelled");
    await expect(page.getByText("Researcher ID", { exact: true })).toHaveCount(0);
    if (info.project.name === "mobile") await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("button", { name: /sign[- ]?in/i })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/sign[- ]?in/i);
    const firstLink = page.getByRole("navigation", { name: "Main" }).getByRole("link").first();
    await expect(firstLink).toHaveText("Virtual Trials");
    await expect(firstLink).toHaveAttribute("href", "/trials");
});

test("the home page says what the site does and leads to the trials", async ({ page }) => {
    await mockApi(page);
    await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
    await page.goto("/home");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("virtual patients");
    await expect(page.getByTestId("home-action")).toHaveCount(4);
    await expect(page.getByTestId("home-flow")).toBeVisible();
    await expect(page.getByTestId("home-limits")).toContainText("did not clearly beat a simple rival");
    await expect(page.locator("body")).toContainText("Research and education only");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.getByTestId("home-start").click();
    await expect(page).toHaveURL(/\/trials$/);
});

test("Learn has moved into Anatomy, and old links still arrive", async ({ page }, info) => {
    await mockApi(page);
    await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
    await page.goto("/learn");
    await expect(page).toHaveURL(/\/anatomy$/);
    await page.goto("/learn/diabetes");
    await expect(page).toHaveURL(/\/conditions\/diabetes$/);
    await expect(page.getByRole("link", { name: /Anatomy/ }).first()).toBeVisible();
    await expect(page.getByTestId("copilot-launcher")).toBeVisible();
    await page.getByTestId("copilot-launcher").click();
    await expect(page).toHaveURL(/\/trials$/);
    if (info.project.name === "mobile") await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Learn" })).toHaveCount(0);
});

test("the built bundle holds no fixtures", async ({ request }) => {
    const html = await (await request.get("/trials")).text();
    const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
        const body = await (await request.get(script)).text();
        expect(body).not.toContain(fx.FIXTURE_MARKER);
        expect(body).not.toContain("FIXTURE");
    }
});
