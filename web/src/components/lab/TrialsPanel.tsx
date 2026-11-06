import { useState } from "react";
import { useRemote } from "@/hooks/useRemote";
import {
    phaseLabel,
    searchTrials,
    statusLabel,
    trialPhases,
    trialsWebUrl,
    trialUrl,
    type TrialPhaseFilter,
    type TrialQuery,
    type TrialSort,
    type TrialStatusFilter,
} from "@/data/sources/trials";
import { databaseById } from "@/data/sources/registry";
import type { Trial, TrialPage } from "@/data/sources/types";
import { trials as snapshotTrials, trialsSnapshotDate } from "@/data/evidence";
import type { Disease } from "@/data/knowledge";
import { Chip, EmptyState, ErrorNotice, ExternalLink, LoadingRows, Segmented, SourceLine } from "./primitives";
import { fmtInt } from "./utils";
import { cn } from "@/lib/utils";

const statusTone = (s?: string) =>
    s === "RECRUITING" || s === "NOT_YET_RECRUITING" || s === "ENROLLING_BY_INVITATION"
        ? "text-[hsl(var(--prov-derived))] border-[hsl(var(--prov-derived))]/40"
        : s === "ACTIVE_NOT_RECRUITING"
          ? "text-primary border-primary/40"
          : s === "TERMINATED" || s === "WITHDRAWN" || s === "SUSPENDED"
            ? "text-destructive border-destructive/40"
            : "text-muted-foreground border-border";

/** The build-time snapshot, reshaped to the live record so it can stand in when the API is unreachable. */
const snapshotAsTrials = (): Trial[] =>
    snapshotTrials.map((t) => ({
        nctId: t.nctId,
        title: t.title,
        status: t.status.toUpperCase().replace(/[^A-Z]+/g, "_"),
        phases: [t.phase.toUpperCase().replace(/\s+/g, "")],
        enrollment: t.enrollment,
        sponsor: t.sponsor,
        startDate: t.startDate,
        primaryCompletion: t.primaryCompletion,
        conditions: [],
        interventions: [],
        countries: [],
        siteCount: t.sites,
    }));

