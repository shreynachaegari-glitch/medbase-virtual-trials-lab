/**
 * The one door every live database request goes through.
 *
 * Everything here runs in the reader's browser against public APIs — there is no MedBase
 * backend — so the layer has to be a good citizen on its own: it caches, it spaces out
 * requests to hosts that publish a rate limit, and it turns every failure into an error a
 * panel can explain instead of a blank screen.
 */

export type SourceErrorKind = "network" | "timeout" | "http" | "rate-limit" | "not-found" | "parse";

export class SourceError extends Error {
    readonly kind: SourceErrorKind;
    readonly status?: number;

    constructor(kind: SourceErrorKind, message: string, status?: number) {
        super(message);
        this.name = "SourceError";
        this.kind = kind;
        this.status = status;
    }
}

/** Minimum spacing between request *starts*, per host, from each provider's usage policy. */
const HOST_SPACING_MS: Record<string, number> = {
    // NCBI: no more than three requests per second without an API key.
    "eutils.ncbi.nlm.nih.gov": 350,
    // ClinicalTrials.gov asks for roughly 50 requests per minute per IP.
    "clinicaltrials.gov": 1200,
    // PubChem PUG REST: no more than five requests per second.
    "pubchem.ncbi.nlm.nih.gov": 220,
};

const nextSlot = new Map<string, number>();

const waitForSlot = async (host: string) => {
    const gap = HOST_SPACING_MS[host];
    if (!gap) return;
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, slot + gap);
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

/** Exposed for tests; the app never needs to clear the cache itself. */
export const clearSourceCache = () => {
    cache.clear();
    nextSlot.clear();
};

interface FetchOptions {
    /** Stops *this caller* waiting. The underlying request still completes and fills the cache. */
    signal?: AbortSignal;
    init?: RequestInit;
    timeoutMs?: number;
}

const abortError = () => new DOMException("The request was aborted.", "AbortError");

const raceAbort = <T,>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortError());
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (v) => {
                signal.removeEventListener("abort", onAbort);
                resolve(v);
            },
            (e) => {
                signal.removeEventListener("abort", onAbort);
                reject(e);
            },
        );
    });
};

const request = async (url: string, init: RequestInit | undefined, timeoutMs: number) => {
    const host = new URL(url).host;
    await waitForSlot(host);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
        res = await fetch(url, {
            ...init,
            signal: controller.signal,
            headers: { Accept: "application/json", ...init?.headers },
        });
    } catch (e) {
        if (controller.signal.aborted) {
            throw new SourceError("timeout", `No response within ${timeoutMs / 1000}s.`);
        }
        // A browser reports a CORS refusal, DNS failure and a dropped connection identically,
        // so the message says all three rather than guessing which one it was.
        throw new SourceError(
            "network",
            e instanceof Error && e.message ? e.message : "The request could not be completed.",
        );
    } finally {
        clearTimeout(timer);
    }

    if (res.status === 404) throw new SourceError("not-found", "No matching record.", 404);
    if (res.status === 429) {
        throw new SourceError("rate-limit", "The database is rate-limiting requests.", 429);
    }
    if (!res.ok) throw new SourceError("http", `The database answered HTTP ${res.status}.`, res.status);

    try {
        return (await res.json()) as unknown;
    } catch {
        throw new SourceError("parse", "The database returned something that was not JSON.");
    }
};

export const fetchJson = <T = unknown,>(
    url: string,
    { signal, init, timeoutMs = 15000 }: FetchOptions = {},
): Promise<T> => {
    const key = `${init?.method ?? "GET"} ${url} ${typeof init?.body === "string" ? init.body : ""}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return raceAbort(hit.value as Promise<T>, signal);

    const value = request(url, init, timeoutMs);
    cache.set(key, { at: Date.now(), value });
    // A failure must not be served from cache on the next attempt.
    value.catch(() => {
        if (cache.get(key)?.value === value) cache.delete(key);
    });
    return raceAbort(value as Promise<T>, signal);
};

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Builds a query string; skips empty values so optional filters can be passed unconditionally. */
export const qs = (params: Record<string, string | number | undefined | null | false>) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === false || v === "") return;
        sp.set(k, String(v));
    });
    return sp.toString();
};

/* Narrowing helpers for untyped JSON. Every parser in this folder reads through these, so a
   field that is missing or has changed type degrades to "absent" instead of throwing. */

export const asRecord = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

export const asString = (v: unknown): string | undefined => {
    if (typeof v === "string") return v.trim() || undefined;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return undefined;
};

export const asNumber = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
};

export const asStrings = (v: unknown): string[] =>
    asArray(v)
        .map(asString)
        .filter((s): s is string => Boolean(s));

/** Follows a dotted path through nested records. */
export const at = (v: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>((cur, key) => asRecord(cur)?.[key], v);
