import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import type { RemoteState } from "@/hooks/useRemote";
import { ApiError } from "@/lib/trials/api";
import { checksFrom, contrastKey, fmtNum, fmtShare } from "@/lib/trials/format";
import type { ContrastRow, Loaded, ValidationReport } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { BlindReveal } from "./BlindReveal";
import { CheckBadge, SavedRunTag } from "./bits";
import { ChainFlag } from "./ValidationPanel";

const MINI = 148;

/** Every held-out contrast as a dot around the identity line: the proof, at a glance. */
const MiniScatter = ({ contrasts }: { contrasts: ContrastRow[] }) => {
    const reduce = useReducedMotion();
    const values = contrasts.flatMap((c) => [c.predicted, c.observed]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const margin = (hi - lo) * 0.1 || 0.5;
    const scale = (v: number) => ((v - lo + margin) / (hi - lo + 2 * margin)) * MINI;
    return (
        <svg viewBox={`0 0 ${MINI} ${MINI}`} width={MINI} height={MINI} aria-hidden="true" className="shrink-0">
            <rect x={0.5} y={0.5} width={MINI - 1} height={MINI - 1} fill="none" stroke="hsl(var(--border))" />
            <line x1={0} y1={MINI} x2={MINI} y2={0} stroke="hsl(var(--foreground))" strokeDasharray="3 3" opacity={0.5} />
            {contrasts.map((c, i) => (
                <motion.circle
                    key={contrastKey(c)}
                    cx={scale(c.observed)}
                    cy={MINI - scale(c.predicted)}
                    r={2.75}
                    fill={c.within_0_30 ? "hsl(var(--pass))" : "transparent"}
                    stroke={c.within_0_30 ? "none" : "hsl(var(--fail))"}
                    strokeWidth={1.5}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, delay: reduce ? 0 : 0.2 + i * 0.025 }}
                />
            ))}
        </svg>
    );
};

const Metric = ({ label, value, note, wide }: { label: string; value: string; note: string; wide?: boolean }) => (
    <div className={cn("min-w-0 bg-background p-4", wide && "col-span-2 lg:col-span-1")}>
        <p className="label-caps">{label}</p>
        <p className="tnum mt-1.5 text-2xl font-medium tracking-tight">{value}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{note}</p>
    </div>
);

const Shell = ({ children, testid }: { children: React.ReactNode; testid: string }) => (
    <section aria-label="How the simulator did on held-out real trials" data-testid={testid} className="mt-6 rounded-md border border-border bg-background/70">
        {children}
    </section>
);

/**
 * Fed only by GET /api/validation, so there is nothing to show until that exists. Each state has its own key, so the
 * loaded strip is new DOM rather than the skeleton reshaped, which browsers would count as a layout shift.
 */
export const ProofStrip = ({ state, onRetry }: { state: RemoteState<Loaded<ValidationReport>>; onRetry: () => void }) => {
    if (state.status === "idle" || state.status === "loading") {
        return (
            <Shell key="loading" testid="proof-strip-loading">
                <div role="status" className="h-[11rem] animate-pulse motion-reduce:animate-none">
                    <span className="sr-only">Loading the held-out validation results…</span>
                </div>
            </Shell>
        );
    }
    if (state.status === "error") {
        const notRun = state.error instanceof ApiError && state.error.kind === "not-found";
        return (
            <Shell key="empty" testid="proof-strip-empty">
                <div className="p-4 sm:p-5">
                    <p className="text-sm font-medium">{notRun ? "Held-out validation has not been run yet." : "Held-out validation results aren't available right now."}</p>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        {notRun
                            ? "No accuracy claim is shown until a sealed run against real trials has finished, whatever its result."
                            : state.error instanceof Error ? state.error.message : ""}
                    </p>
                    {!notRun && (
                        <button type="button" onClick={onRetry} className="mt-2 text-xs text-primary underline-offset-2 hover:underline">Try again</button>
                    )}
                </div>
            </Shell>
        );
    }

    const { data, provenance } = state.data;
    const { score } = data;
    return (
        <Shell key="loaded" testid="proof-strip">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
                <p className="text-xs text-muted-foreground">
                    Simulated predictions against real trial results held back from calibration{" "}
                    <span className="text-foreground">{data.blind ? "(sealed run)" : "(seal broken: these trials had already been seen)"}</span>
                </p>
                {provenance === "saved" && <SavedRunTag />}
            </div>
            {data.converged === false && <div className="border-b border-border p-3"><ChainFlag /></div>}
            <div className="flex gap-px overflow-hidden rounded-b-md bg-border">
                <div className="hidden items-center bg-background p-4 lg:flex"><MiniScatter contrasts={data.contrasts} /></div>
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-px lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]">
                    <Metric label="Contrasts tested" value={String(score.n_contrasts)} note="Drug differences in HbA1c" />
                    <Metric label="Mean error" value={fmtNum(score.mae)} note={`HbA1c points. A simple rival: ${fmtNum(score.null_mae)}`} />
                    <Metric wide label="Within ±0.30" value={fmtShare(score.within_0_30)} note={`95% interval coverage ${fmtShare(score.coverage_95pi)}`} />
                    <div className="col-span-2 min-w-0 bg-background p-4 lg:col-span-1 lg:row-auto">
                        <p className="label-caps">Pre-registered checks</p>
                        <ul className="mt-2 space-y-1.5">
                            {checksFrom(score, data.pass_marks).map((check) => (
                                <li key={check.id} className="flex items-center justify-between gap-3 text-xs" title={check.rule}>
                                    <span className="min-w-0"><span className="tnum text-muted-foreground">{check.id}</span> {check.title}</span>
                                    <CheckBadge passed={check.passed} />
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            <BlindReveal contrasts={data.contrasts} />
            <div className="border-t border-border px-4 py-2.5">
                <Link to={{ search: "?tab=proof" }} className="text-xs text-primary underline-offset-2 hover:underline">See every contrast, including every miss</Link>
            </div>
        </Shell>
    );
};
