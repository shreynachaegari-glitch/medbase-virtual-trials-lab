import { useCallback, useEffect, useRef, useState } from "react";

/** Clipboard with a transient "copied" flag and a fallback for browsers without the async API. */
export const useCopy = (resetMs = 1800) => {
    const [copied, setCopied] = useState<string | null>(null);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const copy = useCallback(
        async (text: string, id = "default") => {
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                ta.remove();
            }
            setCopied(id);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(null), resetMs);
        },
        [resetMs],
    );
    return { copied, copy };
};

export const downloadFile = (filename: string, content: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Per-browser convenience storage. Private windows and blocked storage throw, so every read
 * and write is guarded and the feature simply falls back to in-memory state.
 */
export const useLocalStorage = <T,>(key: string, initial: T) => {
    const [value, setValue] = useState<T>(() => {
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? (JSON.parse(raw) as T) : initial;
        } catch {
            return initial;
        }
    });

    const set = useCallback(
        (next: T | ((prev: T) => T)) => {
            setValue((prev) => {
                const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
                try {
                    window.localStorage.setItem(key, JSON.stringify(resolved));
                } catch {
                    /* storage unavailable — keep the in-memory value */
                }
                return resolved;
            });
        },
        [key],
    );
    return [value, set] as const;
};

export const fmtInt = (n: number) => n.toLocaleString("en-US");
