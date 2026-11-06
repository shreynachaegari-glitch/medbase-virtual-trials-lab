import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, loadSnapshot, NO_SAVED_RUN, postTagged } from "@/lib/trials/api";
import type { Provenance } from "@/lib/trials/types";

export interface SimRequest {
    path: string;
    body: unknown;
    label: string;
    /** A saved run answering this exact request, used only when the simulator is unreachable. */
    savedFile?: string | null;
}

export interface SimOutput<T> {
    label: string;
    data: T;
    provenance: Provenance;
}

export interface SimOutcome<T> {
    outputs: SimOutput<T>[];
    key: string;
    elapsedSeconds: number;
    id: number;
}

export interface Running {
    startedAt: number;
    step: number;
    total: number;
    label: string;
    key: string;
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const toApiError = (error: unknown): ApiError =>
    error instanceof ApiError ? error : new ApiError("server", "Something went wrong while running this. Please try again.");

/**
 * One slow simulation request, or a short chain run one at a time so "step 1 of 2" is true. The
 * last result stays on screen during a new run, and inputs elsewhere stay editable throughout.
 */
export const useSimRun = <T,>(guard: (value: unknown) => boolean) => {
    const [running, setRunning] = useState<Running | null>(null);
    const [outcome, setOutcome] = useState<SimOutcome<T> | null>(null);
    const [error, setError] = useState<ApiError | null>(null);
    const controller = useRef<AbortController | null>(null);
    const runId = useRef(0);

    useEffect(() => () => controller.current?.abort(), []);

    const cancel = useCallback(() => {
        controller.current?.abort();
        controller.current = null;
        setRunning(null);
    }, []);

    const run = useCallback(
        async (requests: SimRequest[], key: string) => {
            controller.current?.abort();
            const current = new AbortController();
            controller.current = current;
            const startedAt = Date.now();
            setError(null);
            const outputs: SimOutput<T>[] = [];
            try {
                for (const [index, req] of requests.entries()) {
                    setRunning({ startedAt, step: index + 1, total: requests.length, label: req.label, key });
                    try {
                        const { data, provenance } = await postTagged<T>(req.path, req.body, guard, current.signal);
                        outputs.push({ label: req.label, data, provenance });
                    } catch (failure) {
                        if (!(failure instanceof ApiError) || failure.kind !== "offline") throw failure;
                        const saved = req.savedFile ? await loadSnapshot<T>(req.savedFile, guard, current.signal) : null;
                        if (saved === null) throw new ApiError("offline", req.savedFile ? NO_SAVED_RUN : failure.message);
                        outputs.push({ label: req.label, data: saved, provenance: "saved" });
                    }
                }
                runId.current += 1;
                setOutcome({ outputs, key, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), id: runId.current });
            } catch (failure) {
                if (isAbort(failure)) return;
                setError(toApiError(failure));
            }
            if (controller.current === current) {
                controller.current = null;
                setRunning(null);
            }
        },
        [guard],
    );

    return { running, outcome, error, run, cancel };
};

/** Whole seconds since `startedAt`, ticking only while there is a start time. */
export const useElapsed = (startedAt: number | null): number => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (startedAt === null) return;
        const tick = () => setNow(Date.now());
        const first = window.setTimeout(tick, 0);
        const timer = window.setInterval(tick, 1000);
        return () => {
            window.clearTimeout(first);
            window.clearInterval(timer);
        };
    }, [startedAt]);
    return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
};
