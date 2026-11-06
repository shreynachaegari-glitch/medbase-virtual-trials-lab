import { expect, test } from "@playwright/test";
import { watchConsole } from "./mock-api";

/**
 * Against a plain file server with no rewrites, which is the worst a static host can be. Opt in:
 *   MEDBASE_OUT_DIR=<dir> npm run build:static, serve <dir> as files, then
 *   MEDLAB_STATIC=1 MEDLAB_BASE_URL=http://localhost:<port> npx playwright test static-host
 */
test.skip(!process.env.MEDLAB_STATIC, "needs a plain file server: set MEDLAB_STATIC=1 and MEDLAB_BASE_URL");

for (const path of ["/", "/index.html", "/trials", "/trials/", "/trials/index.html", "/trials/?tab=proof"]) {
    test(`opening ${path} lands on the lab`, async ({ page }) => {
        const problems = watchConsole(page);
        // The download is covered elsewhere. This is about reaching the page.
        await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort("failed"));
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toContainText("simulated type 2 diabetes drug trial");
        await expect(page.getByTestId("research-notice")).toBeVisible();
        await expect(page).toHaveURL(/\/trials(\/|\/index\.html)?(\?.*)?$/);
        expect(problems).toEqual([]);
    });
}

test("the MedBase home page stays reachable from the logo", async ({ page }) => {
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort("failed"));
    await page.goto("/trials/");
    await page.getByRole("link", { name: /MedBase/ }).first().click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("simulated type 2 diabetes drug trial");
});

test("other top-level pages open directly", async ({ request }) => {
    for (const path of ["/lab/", "/home/", "/learn/", "/evidence/", "/methods/", "/funding/", "/anatomy/"]) {
        expect((await request.get(path)).status(), path).toBe(200);
    }
});

test("engine files sit where the worker looks for them", async ({ request }) => {
    const manifest = await (await request.get("/engine/manifest.json")).json();
    for (const name of ["labs.csv", "medlab.zip", ...manifest.trials.map((t: string) => `${t}.json`), ...manifest.results]) {
        expect((await request.get(`/engine/${name}`)).status(), name).toBe(200);
    }
});
