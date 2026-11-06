import { useMemo, useState } from "react";
import { FileText, ShieldAlert } from "lucide-react";
import { useRemote } from "@/hooks/useRemote";
import { ApiError, api } from "@/lib/trials/api";
import { drugName, fmtNum } from "@/lib/trials/format";
import type { DrugsResponse, LabelWarning, SafetyResponse } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { ExternalLink, LoadingRows, Segmented } from "@/components/lab/primitives";
import { ErrorCallout, ProvenanceTag } from "./bits";

/** Long registry records are cut to their most frequent events until the reader asks for the rest. */
const ROWS_BEFORE_MORE = 12;
const isBoxed = (warning: LabelWarning) => /boxed/i.test(warning.kind);
const ROLE: Record<string, string> = { drug: "This drug", placebo: "Placebo", comparator: "Comparator" };

const Warnings = ({ warnings, source }: { warnings: LabelWarning[]; source: string }) => {
    const boxed = warnings.filter(isBoxed);
    const others = warnings.filter((w) => !isBoxed(w));
    return (
        <section aria-label="Label warnings" data-testid="label-warnings">
            {boxed.map((w) => (
                <div key={w.term} data-testid="boxed-warning" className="mb-3 border-[3px] border-[hsl(var(--paper-ink))] p-4">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase" style={{ letterSpacing: "0.08em" }}>
                        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                        Boxed warning: {w.term}
                    </p>
                    <p className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">{w.text}</p>
                </div>
            ))}
            {others.length > 0 && (
                <>
                    <p className="text-xs font-semibold">Other warnings on the label</p>
                    <ul className="mt-1.5 grid gap-x-6 gap-y-2 text-sm leading-relaxed md:grid-cols-2">
                        {others.map((w) => (
                            <li key={w.term} className="border-t border-[hsl(var(--paper-rule))] pt-1.5">
                                <span className="font-semibold capitalize">{w.term}.</span> {w.text}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            <p className="mt-2 text-xs text-[hsl(var(--paper-muted))]">Source: {source}.</p>
        </section>
    );
};

interface EventRow {
    key: string;
    term: string;
    top: number;
}

/** One row per event term, most frequent first, across every arm that reported it. */
const rowsOf = (data: SafetyResponse, serious: boolean): EventRow[] => {
    const rows = new Map<string, EventRow>();
    for (const arm of data.arms) {
        for (const event of arm.events) {
            if (event.serious !== serious) continue;
            const row = rows.get(event.term);
            if (!row) rows.set(event.term, { key: event.term, term: event.term, top: event.percent });
            else row.top = Math.max(row.top, event.percent);
        }
    }
    return [...rows.values()].sort((a, b) => b.top - a.top);
};

/** Long registry records are cut to their most frequent events until the reader asks for the rest. */
const EventTable = ({ data, serious, title, testid }: { data: SafetyResponse; serious: boolean; title: string; testid: string }) => {
    const rows = useMemo(() => rowsOf(data, serious), [data, serious]);
    const [showAll, setShowAll] = useState(false);
    const shown = showAll ? rows : rows.slice(0, ROWS_BEFORE_MORE);
    if (rows.length === 0) {
        return <p className="mt-4 text-sm text-[hsl(var(--paper-muted))]">{title}: not reported at the sponsor&rsquo;s threshold, which does not mean they never happened.</p>;
    }
    return (
        <section aria-label={title} className="mt-5">
            <h5 className="text-xs font-semibold">{title}</h5>
            <div className="mt-1 md:overflow-x-auto">
                <table className="stack-table w-full text-sm md:table-fixed" data-testid={testid}>
                    <thead>
                        <tr className="border-b border-[hsl(var(--paper-ink))] text-left align-bottom">
                            <th scope="col" className="w-[38%] py-2 pr-3 text-xs font-semibold">Event</th>
                            {data.arms.map((arm) => (
                                <th key={arm.arm} scope="col" className="py-2 pr-3 text-right text-xs font-semibold last:pr-0">
                                    {arm.arm}
                                    <span className="block font-normal text-[hsl(var(--paper-muted))]">{ROLE[arm.role] ?? arm.role}</span>
                                    <span className="tnum block font-normal text-[hsl(var(--paper-muted))]">{arm.participants ?? "?"} people</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((row) => (
                            <tr key={row.key} className="border-b border-[hsl(var(--paper-rule))]">
                                <td data-label="" className="py-1.5 pr-3 font-medium md:font-normal">{row.term}</td>
                                {data.arms.map((arm) => {
                                    const event = arm.events.find((e) => e.term === row.term && e.serious === serious);
                                    return (
                                        <td key={arm.arm} data-label={arm.arm} className={cn("tnum py-1.5 pr-3 last:pr-0 md:text-right", !event && "text-[hsl(var(--paper-muted))]")}>
                                            {event ? (
                                                <span title={`${event.affected} of ${event.at_risk} people${event.assessment ? `, ${event.assessment}` : ""}`}>{fmtNum(event.percent, 1)}%</span>
                                            ) : (
                                                <span className="font-sans text-xs">Not reported</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        {serious && (
                            <tr className="border-b border-[hsl(var(--paper-ink))]">
                                <td data-label="" className="py-1.5 pr-3 text-xs font-semibold">People with any serious event</td>
                                {data.arms.map((arm) => (
                                    <td key={arm.arm} data-label={arm.arm} className="tnum py-1.5 pr-3 text-xs last:pr-0 md:text-right">{arm.serious_affected ?? "?"}</td>
                                ))}
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {rows.length > ROWS_BEFORE_MORE && (
                <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="mt-3 border border-[hsl(var(--paper-ink))] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[hsl(var(--paper-ink))] hover:text-[hsl(var(--paper))]">
                    {showAll ? "Show the most frequent" : `Show all ${rows.length} reported`}
                </button>
            )}
        </section>
    );
};

const Extract = ({ data }: { data: SafetyResponse }) => (
    <>
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <p className="tnum text-[11px] font-semibold uppercase" style={{ letterSpacing: "0.08em" }}>Label and registry extract · {data.kind}</p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight">{drugName(data.drug)}: as reported in a real trial, not simulated</h3>
            </div>
            <FileText className="h-6 w-6 shrink-0 text-[hsl(var(--paper-muted))]" aria-hidden="true" />
        </div>

        <div className="mt-4"><Warnings warnings={data.label_warnings} source={data.label_source} /></div>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-2 border-[hsl(var(--paper-ink))] pt-3">
            <h4 className="text-sm font-semibold">
                Events in one trial:{" "}
                <ExternalLink className="underline underline-offset-2" href={`https://clinicaltrials.gov/study/${encodeURIComponent(data.trial)}`}>{data.trial}</ExternalLink>
            </h4>
            {!data.has_placebo_arm && <p data-testid="no-placebo" className="text-xs font-semibold">No placebo arm in this trial</p>}
        </div>
        <p className="mt-2 text-sm font-medium leading-relaxed" data-testid="absent-note">
            &ldquo;Not reported&rdquo; means not reported at the sponsor&rsquo;s threshold. It never means none.
        </p>
        <EventTable data={data} serious={false} title="Most frequent events" testid="safety-table" />
        <EventTable data={data} serious title="Serious events" testid="safety-serious-table" />
        <p className="mt-4 text-sm leading-relaxed" data-testid="safety-notice">{data.notice}</p>
    </>
);

/** Printed on paper because it is a different kind of fact from everything else on this page. */
export const SafetyTab = ({ drugs }: { drugs: DrugsResponse | null }) => {
    const options = (drugs?.drugs ?? []).map((d) => ({ id: d.drug, label: drugName(d.drug) }));
    const [drug, setDrug] = useState("semaglutide");
    const { state, retry } = useRemote(`safety-${drug}`, (signal) => api.safety(drug, signal));
    return (
        <div className="space-y-5" data-testid="safety-tab">
            <div>
                <h2 className="text-lg font-semibold tracking-tight">Reported side effects</h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    The simulator does not model harm. Label warnings come first, then the rates from one real trial&rsquo;s registry record. They stay apart from every simulated number here.
                </p>
            </div>
            {options.length > 0 && <div className="max-w-full overflow-x-auto"><Segmented value={drug} options={options} onChange={setDrug} label="Drug" /></div>}
            {(state.status === "loading" || state.status === "idle") && <LoadingRows label="the reported events" />}
            {state.status === "error" && (
                <ErrorCallout error={state.error instanceof ApiError ? state.error : new ApiError("server", "The reported events couldn't be loaded.")} onRetry={retry} />
            )}
            {state.status === "success" && (
                <>
                    <ProvenanceTag provenance={state.data.provenance} />
                    <article key={drug} data-testid="safety-paper" className="paper rounded-sm p-5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] sm:p-7">
                        <Extract data={state.data.data} />
                    </article>
                </>
            )}
        </div>
    );
};
