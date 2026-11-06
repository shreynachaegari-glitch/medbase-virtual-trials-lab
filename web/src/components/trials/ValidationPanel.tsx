import { Link, useSearchParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { useChainStatus } from "@/lib/trials/chain";
import { checksFrom, fmtNum, fmtShare } from "@/lib/trials/format";
import type { Provenance, ValidationStatus } from "@/lib/trials/types";
import { CheckBadge, ProvenanceTag } from "./bits";

const ToProof = () => {
    const [params] = useSearchParams();
    const next = new URLSearchParams(params);
    next.set("tab", "proof");
    return (
        <Link to={{ search: `?${next.toString()}` }} className="text-xs text-primary underline-offset-2 hover:underline">
            See every contrast, including misses
        </Link>
    );
};

/** Stays next to results. A chain that did not converge undermines every number derived from it. */
export const ChainFlag = () => {
    const { converged, maxSplitRhat, lengthOverTau } = useChainStatus();
    if (converged !== false) return null;
    return (
        <p role="note" data-testid="chain-flag" className="flex items-start gap-2 rounded-md border-2 border-[hsl(var(--fail))] bg-[hsl(var(--fail))]/10 p-3 text-xs leading-relaxed">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--fail))]" aria-hidden="true" />
            <span>
                <strong className="font-semibold">The calibration chain did not converge.</strong> Treat every simulated number here as unreliable.
                {maxSplitRhat !== null && <span className="tnum"> Split R-hat {fmtNum(maxSplitRhat)}.</span>}
                {lengthOverTau !== null && <span className="tnum"> Length over autocorrelation time {fmtNum(lengthOverTau, 1)}.</span>}
            </span>
        </p>
    );
};

/** The status and notice that travel with a result, read from that result. Stays beside it. */
export const ValidationPanel = ({ status, notice, provenance }: { status: ValidationStatus; notice: string; provenance?: Provenance }) => (
    <section aria-label="Validation status for this result" className="rounded-md border border-border bg-card/60 p-4" data-testid="validation-panel">
        <h3 className="label-caps">How far to trust this</h3>
        <div className="mt-2 empty:hidden"><ChainFlag /></div>
        {status.available ? (
            <>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Held-out real trials, {status.n_contrasts} contrasts:
                </p>
                <ul className="mt-2 space-y-1.5">
                    {checksFrom(status).map((check) => (
                        <li key={check.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="min-w-0">{check.title}</span>
                            <CheckBadge passed={check.passed} />
                        </li>
                    ))}
                </ul>
                <dl className="tnum mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-xs">
                    <dt className="text-muted-foreground">Mean error</dt>
                    <dd className="text-right">{fmtNum(status.mae)} pts</dd>
                    <dt className="text-muted-foreground">Simple rival&rsquo;s error</dt>
                    <dd className="text-right">{fmtNum(status.null_mae)} pts</dd>
                    <dt className="text-muted-foreground">Within &plusmn;0.30</dt>
                    <dd className="text-right">{fmtShare(status.within_0_30)}</dd>
                    <dt className="text-muted-foreground">Sealed run</dt>
                    <dd className="text-right">{status.blind ? "Yes" : "No, seal broken"}</dd>
                </dl>
            </>
        ) : (
            <p className="mt-2 text-sm leading-relaxed" data-testid="validation-unavailable">{status.note}</p>
        )}
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-foreground/90" data-testid="result-notice">{notice}</p>
        {provenance === "saved" && <div className="mt-3"><ProvenanceTag provenance={provenance} /></div>}
        <div className="mt-3"><ToProof /></div>
    </section>
);

/** A slim copy that stays in view above long results on a narrow screen. */
export const ValidationStrip = ({ status }: { status: ValidationStatus }) => {
    const { converged } = useChainStatus();
    return (
    <div data-testid="validation-strip" className="sticky top-[5.0625rem] z-20 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border bg-background/95 px-4 py-1.5 backdrop-blur lg:hidden">
        <span className="label-caps text-foreground">Simulated</span>
        {status.available ? (
            checksFrom(status).map((check) => (
                <span key={check.id} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    {check.id}
                    <span className={check.passed ? "font-semibold text-[hsl(var(--pass))]" : "font-semibold text-[hsl(var(--fail))]"}>
                        {check.passed ? "PASS" : "FAIL"}
                    </span>
                </span>
            ))
        ) : (
            <span className="text-[11px] text-muted-foreground">Held-out checks not available</span>
        )}
        {converged === false && <span className="text-[11px] font-semibold text-[hsl(var(--fail))]">Chain not converged</span>}
    </div>
    );
};
