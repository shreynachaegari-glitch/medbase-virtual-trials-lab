import { useCallback, useEffect, useState } from "react";
import { isAbort } from "@/data/sources/http";

export type RemoteState<T> =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: T; at: Date }
    | { status: "error"; error: unknown };

interface Settled<T> {
    key: string;
    attempt: number;
    value: RemoteState<T>;
}

/**
 * Runs `load` whenever `key` changes, cancelling the previous request. A null key means
 * "nothing to ask yet". The fetcher is read through the key alone, so callers must put
 * every input it depends on into the key.
 *
 * "Loading" is derived rather than stored: any key or attempt without a settled result is
 * loading by definition, so a stale result can never be shown under a new query.
 */
export const useRemote = <T,>(key: string | null, load: (signal: AbortSignal) => Promise<T>) => {
    const [settled, setSettled] = useState<Settled<T> | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (key === null) return;
        const controller = new AbortController();
        load(controller.signal).then(
            (data) => {
                if (controller.signal.aborted) return;
                setSettled({ key, attempt, value: { status: "success", data, at: new Date() } });
            },
            (error) => {
                if (controller.signal.aborted || isAbort(error)) return;
                setSettled({ key, attempt, value: { status: "error", error } });
            },
        );
        return () => controller.abort();
        // `load` is intentionally keyed by `key` — see the doc comment.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, attempt]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);

    const state: RemoteState<T> =
        key === null
            ? { status: "idle" }
            : settled && settled.key === key && settled.attempt === attempt
              ? settled.value
              : { status: "loading" };

    return { state, retry };
};
