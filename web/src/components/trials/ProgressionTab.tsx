import { useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useRemote } from "@/hooks/useRemote";
import { ApiError, api, guards, loadSnapshot, NO_SAVED_RUN, postTagged } from "@/lib/trials/api";
import { fmtNum } from "@/lib/trials/format";
import type { Provenance, ProgressionRun, ProgressionScenario } from "@/lib/trials/types";
import { Chip, ExternalLink, LoadingRows } from "@/components/lab/primitives";
import ProgressionCharts, { type ProgressionLine } from "@/components/charts/ProgressionCharts";
import { ErrorCallout, Field, ProvenanceTag } from "./bits";
import { EngineWaitNote } from "./EngineStatus";

const COLOURS = ["var(--arm-semaglutide)", "var(--arm-empagliflozin)", "var(--arm-sitagliptin)", "var(--arm-metformin)"];
const EVIDENCE: Record<string, string> = {
    published_model_reference: "Published model reference",
    exploratory_model_control: "Exploratory model control",
    exploratory_model_perturbation: "Exploratory model perturbation",
};

interface Overrides {
    intervention_day: string;
    target_si_after: string;
    horizon_days: string;
}

const NO_OVERRIDES: Overrides = { intervention_day: "", target_si_after: "", horizon_days: "" };
const hasOverrides = (o: Overrides) => Object.values(o).some((v) => v.trim() !== "");

const bodyFor = (scenario: string, overrides: Overrides | null) => {
    const body: Record<string, string | number> = { scenario };
    if (overrides) {
        for (const key of ["intervention_day", "target_si_after", "horizon_days"] as const) {
            if (overrides[key].trim() !== "") body[key] = Number(overrides[key]);
        }
    }
    return body;
};

interface LoadedRun {
    scenario: string;
    edited: boolean;
    run: ProgressionRun;
    provenance: Provenance;
}

const dayOrNever = (day: number | null, never: string) => (day === null ? never : `Day ${fmtNum(day, 0)}`);

/**
 * The published Ha, Satin and Sherman model. It is a separate engine from the drug trials, so the
 * held-out checks elsewhere on this page say nothing about it, and the tab says so.
 */
