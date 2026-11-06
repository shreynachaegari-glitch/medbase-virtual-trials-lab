/// <reference lib="webworker" />
/**
 * The simulator, running on this device. It stays off the main thread because a simulation blocks
 * for seconds. The bytes counter is real: it counts what is actually fetched, including from cache.
 * The API gives no total, so progress reports steps and bytes, never a percentage.
 */

interface PyProxyModule {
    use_labs_file: (path: string) => void;
    handle: (method: string, path: string, body: string | null) => string;
    session_start: (question: string) => string;
    session_tool: (name: string, args: string) => string;
    session_finish: (text: string | null, failed?: boolean) => string;
}

interface Pyodide {
    loadPackage: (names: string[], options?: { messageCallback?: (message: string) => void; errorCallback?: (message: string) => void }) => Promise<unknown>;
    unpackArchive: (buffer: ArrayBuffer, format: string, options: { extractDir: string }) => void;
    runPython: (code: string) => unknown;
    pyimport: (name: string) => PyProxyModule;
    FS: {
        mkdirTree: (path: string) => void;
        writeFile: (path: string, data: Uint8Array | string) => void;
    };
}

interface Manifest {
    trials: string[];
    results: string[];
    packages: string[];
}

/** What the AI is doing right now, sent as it happens. */
export type EngineEvent =
    | { kind: "thinking"; turn: number }
    | { kind: "tool"; index: number; name: string; args: string; status: "running" | "ok" | "failed" };

export type WorkerInbound =
    | { type: "init"; engineUrl: string; indexUrl: string; proxyUrl: string | null }
    | { type: "request"; id: number; method: string; path: string; body: string | null };

export type WorkerOutbound =
    | { type: "progress"; step: number; total: number; label: string; bytes: number }
    | { type: "ready"; seconds: number; bytes: number }
    | { type: "failed"; error: string }
    | { type: "response"; id: number; text: string }
    | { type: "event"; id: number; event: EngineEvent }
    | { type: "fatal"; id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: WorkerOutbound) => scope.postMessage(message);

const TOTAL_STEPS = 4;
const PROGRESS_INTERVAL_MS = 250;
let engine: PyProxyModule | null = null;
let proxy: string | null = null;
let step = 0;
let label = "";
let bytes = 0;
let lastReport = 0;

const report = (force = false) => {
    const now = performance.now();
    if (!force && now - lastReport < PROGRESS_INTERVAL_MS) return;
    lastReport = now;
    post({ type: "progress", step, total: TOTAL_STEPS, label, bytes });
};

const enter = (nextStep: number, nextLabel: string) => {
    step = nextStep;
    label = nextLabel;
    report(true);
};

/** Counts bytes as they arrive, for the whole of the load. Restored once the engine is ready. */
const countDownloads = (): (() => void) => {
    const original = scope.fetch.bind(scope);
    scope.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await original(input, init);
        if (!response.body) return response;
        const counter = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                bytes += chunk.byteLength;
                report();
                controller.enqueue(chunk);
            },
        });
        return new Response(response.body.pipeThrough(counter), { status: response.status, statusText: response.statusText, headers: response.headers });
    };
    return () => {
        scope.fetch = original;
    };
};

const fetchOk = async (url: string): Promise<Response> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response;
};

const start = async (engineUrl: string, indexUrl: string): Promise<void> => {
    const startedAt = performance.now();
    const restore = countDownloads();
    try {
        enter(1, "Starting Python");
        const { loadPyodide } = (await import(/* @vite-ignore */ `${indexUrl}pyodide.mjs`)) as { loadPyodide: (options: { indexURL: string }) => Promise<Pyodide> };
        const pyodide = await loadPyodide({ indexURL: indexUrl });

        const manifest = (await (await fetchOk(`${engineUrl}manifest.json`)).json()) as Manifest;

        enter(2, "Downloading the scientific packages");
        await pyodide.loadPackage(manifest.packages);

        enter(3, "Fetching the engine and the patient data");
        const files = await Promise.all([
            fetchOk(`${engineUrl}medlab.zip`).then((r) => r.arrayBuffer()),
            fetchOk(`${engineUrl}labs.csv`).then((r) => r.text()),
            ...manifest.trials.map((nct) => fetchOk(`${engineUrl}${nct}.json`).then((r) => r.text())),
        ]);
        const results = await Promise.all(manifest.results.map((name) => fetchOk(`${engineUrl}${name}`).then((r) => r.text())));

        enter(4, "Starting the engine");
        const [archive, labs, ...records] = files as [ArrayBuffer, string, ...string[]];
        pyodide.FS.mkdirTree("/app/data/raw/registry");
        pyodide.FS.mkdirTree("/app/results");
        pyodide.unpackArchive(archive, "zip", { extractDir: "/app" });
        pyodide.FS.writeFile("/app/data/labs.csv", labs);
        manifest.trials.forEach((nct, i) => pyodide.FS.writeFile(`/app/data/raw/registry/${nct}.json`, records[i]));
        manifest.results.forEach((name, i) => pyodide.FS.writeFile(`/app/results/${name}`, results[i]));
        pyodide.runPython("import sys\nsys.path.insert(0, '/app')");
        const browser = pyodide.pyimport("medlab.browser");
        browser.use_labs_file("/app/data/labs.csv");
        engine = browser;
        post({ type: "ready", seconds: (performance.now() - startedAt) / 1000, bytes });
    } finally {
        restore();
    }
};

