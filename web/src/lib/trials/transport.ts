import type { EngineEvent, WorkerInbound, WorkerOutbound } from "./engine.worker";

export type { EngineEvent };

/**
 * Decides where every /api call goes, once per page load:
 *   1. a same-origin server, if /api/health answers quickly
 *   2. otherwise the simulator in a Web Worker on this device
 *   3. otherwise saved files only
 * Requests to the worker run one at a time, because a simulation blocks it.
 */

export type Mode = "checking" | "server" | "browser" | "saved";

export interface EngineState {
    phase: "idle" | "loading" | "ready" | "failed";
    step: number;
    totalSteps: number;
    label: string;
    bytes: number;
    startedAt: number | null;
    loadSeconds: number | null;
    error: string | null;
    /** Requests waiting behind the one that is running. */
    queued: number;
    busy: boolean;
}

export interface TransportState {
    mode: Mode;
    engine: EngineState;
    /** Which results the static bundle holds, when the bundle was found. */
    bundledResults: string[] | null;
}

export interface EngineReply {
    status: number;
    body: unknown;
}

export class EngineUnavailable extends Error {
    constructor(message = "The in-browser simulator could not start.") {
        super(message);
        this.name = "EngineUnavailable";
    }
}

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
/** Set at build time. It is the proxy's address and holds no secret: only the proxy has a key. */
export const LLM_PROXY: string | null = import.meta.env.VITE_LLM_PROXY || null;
const HEALTH_TIMEOUT_MS = 2000;
/** Longest silence allowed while loading, before a stalled download counts as a failure. */
const LOAD_STALL_MS = 120_000;

const IDLE_ENGINE: EngineState = { phase: "idle", step: 0, totalSteps: 0, label: "", bytes: 0, startedAt: null, loadSeconds: null, error: null, queued: 0, busy: false };

let state: TransportState = { mode: "checking", engine: IDLE_ENGINE, bundledResults: null };
const listeners = new Set<() => void>();

const setState = (patch: Partial<TransportState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
};
const setEngine = (patch: Partial<EngineState>) => setState({ engine: { ...state.engine, ...patch } });

export const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
export const getTransportState = (): TransportState => state;

/** Resolves against the page, so a site at the root or under a sub-path both work. */
const engineUrl = (): string => new URL(`${import.meta.env.BASE_URL}engine/`, document.baseURI).href;

