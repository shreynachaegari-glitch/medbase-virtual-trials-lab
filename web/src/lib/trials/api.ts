import { EngineUnavailable, engineCall, engineFileUrl, getTransportState, redetect, resolveMode, type EngineEvent } from "./transport";
import type {
    CalibrationStatus,
    DrugsResponse,
    Health,
    Loaded,
    ParametersResponse,
    Provenance,
    ProgressionScenariosResponse,
    SafetyResponse,
    ValidationReport,
} from "./types";

export type ApiErrorKind = "offline" | "invalid" | "rate-limit" | "busy" | "not-found" | "server" | "shape";

/** Every failure a panel can meet, already in words a reader can act on. */
export class ApiError extends Error {
    readonly kind: ApiErrorKind;
    readonly status?: number;

    constructor(kind: ApiErrorKind, message: string, status?: number) {
        super(message);
        this.name = "ApiError";
        this.kind = kind;
        this.status = status;
    }
}

const OFFLINE = "Can't reach the live simulator. It may be stopped, or your connection may have dropped.";
const RATE = "Too many requests in a short time. Please wait a minute and try again.";
const BUSY = "The lab is busy with other runs. Please try again shortly.";
const SERVER = "The simulator hit an internal error on this request. Nothing was saved. Try again, or change the design.";
const SHAPE = "The simulator sent a response this page can't read, so nothing is shown from it.";

/** Field names as a reader would say them, for the validation errors FastAPI generates. */
const FIELD_NAMES: Record<string, string> = {
    arms: "Arms",
    mg: "Dose",
    drug: "Drug",
    weeks: "Weeks",
    n_per_arm: "Patients per arm",
    egfr_min: "Lowest eGFR",
    egfr_max: "Highest eGFR",
    dropout: "Dropout",
    background: "Background therapy",
    mechanism: "Mechanism",
    half_life_h: "Half-life",
    volume_l: "Volume",
    emax: "Emax",
    ec50_nmol: "EC50",
    mg_per_day: "Candidate mg/day",
    name: "Candidate name",
    question: "Question",
    target_effect: "Target effect",
    target_power: "Target power",
    intervention_day: "Intervention day",
    target_si_after: "Target insulin sensitivity",
    horizon_days: "Horizon",
};

/** FastAPI sends `detail` as a string from the app, and as a list of objects from its own validation. */
export const readDetail = (detail: unknown): string | null => {
    if (typeof detail === "string") return detail;
    if (!Array.isArray(detail)) return null;
    const lines = detail.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const { loc, msg } = entry as { loc?: unknown; msg?: unknown };
        if (typeof msg !== "string") return [];
        const last = Array.isArray(loc) ? [...loc].reverse().find((p) => typeof p === "string" && p !== "body") : undefined;
        const name = typeof last === "string" ? (FIELD_NAMES[last] ?? last) : null;
        return [name ? `${name}: ${msg}` : msg];
    });
    return lines.length ? lines.join(" ") : null;
};

/** The same words for the same status, whether a server or the in-browser engine sent it. */
const failureForStatus = (status: number, body: unknown): ApiError => {
    const detail = readDetail((body as { detail?: unknown } | null)?.detail);
    switch (status) {
        case 404:
            return new ApiError("not-found", detail ?? "That isn't available here.", 404);
        case 422:
            return new ApiError("invalid", detail ?? "The simulator couldn't accept this design. Check the values and try again.", 422);
        case 429:
            return new ApiError("rate-limit", RATE, 429);
        case 502:
        case 504:
            return new ApiError("offline", OFFLINE, status);
        case 503:
            return new ApiError("busy", detail ?? BUSY, 503);
        default:
            return new ApiError("server", SERVER, status);
    }
};

const failureFor = async (res: Response, isJson: boolean): Promise<ApiError> => {
    // A dev proxy with no backend answers 500 with an empty body, and static hosts answer POST or
    // unknown paths with HTML. Neither came from the simulator, so both mean it is not there.
    if (!isJson) {
        const text = res.status === 500 ? (await res.text().catch(() => "")).trim() : "";
        return text ? new ApiError("server", SERVER, res.status) : new ApiError("offline", OFFLINE, res.status);
    }
    return failureForStatus(res.status, await res.json().catch(() => null));
};

const askServer = async <T>(path: string, guard: (v: unknown) => boolean, init?: RequestInit): Promise<T> => {
    let res: Response;
    try {
        res = await fetch(path, init);
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new ApiError("offline", OFFLINE);
    }
    const isJson = (res.headers.get("content-type") ?? "").includes("json");
    if (!res.ok) throw await failureFor(res, isJson);
    // A 200 with HTML is a site's fallback page, not the API.
    if (!isJson) throw new ApiError("offline", OFFLINE, res.status);
    const body: unknown = await res.json().catch(() => null);
    if (!guard(body)) throw new ApiError("shape", SHAPE, res.status);
    return body as T;
};