const MAX_QUESTION = 2000;
/** The proxy gives NVIDIA 50 s, and its host allows 60 s. */
const PROXY_TIMEOUT_MS = 58_000;

interface ToolCall {
    id: string;
    function: { name: string; arguments: string };
}

interface SessionStart {
    done?: unknown;
    messages?: unknown[];
    tools?: unknown[];
    max_turns?: number;
}

const toolFailed = (result: string): boolean => {
    try {
        const parsed = JSON.parse(result) as { error?: unknown };
        return parsed.error !== undefined;
    } catch {
        return false;
    }
};

/**
 * The AI plans and asks; the engine computes and has the last word. No key is ever in the browser: only the
 * proxy holds one. Any network or proxy failure hands the question to the offline planner, which still answers.
 */
const askModel = async (id: number, api: PyProxyModule, proxyUrl: string, body: string): Promise<string> => {
    const { question } = JSON.parse(body) as { question?: unknown };
    if (typeof question !== "string" || question.trim() === "" || question.length > MAX_QUESTION) return api.handle("POST", "/api/assistant", body);
    const start = JSON.parse(api.session_start(question)) as SessionStart;
    const reply = (done: unknown) => JSON.stringify({ status: 200, body: done });
    if (start.done !== undefined) return reply(start.done);

    const finish = (text: string | null, failed: boolean) => JSON.parse(api.session_finish(text, failed)) as { done?: unknown; repair?: string };
    const end = (text: string | null, failed: boolean) => reply(finish(text, failed).done);
    const messages = [...(start.messages ?? [])];
    const notify = (event: EngineEvent) => post({ type: "event", id, event });
    let index = 0;
    try {
        let turns = start.max_turns ?? 0;
        for (let turn = 1; turn <= turns; turn += 1) {
            notify({ kind: "thinking", turn });
            const response = await fetch(proxyUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages, tools: start.tools }),
                signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
            });
            if (!response.ok) return end(null, true);
            const { message } = (await response.json()) as { message?: { content?: string | null; tool_calls?: ToolCall[] } };
            if (!message) return end(null, true);
            const calls = message.tool_calls ?? [];
            if (calls.length === 0) {
                const verdict = finish(message.content ?? "", false);
                if (verdict.repair === undefined) return reply(verdict.done);
                // The guard sent the draft back once, naming the figures no tool produced.
                messages.push({ role: "assistant", content: message.content ?? "" }, { role: "user", content: verdict.repair });
                turns += 1;
                continue;
            }
            messages.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
            for (const call of calls) {
                const { name, arguments: args } = call.function;
                const at = index;
                index += 1;
                notify({ kind: "tool", index: at, name, args, status: "running" });
                // A blocking simulation, so yield first and let the "running" message reach the page.
                await new Promise((resolve) => setTimeout(resolve, 0));
                let result: string;
                try {
                    result = api.session_tool(name, args);
                } catch {
                    result = JSON.stringify({ error: "this tool failed" });
                }
                notify({ kind: "tool", index: at, name, args, status: toolFailed(result) ? "failed" : "ok" });
                messages.push({ role: "tool", tool_call_id: call.id, content: result });
            }
        }
        return end(null, true);
    } catch {
        return end(null, true);
    }
};

const answer = async (message: Extract<WorkerInbound, { type: "request" }>) => {
    const api = engine;
    if (!api) {
        post({ type: "fatal", id: message.id, error: "the engine is not ready" });
        return;
    }
    try {
        const text =
            proxy && message.path === "/api/assistant" && message.method === "POST" && message.body
                ? await askModel(message.id, api, proxy, message.body)
                : api.handle(message.method, message.path, message.body);
        post({ type: "response", id: message.id, text });
    } catch (error) {
        // A Python exception the engine did not map to a status. Pyodide marks a crash of the runtime
        // itself as fatal, and nothing can run after that.
        const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        if (/fatal|out of memory|aborted/i.test(text)) post({ type: "fatal", id: message.id, error: text });
        else post({ type: "response", id: message.id, text: JSON.stringify({ status: 500, body: {} }) });
    }
};

scope.onmessage = (event: MessageEvent<WorkerInbound>) => {
    const message = event.data;
    if (message.type === "init") {
        proxy = message.proxyUrl;
        start(message.engineUrl, message.indexUrl).catch((error: unknown) => {
            post({ type: "failed", error: error instanceof Error ? error.message : String(error) });
        });
        return;
    }
    void answer(message);
};