const serverAnswers = async (): Promise<boolean> => {
    if (import.meta.env.VITE_LANDING) return false; // a static build has no server, so don't probe for one
    try {
        const response = await fetch("/api/health", { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
        if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return false;
        const body = (await response.json()) as { ok?: unknown };
        return body.ok === true;
    } catch {
        return false;
    }
};

const readBundle = async (): Promise<string[] | null> => {
    try {
        const response = await fetch(`${engineUrl()}manifest.json`);
        if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null;
        const manifest = (await response.json()) as { results?: unknown };
        return Array.isArray(manifest.results) ? (manifest.results as string[]) : [];
    } catch {
        return null;
    }
};

/** A metered or data-saving connection should choose the download, so it waits to be asked. */
const prefersLessData = (): boolean => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return connection?.saveData === true;
};

let detection: Promise<Mode> | null = null;

const detect = async (): Promise<Mode> => {
    if (await serverAnswers()) {
        setState({ mode: "server" });
        return "server";
    }
    const results = typeof Worker === "undefined" || typeof WebAssembly === "undefined" ? null : await readBundle();
    if (results === null) {
        setState({ mode: "saved" });
        return "saved";
    }
    setState({ mode: "browser", bundledResults: results });
    if (!prefersLessData()) startEngine();
    return "browser";
};

export const resolveMode = (): Promise<Mode> => {
    // Once settled, the store is the truth: a worker that failed later has already moved it to saved.
    if (state.mode !== "checking") return Promise.resolve(state.mode);
    if (detection === null) detection = detect();
    return detection;
};

/** Asks again from the top: the server may be back, or the worker may start this time. */
export const redetect = (): Promise<Mode> => {
    if (state.engine.phase !== "ready" && state.engine.phase !== "loading") {
        setState({ mode: "checking", engine: IDLE_ENGINE });
    }
    detection = detect();
    return detection;
};

interface Job {
    id: number;
    method: string;
    path: string;
    body: string | null;
    resolve: (reply: EngineReply) => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
    onAbort?: () => void;
    onEvent?: (event: EngineEvent) => void;
}

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let settleReady: { resolve: () => void; reject: (error: unknown) => void } | null = null;
let stallTimer: number | undefined;
const queue: Job[] = [];
let current: Job | null = null;
let nextId = 0;

const armStallTimer = () => {
    window.clearTimeout(stallTimer);
    stallTimer = window.setTimeout(() => fail("The download stalled."), LOAD_STALL_MS);
};

const syncQueue = () => setEngine({ queued: queue.length, busy: current !== null });

/** Nothing further can run on this worker. Everything waiting falls back to saved files. */
const fail = (reason: string) => {
    window.clearTimeout(stallTimer);
    worker?.terminate();
    worker = null;
    const error = new EngineUnavailable(`The in-browser simulator could not start: ${reason}`);
    settleReady?.reject(error);
    settleReady = null;
    current?.reject(error);
    current = null;
    queue.splice(0).forEach((job) => job.reject(error));
    setState({ mode: "saved", engine: { ...state.engine, phase: "failed", error: reason, queued: 0, busy: false } });
};

const pump = () => {
    if (current !== null || worker === null || state.engine.phase !== "ready") return;
    const job = queue.shift();
    if (job === undefined) {
        syncQueue();
        return;
    }
    current = job;
    syncQueue();
    const message: WorkerInbound = { type: "request", id: job.id, method: job.method, path: job.path, body: job.body };
    worker.postMessage(message);
};

const onMessage = (event: MessageEvent<WorkerOutbound>) => {
    const message = event.data;
    switch (message.type) {
        case "progress":
            armStallTimer();
            setEngine({ step: message.step, totalSteps: message.total, label: message.label, bytes: message.bytes });
            return;
        case "ready":
            window.clearTimeout(stallTimer);
            setEngine({ phase: "ready", loadSeconds: message.seconds, bytes: message.bytes });
            settleReady?.resolve();
            settleReady = null;
            pump();
            return;
        case "failed":
            fail(message.error);
            return;
        case "fatal":
            fail(message.error);
            return;
        case "event":
            if (current && current.id === message.id) current.onEvent?.(message.event);
            return;
        case "response": {
            const job = current;
            current = null;
            if (job && job.id === message.id) {
                if (job.signal && job.onAbort) job.signal.removeEventListener("abort", job.onAbort);
                try {
                    job.resolve(JSON.parse(message.text) as EngineReply);
                } catch (error) {
                    job.reject(error);
                }
            }
            syncQueue();
            pump();
        }
    }
};

/** Starts the download. Safe to call more than once. */
export const startEngine = (): Promise<void> => {
    if (ready !== null) return ready;
    ready = new Promise<void>((resolve, reject) => {
        settleReady = { resolve, reject };
    });
    ready.catch(() => undefined);
    setEngine({ phase: "loading", step: 0, totalSteps: 0, label: "Starting", startedAt: Date.now(), error: null });
    try {
        worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = onMessage;
        worker.onerror = (event) => fail(event.message || "the worker failed to load");
        armStallTimer();
        const init: WorkerInbound = { type: "init", engineUrl: engineUrl(), indexUrl: PYODIDE_INDEX, proxyUrl: LLM_PROXY };
        worker.postMessage(init);
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
    return ready;
};

/**
 * Sends one request to the worker, queued behind any other. Stopping a queued request removes it. A
 * running one can't be interrupted, so its answer is ignored and the next request waits for it.
 */
export const engineCall = async (method: string, path: string, body: string | null, signal?: AbortSignal, onEvent?: (event: EngineEvent) => void): Promise<EngineReply> => {
    signal?.throwIfAborted();
    await startEngine();
    return new Promise<EngineReply>((resolve, reject) => {
        const job: Job = { id: ++nextId, method, path, body, resolve, reject, signal, onEvent };
        job.onAbort = () => {
            const position = queue.indexOf(job);
            if (position >= 0) queue.splice(position, 1);
            syncQueue();
            reject(new DOMException("Stopped", "AbortError"));
        };
        signal?.addEventListener("abort", job.onAbort, { once: true });
        queue.push(job);
        syncQueue();
        pump();
    });
};

export const engineFileUrl = (name: string): string => `${engineUrl()}${name}`;