export const ProgressionTab = () => {
    const scenariosState = useRemote("progression-scenarios", (signal) => api.scenarios(signal));
    const [primary, setPrimary] = useState("published-figure7-reference");
    const [compare, setCompare] = useState<string[]>(["no-sensitivity-recovery-control"]);
    const [draft, setDraft] = useState<Overrides>(NO_OVERRIDES);
    const [applied, setApplied] = useState<Overrides>(NO_OVERRIDES);
    // The server caches identical runs too; this saves a request against the rate limit on each toggle.
    const cache = useRef(new Map<string, LoadedRun>());

    const ids = [primary, ...compare.filter((id) => id !== primary)];
    const edited = hasOverrides(applied);
    const key = JSON.stringify({ ids, applied });

    const runs = useRemote<LoadedRun[]>(key, async (signal) => {
        const out: LoadedRun[] = [];
        // One at a time: the server refuses work beyond a small number of concurrent runs.
        for (const id of ids) {
            const overrides = id === primary && edited ? applied : null;
            const cacheKey = JSON.stringify(bodyFor(id, overrides));
            const cached = cache.current.get(cacheKey);
            if (cached) {
                out.push(cached);
                continue;
            }
            let loaded: LoadedRun;
            try {
                const { data: run, provenance } = await postTagged<ProgressionRun>("/api/progression/run", bodyFor(id, overrides), guards.progression, signal);
                loaded = { scenario: id, edited: overrides !== null, run, provenance };
            } catch (error) {
                if (!(error instanceof ApiError) || error.kind !== "offline") throw error;
                const saved = overrides ? null : await loadSnapshot<ProgressionRun>(`progression-${id}.json`, guards.progression, signal);
                if (saved === null) throw new ApiError("offline", overrides ? "The live simulator is offline, and saved runs only cover each scenario's published settings." : NO_SAVED_RUN);
                loaded = { scenario: id, edited: false, run: saved, provenance: "saved" };
            }
            cache.current.set(cacheKey, loaded);
            out.push(loaded);
        }
        return out;
    });

    const scenarios: ProgressionScenario[] = useMemo(
        () => (scenariosState.state.status === "success" ? scenariosState.state.data.data.scenarios : []),
        [scenariosState.state],
    );
    const colourOf = (id: string) => COLOURS[Math.max(0, scenarios.findIndex((s) => s.id === id)) % COLOURS.length];
    const titleOf = (id: string) => scenarios.find((s) => s.id === id)?.title ?? id;
    const selected = scenarios.find((s) => s.id === primary);

    const loaded = runs.state.status === "success" ? runs.state.data : null;
    const lines: ProgressionLine[] = (loaded ?? []).map((r) => ({
        id: `${r.scenario}${r.edited ? "-edited" : ""}`,
        label: `${titleOf(r.scenario)}${r.edited ? " (your settings)" : ""}`,
        color: colourOf(r.scenario),
        interventionDay: r.run.config.intervention_day,
        rows: r.run.trajectory,
    }));
    const reference = loaded?.[0]?.run.reference;
    const limitations = loaded?.[0]?.run.limitations ?? [];
    const anySaved = loaded?.some((r) => r.provenance === "saved") ?? false;

    const toggleCompare = (id: string) =>
        setCompare((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));

    return (
        <div data-testid="progression-tab" className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold tracking-tight">Disease progression, in one published model</h2>
                <p data-testid="progression-label" className="mt-3 flex items-start gap-2 rounded-md border border-foreground/30 bg-card/60 p-3 text-sm font-medium leading-relaxed">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    One model scenario. Not a drug effect, and not any person&rsquo;s course.
                </p>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    How glucose, insulin sensitivity and beta cells interact over years in a mechanistic model. This engine is separate from the drug trials on this page: it has no drugs and no doses, and the held-out checks above do not test it.
                </p>
            </div>

            <div className="grid gap-5 rounded-md border border-border p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-4">
                    <Field label="Scenario" htmlFor="progression-scenario" hint={selected?.description}>
                        <select id="progression-scenario" value={primary} onChange={(e) => setPrimary(e.target.value)} className="field-input">
                            {scenarios.length === 0 && <option value={primary}>{primary}</option>}
                            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                        </select>
                    </Field>
                    <div>
                        <p className="mb-1.5 text-xs text-muted-foreground">Compare with</p>
                        <div className="flex flex-wrap gap-1.5">
                            {scenarios.filter((s) => s.id !== primary).map((s) => (
                                <Chip key={s.id} active={compare.includes(s.id)} onClick={() => toggleCompare(s.id)}>{s.title}</Chip>
                            ))}
                        </div>
                    </div>
                </div>
                <form
                    noValidate
                    className="min-w-0"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setApplied(draft);
                    }}
                >
                    <p className="text-xs text-muted-foreground">
                        Optional changes to the main scenario. Leave blank to keep its published settings. A change is an exploratory perturbation of the model, not a treatment.
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        <Field label="Intervention day" htmlFor="prog-day">
                            <input id="prog-day" type="number" min="0" max="3650" value={draft.intervention_day} onChange={(e) => setDraft((d) => ({ ...d, intervention_day: e.target.value }))} className="field-input tnum" />
                        </Field>
                        <Field label="Si target after" htmlFor="prog-si">
                            <input id="prog-si" type="number" step="any" min="0.01" max="1.5" value={draft.target_si_after} onChange={(e) => setDraft((d) => ({ ...d, target_si_after: e.target.value }))} className="field-input tnum" />
                        </Field>
                        <Field label="Horizon, days" htmlFor="prog-horizon">
                            <input id="prog-horizon" type="number" min="30" max="3650" value={draft.horizon_days} onChange={(e) => setDraft((d) => ({ ...d, horizon_days: e.target.value }))} className="field-input tnum" />
                        </Field>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button type="submit" className="btn-outline !px-3 !py-1.5 text-xs">Apply changes</button>
                        {edited && (
                            <button type="button" onClick={() => { setDraft(NO_OVERRIDES); setApplied(NO_OVERRIDES); }} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                                Back to published settings
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {runs.state.status === "loading" && (
                <>
                    <LoadingRows rows={3} label="the model scenarios" />
                    <EngineWaitNote />
                </>
            )}
            {runs.state.status === "error" && (
                <ErrorCallout
                    error={runs.state.error instanceof ApiError ? runs.state.error : new ApiError("server", "The model run failed. Please try again.")}
                    onRetry={runs.retry}
                />
            )}

            {loaded && (
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
                    <div className="min-w-0">
                        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                            {lines.map((line) => (
                                <span key={line.id} className="inline-flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full" style={{ background: line.color }} aria-hidden="true" />
                                    {line.label}
                                </span>
                            ))}
                            <ProvenanceTag provenance={anySaved ? "saved" : (loaded[0]?.provenance ?? "live")} />
                        </div>
                        <ProgressionCharts lines={lines} />
                    </div>
                    <aside className="min-w-0 space-y-4 lg:sticky lg:top-40 lg:self-start" aria-label="Scenario summary and limits">
                        <section aria-label="Threshold events" className="rounded-md border border-border p-4">
                            <h3 className="label-caps">Crossing the 126 mg/dL reference, in the model</h3>
                            <ul className="mt-2 divide-y divide-border">
                                {(loaded ?? []).map((r) => (
                                    <li key={`${r.scenario}-${r.edited}`} className="py-2.5 text-xs" data-testid="progression-summary">
                                        <p className="flex items-start gap-1.5 font-medium">
                                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: colourOf(r.scenario) }} aria-hidden="true" />
                                            {titleOf(r.scenario)}
                                        </p>
                                        <p className="mt-0.5 text-muted-foreground">{EVIDENCE[scenarios.find((s) => s.id === r.scenario)?.evidence_class ?? ""] ?? ""}{r.edited ? ", with your changes" : ""}</p>
                                        <dl className="tnum mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                                            <dt className="font-sans text-muted-foreground">Intervention</dt>
                                            <dd className="text-right">Day {r.run.config.intervention_day}</dd>
                                            <dt className="font-sans text-muted-foreground">Crossed above</dt>
                                            <dd className="text-right">{dayOrNever(r.run.events.crossed_threshold_day, "Not in this run")}</dd>
                                            <dt className="font-sans text-muted-foreground">Returned below</dt>
                                            <dd className="text-right">{dayOrNever(r.run.events.returned_below_day, "Not in this run")}</dd>
                                            <dt className="font-sans text-muted-foreground">Highest glucose</dt>
                                            <dd className="text-right">{fmtNum(r.run.summary.max_glucose_mg_dl, 1)} mg/dL</dd>
                                            <dt className="font-sans text-muted-foreground">Final glucose</dt>
                                            <dd className="text-right">{fmtNum(r.run.summary.final_glucose_mg_dl, 1)} mg/dL</dd>
                                        </dl>
                                    </li>
                                ))}
                            </ul>
                        </section>
                        <section aria-label="Limitations of this model" className="rounded-md border border-border p-4" data-testid="progression-limitations">
                            <h3 className="label-caps">Limits of this model</h3>
                            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                                {limitations.map((text) => <li key={text}>{text}</li>)}
                            </ul>
                            {reference && (
                                <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                                    {reference.authors}. {reference.title}. {reference.journal} {reference.year}.{" "}
                                    <ExternalLink className="underline underline-offset-2" href={`https://doi.org/${encodeURI(reference.doi)}`}>DOI {reference.doi}</ExternalLink>
                                </p>
                            )}
                        </section>
                    </aside>
                </div>
            )}
        </div>
    );
};
