import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { doseAt, predict, type SurrogateNet } from "../../src/lib/trials/surrogate";
import { mockApi, watchConsole } from "./mock-api";

/**
 * The explorer, against a DEV ONLY network trained on synthetic numbers (tests/fixtures/surrogate.dev.json).
 * Values on screen here mean nothing, so no screenshot is saved as real.
 */
const raw = readFileSync("tests/fixtures/surrogate.dev.json", "utf8");
const net = JSON.parse(raw) as SurrogateNet;

const open = async (page: Page, api = true) => {
    if (api) await mockApi(page);
    await page.route("**/surrogate.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: raw }));
    await page.goto("/trials");
    await expect(page.getByTestId("surrogate-a1c")).toBeVisible();
};

const fmt = (value: number, digits = 2) => {
    const text = Math.abs(value).toFixed(digits);
    return value < 0 && Number(text) !== 0 ? `−${text}` : text;
};

const setRange = (page: Page, id: string, value: number) =>
    page.locator(id).evaluate((el, v) => {
        const input = el as HTMLInputElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(v));
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);

test("answers on the main thread with the same numbers the network gives", async ({ page }) => {
    const problems = watchConsole(page);
    await open(page);
    const base = { drug: "alpha", mg: Number(doseAt(net, "alpha", 0.5).toPrecision(2)), weeks: 26, targetA1c: 8.4, egfrLow: 90, egfrHigh: 150 };
    await expect(page.getByTestId("surrogate-a1c")).toContainText(fmt(predict(net, base).hba1c_vs_placebo));
    await expect(page.getByTestId("surrogate-weight")).toContainText(fmt(predict(net, base).weight_kg_vs_placebo, 1));

    await setRange(page, "#surrogate-weeks", 80);
    await expect(page.getByTestId("surrogate-a1c")).toContainText(fmt(predict(net, { ...base, weeks: 80 }).hba1c_vs_placebo));
    await setRange(page, "#surrogate-dose", 1);
    const top = { ...base, weeks: 80, mg: 100 };
    await expect(page.getByTestId("surrogate-a1c")).toContainText(fmt(predict(net, top).hba1c_vs_placebo));
    await page.getByTestId("surrogate").getByRole("radio", { name: "eGFR 30 to 60" }).click();
    await expect(page.getByTestId("surrogate-a1c")).toContainText(fmt(predict(net, { ...top, egfrLow: 30, egfrHigh: 60 }).hba1c_vs_placebo));
    await page.getByTestId("surrogate").getByRole("radio", { name: "Beta" }).click();
    await expect(page.getByTestId("surrogate-a1c")).toContainText(fmt(predict(net, { ...top, drug: "beta", egfrLow: 30, egfrHigh: 60 }).hba1c_vs_placebo));
    expect(problems).toEqual([]);
});

test("is labelled as a surrogate, for a study population, with its evaluation and notice", async ({ page }) => {
    await open(page);
    const panel = page.getByTestId("surrogate");
    await expect(panel).toContainText("AI surrogate of the simulator");
    await expect(panel).toContainText("Describes a whole study population, not a person");
    await expect(panel.getByLabel("Study population mean HbA1c")).toBeVisible();
    await expect(page.getByTestId("surrogate-evaluation")).toContainText("Tested on 0 simulator runs");
    await expect(page.getByTestId("surrogate-evaluation")).toContainText("FIXTURE notice");
});

test("sliders work by keyboard", async ({ page }) => {
    await open(page);
    const before = await page.getByTestId("surrogate-a1c").textContent();
    await page.locator("#surrogate-dose").focus();
    for (let i = 0; i < 20; i += 1) await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("surrogate-a1c")).not.toHaveText(before ?? "");
});

test("checks itself against a full run, and stays in place to show the gap", async ({ page }) => {
    const sent: { arms: { drug: string; mg: number }[]; weeks: number; egfr_min: number; egfr_max: number }[] = [];
    await mockApi(page, {
        override: async (route, path) => {
            if (path !== "/api/trial") return false;
            const body = route.request().postDataJSON();
            sent.push(body);
            // The fixture drugs aren't real, so answer with a small hand-written contrast for this test.
            const name = "Fixture arm";
            const contrast = (effect: number) => ({ effect, interval95: [effect - 0.1, effect + 0.1], typical_trial_se: 0.1, probability_significant_benefit: 0.9 });
            const arm = { a1c_by_week: [8, 7.5], a1c_low: [7.9, 7.4], a1c_high: [8.1, 7.6], share_below_7: 0.4, urinary_glucose_g_day: 5 };
            const status = { available: false, note: "Held-out validation has not been run." };
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    control: "Placebo", weeks: body.weeks, n_per_arm: body.n_per_arm, contrasts: { [name]: { hba1c: contrast(-0.75), weight: contrast(-1.5) } },
                    arms: { Placebo: arm, [name]: arm }, enrolment: { eligible_real_participants: 100, effective_sample_size: 50, thin_pool: false, matched: {}, targets: {} },
                    uncertainty: { posterior_draws: 16, replicates_per_draw: 40 }, validation: status, label_flags: [], validation_scope: [], not_modelled: ["FIXTURE"], arm_kinds: { Placebo: "control", [name]: "real drug" }, notice: "FIXTURE",
                }),
            });
            return true;
        },
    });
    await open(page, false);
    await page.getByTestId("surrogate-run-full").scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => window.scrollY);
    await page.getByTestId("surrogate-run-full").click();
    const compare = page.getByTestId("surrogate-compare");
    await expect(compare).toContainText("Full simulator");
    await expect(compare).toContainText("−0.75");
    await expect(compare).toContainText("−1.5");
    expect(sent[0]).toMatchObject({ arms: [{ drug: "alpha", mg: 10 }], weeks: 26, egfr_min: 90, egfr_max: 400 });
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
});

test("shows a not-trained state, with no numbers, when the file doesn't exist", async ({ page }) => {
    const problems = watchConsole(page);
    await mockApi(page);
    await page.route("**/*surrogate*.json", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto("/trials");
    await expect(page.getByTestId("surrogate-not-trained")).toBeVisible();
    await expect(page.getByTestId("surrogate-a1c")).toHaveCount(0);
    expect(problems).toEqual([]);
});