const askEngine = async <T>(method: string, path: string, body: string | null, guard: (v: unknown) => boolean, signal?: AbortSignal, onEvent?: (event: EngineEvent) => void): Promise<T> => {
    try {
        const reply = await engineCall(method, path, body, signal, onEvent);
        if (reply.status < 200 || reply.status >= 300) throw failureForStatus(reply.status, reply.body);
        if (!guard(reply.body)) throw new ApiError("shape", SHAPE, reply.status);
        return reply.body as T;
    } catch (error) {
        if (error instanceof EngineUnavailable) throw new ApiError("offline", error.message);
        throw error;
    }
};

/** One request by whichever route this page load settled on. */
const request = async <T>(method: "GET" | "POST", path: string, guard: (v: unknown) => boolean, body?: unknown, signal?: AbortSignal, onEvent?: (event: EngineEvent) => void): Promise<Loaded<T>> => {
    const json = body === undefined ? null : JSON.stringify(body);
    let mode = await resolveMode();
    if (mode === "server") {
        const init: RequestInit = method === "POST" ? { method, headers: { "Content-Type": "application/json" }, body: json, signal } : { signal };
        try {
            return { data: await askServer<T>(path, guard, init), provenance: "live" };
        } catch (error) {
            if (!(error instanceof ApiError) || error.kind !== "offline") throw error;
            // The server went away mid-session. Look again before giving up on this request.
            mode = await redetect();
            if (mode === "server") throw error;
        }
    }
    if (mode === "browser") return { data: await askEngine<T>(method, path, json, guard, signal, onEvent), provenance: "browser" };
    throw new ApiError("offline", OFFLINE);
};

const hasKeys =
    (...keys: string[]) =>
    (value: unknown): boolean =>
        typeof value === "object" && value !== null && keys.every((k) => k in value);

export const guards = {
    health: hasKeys("ok", "calibrated"),
    validation: hasKeys("score", "contrasts", "blind", "pass_marks"),
    calibration: hasKeys("converged"),
    parameters: hasKeys("parameters"),
    drugs: hasKeys("drugs", "candidate_mechanisms"),
    trial: hasKeys("control", "contrasts", "arms", "enrolment", "validation", "notice", "not_modelled", "arm_kinds"),
    power: hasKeys("curve", "arm", "enrolment", "validation", "notice", "not_modelled"),
    responders: hasKeys("drivers", "subgroups", "arm", "enrolment", "validation", "notice", "not_modelled"),
    safety: hasKeys("drug", "trial", "arms", "notice", "label_warnings"),
    assistant: hasKeys("text", "source", "tool_calls"),
    design: hasKeys("goal", "steps", "simulated_design", "reason", "validation", "notice"),
    scenarios: hasKeys("scenarios", "reference"),
    progression: hasKeys("trajectory", "summary", "events", "limitations", "config"),
} as const;

export const getJson = async <T>(path: string, guard: (v: unknown) => boolean, signal?: AbortSignal): Promise<T> =>
    (await request<T>("GET", path, guard, undefined, signal)).data;

export const postJson = async <T>(path: string, body: unknown, guard: (v: unknown) => boolean, signal?: AbortSignal): Promise<T> =>
    (await request<T>("POST", path, guard, body, signal)).data;

/** The same as postJson, but also says where the answer came from. */
export const postTagged = <T>(path: string, body: unknown, guard: (v: unknown) => boolean, signal?: AbortSignal, onEvent?: (event: EngineEvent) => void): Promise<Loaded<T>> =>
    request<T>("POST", path, guard, body, signal, onEvent);

/**
 * A saved run from public/snapshots, or null when the file is absent or unusable. A site's fallback
 * page answers a missing file with HTML and a 200, so the content type and shape both count.
 */
export const loadSnapshot = async <T>(file: string, guard: (v: unknown) => boolean, signal?: AbortSignal): Promise<T | null> => {
    try {
        const res = await fetch(`${import.meta.env.BASE_URL}snapshots/${file}`, { signal });
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
        const body: unknown = await res.json();
        return guard(body) ? (body as T) : null;
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return null;
    }
};

/** A file at the site root, or null when it is absent or unusable. */
export const loadSnapshotAt = async <T>(file: string, guard: (v: unknown) => boolean, signal?: AbortSignal): Promise<T | null> => {
    try {
        const res = await fetch(`${import.meta.env.BASE_URL}${file}`, { signal });
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
        const body: unknown = await res.json();
        return guard(body) ? (body as T) : null;
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return null;
    }
};