const TrialsPanel = ({ condition }: { condition: Disease }) => {
    const [input, setInput] = useState(condition.research.term);
    const [termInput, setTermInput] = useState("");
    const [query, setQuery] = useState<TrialQuery>({
        condition: condition.research.term,
        status: "active",
        phase: "any",
        sort: "relevance",
        pageSize: 20,
    });

    const { state, retry } = useRemote<TrialPage>(
        query.condition.trim() ? JSON.stringify(query) : null,
        (signal) => searchTrials(query, signal),
    );
    const db = databaseById("clinicaltrials");
    const webUrl = trialsWebUrl(query);
    const update = (patch: Partial<TrialQuery>) => setQuery((prev) => ({ ...prev, ...patch }));

    return (
        <div>
            <form
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                onSubmit={(e) => {
                    e.preventDefault();
                    update({ condition: input, term: termInput.trim() || undefined });
                }}
            >
                <label className="sr-only" htmlFor="trial-condition">
                    Condition
                </label>
                <input
                    id="trial-condition"
                    type="search"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Condition or disease"
                    className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground"
                />
                <label className="sr-only" htmlFor="trial-term">
                    Intervention or keyword
                </label>
                <input
                    id="trial-term"
                    type="search"
                    value={termInput}
                    onChange={(e) => setTermInput(e.target.value)}
                    placeholder="Intervention, sponsor or keyword (optional)"
                    className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground"
                />
                <button
                    type="submit"
                    disabled={!input.trim()}
                    className="h-9 rounded-md bg-foreground px-3.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                    Search trials
                </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Segmented<TrialStatusFilter>
                    label="Recruitment status"
                    value={query.status ?? "any"}
                    onChange={(status) => update({ status })}
                    options={[
                        { id: "active", label: "Active" },
                        { id: "recruiting", label: "Recruiting" },
                        { id: "completed", label: "Completed" },
                        { id: "any", label: "Any status" },
                    ]}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Phase
                    <select
                        value={query.phase ?? "any"}
                        onChange={(e) => update({ phase: e.target.value as TrialPhaseFilter })}
                        className="h-7 rounded-md border border-input bg-card px-2 text-xs text-foreground"
                    >
                        <option value="any">Any phase</option>
                        {trialPhases.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                </label>
                <Segmented<TrialSort>
                    label="Sort"
                    value={query.sort ?? "relevance"}
                    onChange={(sort) => update({ sort })}
                    options={[
                        { id: "relevance", label: "Relevance" },
                        { id: "updated", label: "Recently updated" },
                    ]}
                />
                {(query.condition !== condition.research.term || query.term) && (
                    <Chip
                        onClick={() => {
                            setInput(condition.research.term);
                            setTermInput("");
                            update({ condition: condition.research.term, term: undefined });
                        }}
                    >
                        ↺ {condition.research.term}
                    </Chip>
                )}
            </div>

            <div className="mt-6">
                {state.status === "loading" && <LoadingRows label={db.name} rows={5} />}
                {state.status === "error" && (
                    <ErrorNotice error={state.error} source={db.name} onRetry={retry} fallbackHref={webUrl}>
                        {condition.labModel && (
                            <div>
                                <p className="text-xs text-muted-foreground">
                                    Meanwhile, the build-time snapshot of recruiting phase 3 trials (taken{" "}
                                    <span className="tnum">{trialsSnapshotDate}</span>) — not live, and not filtered:
                                </p>
                                <TrialList trials={snapshotAsTrials()} />
                            </div>
                        )}
                    </ErrorNotice>
                )}
                {state.status === "success" && (
                    <>
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                            <p className="tnum text-xs text-muted-foreground">
                                <span className="text-foreground">{fmtInt(state.data.total)}</span> registered studies ·
                                showing {state.data.trials.length}
                            </p>
                            <ExternalLink href={webUrl} className="text-xs">
                                Open on ClinicalTrials.gov
                            </ExternalLink>
                        </div>
                        {state.data.trials.length === 0 ? (
                            <EmptyState>No registered studies match. Try “Any status”, or a broader condition term.</EmptyState>
                        ) : (
                            <TrialList trials={state.data.trials} />
                        )}
                        <SourceLine db={db} at={state.at} className="mt-4 border-t border-border pt-3" />
                    </>
                )}
            </div>
        </div>
    );
};

const TrialList = ({ trials }: { trials: Trial[] }) => (
    <ol className="divide-y divide-border">
        {trials.map((t) => (
            <li key={t.nctId} className="grid gap-x-6 gap-y-2 py-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <a
                            href={trialUrl(t.nctId)}
                            target="_blank"
                            rel="noreferrer"
                            className="tnum text-xs text-primary hover:underline"
                        >
                            {t.nctId}
                        </a>
                        <span className={cn("rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wider", statusTone(t.status))}>
                            {statusLabel(t.status)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{phaseLabel(t.phases)}</span>
                    </div>
                    <p className="mt-1.5 text-sm leading-snug">{t.title}</p>
                    {t.interventions.length > 0 && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            <span className="label-caps mr-1.5 text-[10px]">Interventions</span>
                            {t.interventions.slice(0, 4).join(" · ")}
                            {t.interventions.length > 4 && ` +${t.interventions.length - 4}`}
                        </p>
                    )}
                </div>
                <dl className="tnum grid grid-cols-2 gap-x-4 gap-y-1 self-start text-xs md:grid-cols-[auto_1fr]">
                    {t.sponsor && (
                        <>
                            <dt className="text-muted-foreground">Sponsor</dt>
                            <dd className="truncate" title={t.sponsor}>
                                {t.sponsor}
                            </dd>
                        </>
                    )}
                    {t.enrollment !== undefined && (
                        <>
                            <dt className="text-muted-foreground">Enrolment</dt>
                            <dd>{fmtInt(t.enrollment)}</dd>
                        </>
                    )}
                    {(t.siteCount !== undefined || t.countries.length > 0) && (
                        <>
                            <dt className="text-muted-foreground">Sites</dt>
                            <dd className="truncate" title={t.countries.join(", ")}>
                                {t.siteCount ?? "—"}
                                {t.countries.length > 0 &&
                                    ` · ${t.countries.length} ${t.countries.length === 1 ? "country" : "countries"}`}
                            </dd>
                        </>
                    )}
                    {t.primaryCompletion && (
                        <>
                            <dt className="text-muted-foreground">Primary end</dt>
                            <dd>{t.primaryCompletion}</dd>
                        </>
                    )}
                </dl>
            </li>
        ))}
    </ol>
);

export default TrialsPanel;
