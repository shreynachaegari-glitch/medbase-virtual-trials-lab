import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, getWithSaved, guards, loadSnapshot, postJson, postTagged, readDetail } from "./api";
import { EngineUnavailable, engineCall, getTransportState, redetect, resolveMode } from "./transport";

vi.mock("./transport", () => ({
    EngineUnavailable: class EngineUnavailable extends Error {},
    engineCall: vi.fn(),
    engineFileUrl: (name: string) => `/engine/${name}`,
    getTransportState: vi.fn(),
    redetect: vi.fn(),
    resolveMode: vi.fn(),
}));

const useMode = (mode: "server" | "browser" | "saved", bundledResults: string[] | null = []) => {
    vi.mocked(resolveMode).mockResolvedValue(mode);
    vi.mocked(redetect).mockResolvedValue(mode);
    vi.mocked(getTransportState).mockReturnValue({ mode, bundledResults, engine: {} as never });
};

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (status: number) => new Response("<!doctype html>", { status, headers: { "content-type": "text/html" } });
const stub = (...responses: (Response | Error)[]) => {
    const mock = vi.fn();
    for (const r of responses) {
        if (r instanceof Error) mock.mockRejectedValueOnce(r);
        else mock.mockResolvedValueOnce(r);
    }
    vi.stubGlobal("fetch", mock);
    return mock;
};
const any = () => true;
const failure = async (p: Promise<unknown>) => p.then(() => { throw new Error("expected a failure"); }, (e: ApiError) => e);

beforeEach(() => useMode("server"));
afterEach(() => vi.unstubAllGlobals());

describe("readDetail", () => {
    it("takes the app's plain string", () => {
        expect(readDetail("weeks must be between 4 and 156")).toBe("weeks must be between 4 and 156");
    });
    it("reads FastAPI's validation list, naming the deepest field", () => {
        const detail = [{ loc: ["body", "arms", 0, "candidate", "half_life_h"], msg: "Input should be greater than 0" }];
        expect(readDetail(detail)).toBe("Half-life: Input should be greater than 0");
    });
    it("returns null for anything else", () => {
        expect(readDetail(undefined)).toBeNull();
        expect(readDetail([{}])).toBeNull();
    });
});

describe("failures", () => {
    it.each([
        [422, { detail: "emax for hgp must be between 0 and 0.9" }, "invalid", "emax for hgp must be between 0 and 0.9"],
        [429, { detail: "Too many requests." }, "rate-limit", "Too many requests in a short time. Please wait a minute and try again."],
        [503, { detail: "The lab is busy. Please try again shortly." }, "busy", "The lab is busy. Please try again shortly."],
        [503, { detail: "Calibration results are missing on this server." }, "busy", "Calibration results are missing on this server."],
        [404, { detail: "Validation has not been run." }, "not-found", "Validation has not been run."],
    ])("maps %i to %s", async (status, body, kind, message) => {
        stub(json(status, body));
        const error = await failure(postJson("/api/trial", {}, any));
        expect(error).toMatchObject({ kind: kind as string, message });
    });
    it("treats a network failure as offline", async () => {
        stub(new TypeError("fetch failed"));
        expect(await failure(postJson("/api/trial", {}, any))).toMatchObject({ kind: "offline" });
    });
    it("treats a dev proxy's empty 500 as offline but a real 500 as a server error", async () => {
        stub(new Response("", { status: 500, headers: { "content-type": "text/plain" } }));
        expect(await failure(postJson("/x", {}, any))).toMatchObject({ kind: "offline" });
        stub(new Response("Internal Server Error", { status: 500, headers: { "content-type": "text/plain" } }));
        expect(await failure(postJson("/x", {}, any))).toMatchObject({ kind: "server" });
    });
    it("treats a site's HTML fallback page as offline, even with a 200", async () => {
        stub(html(200));
        expect(await failure(postJson("/x", {}, any))).toMatchObject({ kind: "offline" });
        stub(html(405));
        expect(await failure(postJson("/x", {}, any))).toMatchObject({ kind: "offline" });
    });
    it("refuses a response of the wrong shape", async () => {
        stub(json(200, { something: "else" }));
        expect(await failure(postJson("/api/trial", {}, guards.trial))).toMatchObject({ kind: "shape" });
    });
    it("lets an abort through untouched", async () => {
        const abort = new DOMException("stopped", "AbortError");
        stub(abort);
        expect(await failure(postJson("/x", {}, any))).toBe(abort);
    });
});

