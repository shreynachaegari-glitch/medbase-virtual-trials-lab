import type { Page, Route } from "@playwright/test";
import * as fx from "../fixtures/api";

export type Override = (route: Route, path: string) => Promise<boolean> | boolean;

const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Answers /api from the dev-only fixtures. An override may handle a request first. */
export const mockApi = async (page: Page, options: { override?: Override; delayMs?: number } = {}) => {
    await page.route("**/api/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (options.override && (await options.override(route, path))) return;
        if (options.delayMs && request.method() === "POST") await new Promise((r) => setTimeout(r, options.delayMs));
        const body = request.method() === "POST" ? request.postDataJSON() : null;
        if (path === "/api/health") return json(route, fx.health);
        if (path === "/api/validation") return json(route, fx.validation);
        if (path === "/api/calibration") return json(route, fx.calibration);
        if (path === "/api/drugs") return json(route, fx.drugs);
        if (path === "/api/parameters") return json(route, fx.parameters);
        if (path === "/api/trial") return json(route, fx.trialFor(body));
        if (path === "/api/power") return json(route, fx.powerFor(body));
        if (path === "/api/responders") return json(route, fx.respondersFor(body));
        if (path === "/api/assistant") return json(route, fx.assistantFor(body.question));
        if (path === "/api/design") return json(route, fx.designFor(body));
        if (path === "/api/progression/scenarios") return json(route, fx.scenarios);
        if (path === "/api/progression/run") return json(route, fx.progressionFor(body));
        if (path.startsWith("/api/safety/")) return json(route, fx.safetyFor(path.split("/").pop() ?? ""));
        return json(route, { detail: "Not found" }, 404);
    });
};

/** Every error the browser logs, so a test can require there were none. */
export const watchConsole = (page: Page) => {
    const problems: string[] = [];
    page.on("console", (message) => {
        if (message.type() !== "error") return;
        // A deliberately failed request is logged by the browser as a resource error.
        if (/Failed to load resource/.test(message.text())) return;
        problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    return problems;
};

export const SCREENS = "../results/screens/ui-agent";
