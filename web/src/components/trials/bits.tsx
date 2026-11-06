import type { ReactNode } from "react";
import { Archive, Check, LoaderCircle, RefreshCw, TriangleAlert, X } from "lucide-react";
import { motion } from "motion/react";
import { useElapsed, type Running } from "@/hooks/useSimRun";
import { useTransport } from "@/hooks/useTransport";
import type { ApiError } from "@/lib/trials/api";
import type { Provenance } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { EngineWaitNote } from "./EngineStatus";

/** Sits next to simulated numbers. Paper is reserved for what real trials reported. */
export const SimulatedTag = ({ className }: { className?: string }) => (
    <span className={cn("label-caps inline-flex items-center rounded-sm border border-dashed border-foreground/40 px-1.5 py-0.5 text-foreground", className)}>
        Simulated
    </span>
);

export const SavedRunTag = ({ className }: { className?: string }) => {
    const { mode } = useTransport();
    return (
        <span
            data-testid="saved-run-label"
            className={cn("inline-flex items-center gap-1.5 rounded-sm border border-[hsl(var(--prov-extrapolated))]/50 bg-[hsl(var(--prov-extrapolated))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--prov-extrapolated))]", className)}
        >
            <Archive className="h-3 w-3" aria-hidden="true" />
            {mode === "saved" ? "Saved run, live simulator offline" : "Saved run"}
        </span>
    );
};

/** Says where a result came from, in the same words as the page's mode badge. */
export const ProvenanceTag = ({ provenance }: { provenance: Provenance }) => {
    if (provenance === "saved") return <SavedRunTag />;
    return (
        <span data-testid="result-source" className="inline-flex items-center rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {provenance === "browser" ? "Running in your browser" : "Live server"}
        </span>
    );
};

/** One size, one weight and one border for both states: a failure is never quieter than a pass. */
export const CheckBadge = ({ passed }: { passed: boolean }) => (
    <span
        data-testid="check-badge"
        data-state={passed ? "pass" : "fail"}
        className={cn(
            "tnum inline-flex h-6 w-[4.25rem] shrink-0 items-center justify-center gap-1 rounded-sm border text-[11px] font-semibold",
            passed
                ? "border-[hsl(var(--pass))] bg-[hsl(var(--pass))]/10 text-[hsl(var(--pass))]"
                : "border-[hsl(var(--fail))] bg-[hsl(var(--fail))]/10 text-[hsl(var(--fail))]",
        )}
    >
        {passed ? <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3} /> : <X className="h-3 w-3" aria-hidden="true" strokeWidth={3} />}
        {passed ? "PASS" : "FAIL"}
    </span>
);

const NEEDS_WAIT = new Set(["busy", "rate-limit", "offline", "server"]);

/** Plain-language failure. Anything that could work on a second try offers one. */
export const ErrorCallout = ({ error, onRetry, retryLabel = "Try again" }: { error: ApiError; onRetry?: () => void; retryLabel?: string }) => (
    <div role="alert" data-testid="run-error" className="rounded-md border border-[hsl(var(--prov-extrapolated))]/40 bg-[hsl(var(--prov-extrapolated))]/[0.07] p-3.5">
        <p className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
            <span>{error.message}</span>
        </p>
        {onRetry && NEEDS_WAIT.has(error.kind) && (
            <button type="button" onClick={onRetry} className="btn-outline mt-3 ml-6 gap-1.5 !px-3 !py-1.5 text-xs">
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                {retryLabel}
            </button>
        )}
    </div>
);

const SLOW_AFTER_SECONDS = 30;

/**
 * The API reports no percentage, so none is invented: this shows what was asked for, elapsed time
 * and which request of a chain is running, over an indeterminate sweep.
 */
export const RunProgress = ({
    running,
    summary,
    onCancel,
    typical = "Runs usually take 5 to 30 seconds.",
}: {
    running: Running;
    summary: ReactNode;
    onCancel: () => void;
    typical?: string;
}) => {
    const seconds = useElapsed(running.startedAt);
    return (
        <motion.div
            data-testid="run-progress"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="rounded-md border border-border bg-card/60 p-4"
        >
            <div role="status" className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    {running.total > 1 ? `Simulating ${running.step} of ${running.total}: ${running.label}` : "Simulating"}
                </p>
                <p className="tnum text-xs text-muted-foreground" aria-hidden="true">{seconds} s</p>
            </div>
            <div className="sweep mt-3" aria-hidden="true" />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {summary} {seconds >= SLOW_AFTER_SECONDS ? "This is taking longer than usual, and the machine may be busy. It is still working." : typical} You can keep editing; changes apply to the next run.
            </p>
            <div className="mt-1.5"><EngineWaitNote /></div>
            <button type="button" onClick={onCancel} className="mt-2 text-xs text-foreground underline-offset-2 hover:underline">
                Stop waiting
            </button>
        </motion.div>
    );
};

export const Field = ({
    label,
    hint,
    error,
    htmlFor,
    children,
    className,
}: {
    label: ReactNode;
    hint?: ReactNode;
    error?: string;
    htmlFor: string;
    children: ReactNode;
    className?: string;
}) => (
    <div className={cn("min-w-0", className)}>
        <label htmlFor={htmlFor} className="mb-1 block text-xs text-muted-foreground">
            {label}
        </label>
        {children}
        {error ? (
            <p id={`${htmlFor}-error`} className="mt-1 text-xs text-[hsl(var(--fail))]">{error}</p>
        ) : hint ? (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>
        ) : null}
    </div>
);

export const Stat = ({ label, value, note }: { label: string; value: ReactNode; note?: string }) => (
    <div className="min-w-0">
        <p className="label-caps">{label}</p>
        <p className="tnum mt-1 text-lg font-medium tracking-tight">{value}</p>
        {note && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{note}</p>}
    </div>
);