describe("saved runs", () => {
    const shape = { score: {}, contrasts: [], blind: true, pass_marks: {} };
    it("prefers the live API", async () => {
        const fetcher = stub(json(200, shape));
        await expect(getWithSaved("/api/validation", "validation.json", guards.validation)).resolves.toMatchObject({ provenance: "live" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it("falls back only when the simulator is unreachable, and says it is saved", async () => {
        stub(new TypeError("down"), json(200, shape));
        await expect(getWithSaved("/api/validation", "validation.json", guards.validation)).resolves.toMatchObject({ provenance: "saved" });
    });
    it("does not hide a live 'not run yet' behind an old saved run", async () => {
        const fetcher = stub(json(404, { detail: "Validation has not been run." }));
        expect(await failure(getWithSaved("/api/validation", "validation.json", guards.validation))).toMatchObject({ kind: "not-found" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it("reports offline when there is no saved file either", async () => {
        stub(new TypeError("down"), html(200));
        expect(await failure(getWithSaved("/api/validation", "validation.json", guards.validation))).toMatchObject({ kind: "offline" });
    });
    it("ignores a saved file of the wrong shape", async () => {
        stub(json(200, { nope: true }));
        await expect(loadSnapshot("validation.json", guards.validation)).resolves.toBeNull();
    });
});

describe("the route each mode takes", () => {
    const trial = { control: "", contrasts: {}, arms: {}, enrolment: {}, validation: {}, notice: "", not_modelled: [], arm_kinds: {} };

    it("sends a simulation to the worker in browser mode, and says so", async () => {
        useMode("browser");
        const fetcher = stub();
        vi.mocked(engineCall).mockResolvedValue({ status: 200, body: trial });
        await expect(postTagged("/api/trial", { weeks: 26 }, guards.trial)).resolves.toMatchObject({ provenance: "browser" });
        expect(engineCall).toHaveBeenCalledWith("POST", "/api/trial", '{"weeks":26}', undefined, undefined);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it("reads the engine's statuses as the server's", async () => {
        useMode("browser");
        vi.mocked(engineCall).mockResolvedValue({ status: 503, body: { detail: "Calibration results are missing from this site." } });
        expect(await failure(postJson("/api/trial", {}, guards.trial))).toMatchObject({ kind: "busy", message: "Calibration results are missing from this site." });
        vi.mocked(engineCall).mockResolvedValue({ status: 422, body: { detail: "weeks must be between 4 and 156" } });
        expect(await failure(postJson("/api/trial", {}, guards.trial))).toMatchObject({ kind: "invalid" });
    });
    it("treats a worker that cannot start as offline, so saved files can answer", async () => {
        useMode("browser");
        vi.mocked(engineCall).mockRejectedValue(new EngineUnavailable("no"));
        expect(await failure(postJson("/api/trial", {}, guards.trial))).toMatchObject({ kind: "offline" });
    });
    it("lets a saved file answer at once, without touching the engine", async () => {
        useMode("browser");
        vi.mocked(engineCall).mockClear();
        stub(json(200, { parameters: [] }));
        await expect(api.parameters()).resolves.toMatchObject({ provenance: "saved" });
        expect(engineCall).not.toHaveBeenCalled();
    });
    it("asks the engine when there is no saved file", async () => {
        useMode("browser");
        stub(html(200));
        vi.mocked(engineCall).mockResolvedValue({ status: 200, body: { parameters: [] } });
        await expect(api.parameters()).resolves.toMatchObject({ provenance: "browser" });
    });
    it("knows validation has not run from the manifest, without the engine", async () => {
        useMode("browser", []);
        vi.mocked(engineCall).mockClear();
        stub(html(200));
        expect(await failure(api.validation())).toMatchObject({ kind: "not-found" });
        expect(engineCall).not.toHaveBeenCalled();
    });
    it("reads health from the bundle in browser mode", async () => {
        useMode("browser", ["posterior.json"]);
        await expect(api.health()).resolves.toMatchObject({ calibrated: true, validated: false, assistant_mode: "offline", engine: "browser" });
    });
    it("falls to the worker when the server disappears mid-session", async () => {
        useMode("server");
        vi.mocked(redetect).mockResolvedValue("browser");
        stub(new TypeError("gone"));
        vi.mocked(engineCall).mockResolvedValue({ status: 200, body: trial });
        await expect(postTagged("/api/trial", {}, guards.trial)).resolves.toMatchObject({ provenance: "browser" });
    });
    it("refuses a simulation outright in saved mode", async () => {
        useMode("saved", null);
        expect(await failure(postJson("/api/trial", {}, guards.trial))).toMatchObject({ kind: "offline" });
    });
});
