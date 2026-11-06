import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SCREENS, watchConsole } from "./mock-api";

/** Real organ models, from public/hra. Nothing on Learn calls the API. */
const manifest = JSON.parse(readFileSync("public/hra/manifest.json", "utf8")) as { total_bytes: number; organs: { id: string; bytes: number }[] };
const noOverflow = async (page: import("@playwright/test").Page) => {
    const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(widths.doc, `page is ${widths.doc}px wide in a ${widths.win}px window`).toBeLessThanOrEqual(widths.win);
};

test("loads every organ, within budget, and surfaces Learn's data", async ({ page }, info) => {
    test.setTimeout(120_000);
    const problems = watchConsole(page);
    const t0 = Date.now();
    await page.goto("/learn");
    await expect(page.getByTestId("atlas-canvas").locator("canvas")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("atlas-loading")).toHaveCount(0, { timeout: 90_000 });
    console.log(`TIMING HRA all ${manifest.organs.length} organs loaded (${info.project.name}): ${((Date.now() - t0) / 1000).toFixed(1)} s, ${(manifest.total_bytes / 1e6).toFixed(2)} MB`);
    await expect(page.getByTestId("atlas-failed")).toHaveCount(0);
    expect(manifest.total_bytes).toBeLessThan(12_000_000);

    const list = page.getByTestId("atlas-list");
    await list.getByRole("button", { name: /^Liver/ }).click();
    const detail = page.getByTestId("atlas-detail");
    await expect(detail).toContainText("Hepatitis B");
    await expect(detail).toContainText("not a symptom checker");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENS}/${info.project.name}-learn-atlas-liver.png`, fullPage: false });
    await list.getByRole("button", { name: /^Heart/ }).click();
    await expect(detail).toContainText("just left of centre");
    await expect(detail.getByTestId("atlas-condition")).toHaveCount(4);
    await detail.getByText(/part by part/).click();
    await expect(detail).toContainText("Right atrium");

    await detail.getByTestId("atlas-condition").first().click();
    await expect(page).toHaveURL(/\/learn\/heart-disease$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page.getByPlaceholder(/Search by name/)).toBeVisible();
    await noOverflow(page);
    expect(problems).toEqual([]);
});

test("load time on a slower connection", async ({ page, context }, info) => {
    test.setTimeout(180_000);
    test.skip(info.project.name !== "desktop", "one measurement is enough");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    // 10 Mbit/s with 40 ms latency, a middling connection. Not a real-network measurement.
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: (10 * 1000 * 1000) / 8, uploadThroughput: (5 * 1000 * 1000) / 8 });
    const t0 = Date.now();
    await page.goto("/learn");
    const page1 = Date.now();
    await expect(page.getByTestId("atlas-list")).toBeVisible();
    const list = Date.now();
    await expect(page.getByTestId("atlas-canvas").locator("canvas")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("atlas-loading")).toHaveCount(0, { timeout: 150_000 });
    console.log(`TIMING HRA throttled to 10 Mbit/s: page ${((page1 - t0) / 1000).toFixed(1)} s, usable list ${((list - t0) / 1000).toFixed(1)} s, all organs ${((Date.now() - t0) / 1000).toFixed(1)} s`);
});

test("clicking the 3D model itself opens that organ", async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" }); // no idle spin, so the target stays still
    await page.goto("/learn");
    const canvas = page.getByTestId("atlas-canvas");
    await expect(canvas.locator("canvas")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("atlas-loading")).toHaveCount(0, { timeout: 90_000 });
    await page.waitForTimeout(500);
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    // Near the middle of the frame is the torso, where there is always an organ.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.5);
    await expect(page.getByTestId("atlas-condition").first()).toBeVisible({ timeout: 10_000 });
    console.log(`INFO clicking the model at frame centre opened: ${await page.getByTestId("atlas-detail").locator("h3").textContent()} (${info.project.name})`);
    await noOverflow(page);
});

test("the list works by keyboard alone", async ({ page }) => {
    await page.goto("/learn");
    const button = page.getByTestId("atlas-list").getByRole("button", { name: /^Kidneys/ });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("atlas-detail")).toContainText("Chronic Kidney Disease");
    expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
});

test("every condition is reachable from the list", async ({ page }) => {
    await page.goto("/learn");
    const found = new Set<string>();
    const buttons = page.getByTestId("atlas-list").getByRole("button");
    await expect(buttons.first()).toBeVisible();
    for (let i = 0; i < (await buttons.count()); i += 1) {
        const label = (await buttons.nth(i).locator("span").first().textContent()) ?? "";
        const count = Number(await buttons.nth(i).locator("span").last().textContent());
        await buttons.nth(i).click();
        await expect(page.getByTestId("atlas-detail").locator("h3")).toHaveText(label);
        await expect(page.getByTestId("atlas-condition")).toHaveCount(count);
        for (const href of await page.getByTestId("atlas-condition").evaluateAll((els) => els.map((el) => el.getAttribute("href")))) found.add(href ?? "");
    }
    expect(found.size).toBe(33);
});

test("credits the source visibly", async ({ page }) => {
    await page.goto("/learn");
    const credit = page.getByTestId("atlas-credit");
    await expect(credit).toContainText("Human Reference Atlas");
    await expect(credit).toContainText("CC BY 4.0");
    await expect(credit).toContainText("Visible Human");
    await expect(credit).toContainText("Simplified and compressed");
});

test("one model failing leaves the rest, and the list, working", async ({ page }) => {
    test.setTimeout(120_000);
    await page.route("**/hra/liver.glb", (route) => route.fulfill({ status: 404, body: "missing" }));
    await page.goto("/learn");
    await expect(page.getByTestId("atlas-failed")).toContainText("Some 3D organs", { timeout: 60_000 });
    await page.getByTestId("atlas-list").getByRole("button", { name: /^Liver/ }).click();
    await expect(page.getByTestId("atlas-detail")).toContainText("Hepatitis B");
});

test("without WebGL, Learn still has everything", async ({ page }) => {
    const problems = watchConsole(page);
    await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
            if (/webgl/.test(kind)) return null;
            return (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
        } as typeof original;
    });
    await page.goto("/learn");
    await expect(page.getByTestId("atlas-no-3d")).toBeVisible();
    await page.getByTestId("atlas-list").getByRole("button", { name: /^Pancreas/ }).click();
    await expect(page.getByTestId("atlas-detail")).toContainText("Diabetes Mellitus");
    await noOverflow(page);
    expect(problems).toEqual([]);
});

test("reduced motion: the body doesn't spin", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/learn");
    const canvas = page.getByTestId("atlas-canvas");
    await expect(page.getByTestId("atlas-loading")).toHaveCount(0, { timeout: 90_000 });
    await page.waitForTimeout(800);
    const first = await canvas.screenshot();
    await page.waitForTimeout(1200);
    const second = await canvas.screenshot();
    expect(Buffer.compare(first, second)).toBe(0);
});

test("the old flat visuals and every Learn page are as they should be", async ({ page }) => {
    await page.goto("/learn");
    await expect(page.locator("[aria-label='Scroll into the heart']")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Explore every structure/ })).toHaveAttribute("href", "/anatomy");
    await expect(page.getByRole("heading", { level: 2, name: "Diabetes Mellitus" })).toBeVisible();
    await page.goto("/learn/diabetes");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Diabetes");
    await noOverflow(page);
});