export const NO_SAVED_RUN = "The live simulator is offline and no saved run is available for this yet.";

const savedAs = <T>(data: T, provenance: Provenance = "saved"): Loaded<T> => ({ data, provenance });

/**
 * With a server, ask it first: only an unreachable server falls back, and a real error is reported.
 * Without one, a saved file answers at once and the engine, which may still be downloading, is only
 * asked when there is no file.
 */
export const getWithSaved = async <T>(path: string, file: string, guard: (v: unknown) => boolean, signal?: AbortSignal): Promise<Loaded<T>> => {
    const mode = await resolveMode();
    if (mode === "server") {
        try {
            return await request<T>("GET", path, guard, undefined, signal);
        } catch (error) {
            if (!(error instanceof ApiError) || error.kind !== "offline") throw error;
        }
    }
    const saved = await loadSnapshot<T>(file, guard, signal);
    if (saved !== null) return savedAs(saved);
    if (getTransportState().mode === "browser") {
        try {
            return await request<T>("GET", path, guard, undefined, signal);
        } catch (error) {
            if (!(error instanceof ApiError) || error.kind !== "offline") throw error;
        }
    }
    throw new ApiError("offline", NO_SAVED_RUN);
};

const fetchEngineFile = async <T>(name: string, guard: (v: unknown) => boolean, signal?: AbortSignal): Promise<T | null> => {
    try {
        const res = await fetch(engineFileUrl(name), { signal });
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
        const body: unknown = await res.json();
        return guard(body) ? (body as T) : null;
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return null;
    }
};

const NOT_RUN = "Validation has not been run.";
const NOT_CALIBRATED = "Calibration has not been run.";

/**
 * A result the static bundle may hold. The bundle's manifest says so, so "not run yet" is known at
 * once and never waits for the engine to download.
 */
const bundledResult = async <T>(name: string, snapshot: string, guard: (v: unknown) => boolean, missing: string, signal?: AbortSignal): Promise<Loaded<T>> => {
    const saved = await loadSnapshot<T>(snapshot, guard, signal);
    if (saved !== null) return savedAs(saved);
    const { mode, bundledResults } = getTransportState();
    if (mode === "browser" && bundledResults !== null) {
        const file = bundledResults.includes(name) ? await fetchEngineFile<T>(name, guard, signal) : null;
        if (file !== null) return savedAs(file);
        throw new ApiError("not-found", missing, 404);
    }
    throw new ApiError("offline", NO_SAVED_RUN);
};

export const api = {
    /** Without a server the bundle answers, so the page never waits on the download to know this. */
    health: async (signal?: AbortSignal): Promise<Health> => {
        const mode = await resolveMode();
        if (mode === "server") return getJson<Health>("/api/health", guards.health, signal);
        const { bundledResults } = getTransportState();
        if (mode === "browser" && bundledResults !== null) {
            return {
                ok: true,
                engine: "browser",
                calibrated: bundledResults.includes("posterior.json"),
                validated: bundledResults.includes("validation.json"),
                assistant_mode: "offline",
            };
        }
        throw new ApiError("offline", OFFLINE);
    },
    validation: async (signal?: AbortSignal): Promise<Loaded<ValidationReport>> => {
        if ((await resolveMode()) === "server") return getWithSaved<ValidationReport>("/api/validation", "validation.json", guards.validation, signal);
        return bundledResult<ValidationReport>("validation.json", "validation.json", guards.validation, NOT_RUN, signal);
    },
    calibration: async (signal?: AbortSignal): Promise<Loaded<CalibrationStatus>> => {
        if ((await resolveMode()) === "server") return getWithSaved<CalibrationStatus>("/api/calibration", "calibration.json", guards.calibration, signal);
        return bundledResult<CalibrationStatus>("posterior.json", "calibration.json", guards.calibration, NOT_CALIBRATED, signal);
    },
    parameters: (signal?: AbortSignal) =>
        getWithSaved<ParametersResponse>("/api/parameters", "parameters.json", guards.parameters, signal),
    drugs: (signal?: AbortSignal) => getWithSaved<DrugsResponse>("/api/drugs", "drugs.json", guards.drugs, signal),
    safety: (drug: string, signal?: AbortSignal) =>
        getWithSaved<SafetyResponse>(`/api/safety/${encodeURIComponent(drug)}`, `safety-${drug}.json`, guards.safety, signal),
    scenarios: (signal?: AbortSignal) =>
        getWithSaved<ProgressionScenariosResponse>("/api/progression/scenarios", "progression-scenarios.json", guards.scenarios, signal),
};
