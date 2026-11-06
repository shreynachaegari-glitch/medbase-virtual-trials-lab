import { useMemo, useState } from "react";
import type { RemoteState } from "@/hooks/useRemote";
import { useRemote } from "@/hooks/useRemote";
import { ApiError, api } from "@/lib/trials/api";
import { checksFrom, contrastKey, fmtInterval, fmtNum, fmtShare } from "@/lib/trials/format";
import type { ContrastRow, Loaded, Parameter, ValidationReport } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { Chip, EmptyState, LoadingRows } from "@/components/lab/primitives";
import ValidationScatter from "@/components/charts/ValidationScatter";
import { CheckBadge, ErrorCallout, ProvenanceTag } from "./bits";
import { ChainFlag } from "./ValidationPanel";

type SortKey = "abs_error" | "trial" | "predicted" | "null_predicted" | "observed";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
    { key: "trial", label: "Trial and contrast" },
    { key: "predicted", label: "Predicted", numeric: true },
    { key: "null_predicted", label: "Simple rival", numeric: true },
    { key: "observed", label: "Observed", numeric: true },
    { key: "abs_error", label: "Error", numeric: true },
];

const compare = (key: SortKey) => (a: ContrastRow, b: ContrastRow) => {
    if (key === "trial") return a.trial.localeCompare(b.trial);
    if (key === "abs_error") return Math.abs(b.error) - Math.abs(a.error);
    return a[key] - b[key];
};

const ThinTag = () => (
    <span data-testid="thin-tag" className="ml-1.5 whitespace-nowrap rounded-sm border border-[hsl(var(--prov-extrapolated))]/70 px-1 text-[10px] font-medium text-[hsl(var(--prov-extrapolated))]">Thin pool</span>
);

const SortHeader = ({ column, sort, onSort }: { column: (typeof COLUMNS)[number]; sort: SortKey; onSort: (k: SortKey) => void }) => (
    <th
        scope="col"
        aria-sort={sort === column.key ? (column.key === "abs_error" ? "descending" : "ascending") : "none"}
        className={cn("py-2 pr-3 font-medium", column.numeric && "text-right")}
    >
        <button type="button" onClick={() => onSort(column.key)} className={cn("label-caps transition-colors hover:text-foreground", sort === column.key && "text-foreground")}>
            {column.label}
            <span aria-hidden="true">{sort === column.key ? " ↓" : ""}</span>
        </button>
    </th>
);

/** Largest miss first, so nothing has to be hunted for. */
const ContrastTable = ({ contrasts, activeKey, onActive }: { contrasts: ContrastRow[]; activeKey: string | null; onActive: (k: string | null) => void }) => {
    const [sort, setSort] = useState<SortKey>("abs_error");
    const [onlyMisses, setOnlyMisses] = useState(false);
    const misses = contrasts.filter((c) => !c.within_0_30).length;
    const rows = useMemo(() => [...contrasts].filter((c) => !onlyMisses || !c.within_0_30).sort(compare(sort)), [contrasts, onlyMisses, sort]);
    return (
        <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <Chip active={!onlyMisses} onClick={() => setOnlyMisses(false)}>All {contrasts.length}</Chip>
                <Chip active={onlyMisses} onClick={() => setOnlyMisses(true)}>Misses {misses}</Chip>
            </div>
            <table className="stack-table w-full text-sm" data-testid="contrast-table">
                <thead>
                    <tr className="border-b border-border text-left">
                        {COLUMNS.map((c) => <SortHeader key={c.key} column={c} sort={sort} onSort={setSort} />)}
                        <th scope="col" className="label-caps py-2 pr-3 text-right font-medium">95% PI</th>
                        <th scope="col" className="label-caps py-2 text-right font-medium">Within ±0.30</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const key = contrastKey(row);
                        return (
                            <tr
                                key={key}
                                data-testid="contrast-row"
                                data-miss={!row.within_0_30}
                                onPointerEnter={() => onActive(key)}
                                onPointerLeave={() => onActive(null)}
                                className={cn("border-b border-[hsl(var(--rule))] transition-colors", activeKey === key && "bg-card")}
                            >
                                <td data-label="" className="py-2 pr-3">
                                    <span className="block font-medium md:font-normal">{row.arm} vs {row.reference}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {row.trial}
                                        {row.thin_pool && <ThinTag />}
                                    </span>
                                </td>
                                <td data-label="Predicted" className="tnum py-2 pr-3 md:text-right">{fmtNum(row.predicted)}</td>
                                <td data-label="Simple rival" className="tnum py-2 pr-3 text-muted-foreground md:text-right" data-testid="null-predicted">{fmtNum(row.null_predicted)}</td>
                                <td data-label="Observed" className="tnum py-2 pr-3 md:text-right">{fmtNum(row.observed)}</td>
                                <td data-label="Error" className={cn("tnum py-2 pr-3 md:text-right", !row.within_0_30 && "font-semibold text-[hsl(var(--fail))]")}>{fmtNum(row.error)}</td>
                                <td data-label="95% PI" className="tnum whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground md:text-right">
                                    {fmtInterval(row.pi95)}{row.covered ? "" : " (missed)"}
                                </td>
                                <td data-label="Within ±0.30" className="py-2 md:text-right">
                                    <span className={cn("text-xs font-semibold", row.within_0_30 ? "text-[hsl(var(--pass))]" : "text-[hsl(var(--fail))]")}>{row.within_0_30 ? "Yes" : "Miss"}</span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </>
    );
};

const KINDS: Parameter["kind"][] = ["published", "calibrated", "assumed"];
const KIND_STYLE: Record<Parameter["kind"], string> = {
    published: "border-foreground/50 text-foreground",
    calibrated: "border-[hsl(var(--primary))] text-[hsl(217_91%_72%)]",
    assumed: "border-dashed border-[hsl(var(--prov-extrapolated))] text-[hsl(var(--prov-extrapolated))]",
};

const ParametersTable = () => {
    const { state, retry } = useRemote("parameters", (signal) => api.parameters(signal));
    const [kind, setKind] = useState<Parameter["kind"] | null>(null);
    if (state.status === "loading" || state.status === "idle") return <LoadingRows label="the parameters" />;
    if (state.status === "error") {
        return <ErrorCallout error={state.error instanceof ApiError ? state.error : new ApiError("server", "The parameters couldn't be loaded.")} onRetry={retry} />;
    }
    const { parameters } = state.data.data;
    const rows = kind ? parameters.filter((p) => p.kind === kind) : parameters;
    return (
        <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <Chip active={kind === null} onClick={() => setKind(null)}>All {parameters.length}</Chip>
                {KINDS.map((k) => (
                    <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                        {k[0].toUpperCase() + k.slice(1)} {parameters.filter((p) => p.kind === k).length}
                    </Chip>
                ))}
                <ProvenanceTag provenance={state.data.provenance} />
            </div>
            <table className="stack-table w-full text-sm" data-testid="parameters-table">
                <thead>
                    <tr className="border-b border-border text-left">
                        <th scope="col" className="label-caps py-2 pr-3 font-medium">Parameter</th>
                        <th scope="col" className="label-caps py-2 pr-3 text-right font-medium">Value</th>
                        <th scope="col" className="label-caps py-2 pr-3 font-medium">Kind</th>
                        <th scope="col" className="label-caps py-2 font-medium">Source</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((p) => (
                        <tr key={p.name} className="border-b border-[hsl(var(--rule))] align-top transition-colors hover:bg-card/70">
                            <td data-label="" className="tnum py-2 pr-3 text-xs font-medium md:font-normal">{p.name}</td>
                            <td data-label="Value" className="tnum whitespace-nowrap py-2 pr-3 text-xs md:text-right">
                                {p.value} <span className="text-muted-foreground">{p.unit}</span>
                            </td>
                            <td data-label="Kind" className="py-2 pr-3">
                                <span className={cn("rounded-sm border px-1.5 py-0.5 text-[11px]", KIND_STYLE[p.kind])}>{p.kind}</span>
                            </td>
                            <td data-label="Source" className="py-2 text-xs leading-relaxed text-muted-foreground">{p.source}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
};

const Explainer = ({ data }: { data: ValidationReport | null }) => (
    <section aria-label="What sealed validation means" className="rounded-md border border-border bg-card/40 p-4 sm:p-5">
        <h3 className="text-base font-medium tracking-tight">What sealed validation means</h3>
        <ol className="mt-3 grid gap-4 text-sm leading-relaxed text-muted-foreground md:grid-cols-3">
            <li><span className="tnum mb-1 block text-foreground">1. Fit</span>The model is calibrated on a few real trials only. Other trials stay unopened.</li>
            <li><span className="tnum mb-1 block text-foreground">2. Freeze</span>Predictions are written down and hashed with the code and the pass marks, before any held-out result is read.</li>
            <li><span className="tnum mb-1 block text-foreground">3. Open once</span>The real results are opened and compared. Any change after that is recorded, and a miss stays a miss.</li>
        </ol>
        {data && (
            <p className="tnum mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground" data-testid="seal-record">
                This run: {data.blind ? "sealed" : "seal broken, because the code or parameters changed after the results were first opened"} · opened {data.openings} {data.openings === 1 ? "time" : "times"} · {data.n_draws} parameter draws · {data.prediction_n} virtual patients per prediction · parameters <span className="break-all">{data.posterior_sha256.slice(0, 12)}</span>
            </p>
        )}
        {data?.reading_note && <p className="mt-3 text-sm leading-relaxed" data-testid="reading-note">{data.reading_note}</p>}
    </section>
);

const Row = ({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) => (
    <div className="contents">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className={cn("tnum text-right", strong && "font-semibold")}>{value}</dd>
    </div>
);

const Facts = ({ report }: { report: ValidationReport }) => {
    const { score } = report;
    const chainFails = report.converged === false;
    return (
        <div className="min-w-0 space-y-4">
            <section aria-label="Calibration chain" className={cn("rounded-md border p-4", chainFails ? "border-2 border-[hsl(var(--fail))]" : "border-border")} data-testid="chain-panel">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">Calibration chain</h3>
                    {report.converged === null ? <span className="text-xs text-muted-foreground">Not reported</span> : <CheckBadge passed={report.converged} />}
                </div>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                    <Row label="Converged" value={report.converged === null ? "Not reported" : report.converged ? "Yes" : "No"} strong={chainFails} />
                    <Row label="Largest split R-hat" value={report.max_split_rhat === null ? "Not reported" : fmtNum(report.max_split_rhat)} />
                    <Row label="Length over autocorrelation time" value={report.length_over_tau === null ? "Not reported" : fmtNum(report.length_over_tau, 1)} />
                    <Row label="Sealed run" value={report.blind ? "Yes" : "No, seal broken"} strong={!report.blind} />
                </dl>
                {chainFails && <div className="mt-3"><ChainFlag /></div>}
            </section>
            <section aria-label="Against a simple rival" className="rounded-md border border-border p-4" data-testid="rival-panel">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium"><span className="tnum text-muted-foreground">V6</span> Against a simple rival</h3>
                    <CheckBadge passed={score.beats_null} />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    The rival has no physiology. It carries the training trials&rsquo; effects forward by drug and dose. If the simulator can&rsquo;t beat that, its machinery adds nothing to the prediction.
                </p>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                    <Row label="Model mean error" value={fmtNum(score.mae)} />
                    <Row label="Rival mean error" value={fmtNum(score.null_mae)} />
                    <Row label="Model minus rival" value={fmtNum(score.model_minus_null_mae)} />
                    <Row label="95% interval, by trial" value={fmtInterval(score.model_minus_null_ci95)} />
                </dl>
            </section>
            <section aria-label="Interval coverage" className="rounded-md border border-border p-4" data-testid="coverage-panel">
                <h3 className="text-sm font-medium">How honest are the intervals?</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Share of observed results inside each predictive interval. A trustworthy interval covers about what its name says.</p>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                    <Row label="Inside the 50% interval" value={fmtShare(score.coverage_50pi)} />
                    <Row label="Inside the 80% interval" value={fmtShare(score.coverage_80pi)} />
                    <Row label="Inside the 95% interval" value={fmtShare(score.coverage_95pi)} />
                    <Row label="Average width of the 95% interval" value={`${fmtNum(score.mean_pi95_width)} pts`} />
                </dl>
            </section>
        </div>
    );
};

const Context = ({ report }: { report: ValidationReport }) => (
    <section className="grid gap-8 lg:grid-cols-2" aria-label="More on the validation run">
        <div className="min-w-0 lg:col-span-2">
            <h3 className="mb-3 text-base font-medium tracking-tight">By trial</h3>
            <table className="stack-table w-full text-sm" data-testid="by-trial-table">
                <thead>
                    <tr className="border-b border-border text-left">
                        <th scope="col" className="label-caps py-2 pr-3 font-medium">Trial</th>
                        <th scope="col" className="label-caps py-2 pr-3 text-right font-medium">Contrasts</th>
                        <th scope="col" className="label-caps py-2 pr-3 text-right font-medium">Model mean error</th>
                        <th scope="col" className="label-caps py-2 text-right font-medium">Rival mean error</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(report.by_trial).map(([name, row]) => (
                        <tr key={name} className="border-b border-[hsl(var(--rule))] transition-colors hover:bg-card/70">
                            <td data-label="" className="py-2 pr-3 font-medium md:font-normal">{name}{row.thin_pool && <ThinTag />}</td>
                            <td data-label="Contrasts" className="tnum py-2 pr-3 md:text-right">{row.contrasts}</td>
                            <td data-label="Model mean error" className="tnum py-2 pr-3 md:text-right">{fmtNum(row.mae)}</td>
                            <td data-label="Rival mean error" className="tnum py-2 md:text-right">{fmtNum(row.null_mae)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        <div className="min-w-0" data-testid="sensitivity-panel">
            <h3 className="text-base font-medium tracking-tight">If the fixed assumptions were different</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The largest shift in any contrast, in HbA1c points, without refitting. No outcome was used.</p>
            <ul className="mt-3">
                {Object.entries(report.assumption_sensitivity).map(([label, value]) => (
                    <li key={label} className="flex items-baseline justify-between gap-3 border-t border-[hsl(var(--rule))] py-1.5 text-xs">
                        <span className="tnum min-w-0 break-words">{label}</span>
                        <span className="tnum shrink-0 font-medium">{fmtNum(value.largest_shift)}</span>
                    </li>
                ))}
            </ul>
        </div>
        <div className="min-w-0" data-testid="renal-panel">
            <h3 className="text-base font-medium tracking-tight">Urinary glucose by kidney function</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Context for the kidney check, compared without opening the seal: the model&rsquo;s ratio to normal kidney function.</p>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-[hsl(var(--rule))] pt-2 text-xs">
                <Row label="Mild impairment" value={fmtNum(report.renal_precheck.model_ratio_mild)} />
                <Row label="Moderate impairment" value={fmtNum(report.renal_precheck.model_ratio_moderate)} />
            </dl>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{report.renal_precheck.reference}</p>
        </div>
    </section>
);

/** Everything the validation run found, misses included, and every parameter behind it. */
export const ProofTab = ({ validation, onRetry }: { validation: RemoteState<Loaded<ValidationReport>>; onRetry: () => void }) => {
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const report = validation.status === "success" ? validation.data.data : null;
    const notRun = validation.status === "error" && validation.error instanceof ApiError && validation.error.kind === "not-found";
    return (
        <div className="space-y-8" data-testid="proof-tab">
            <Explainer data={report} />
            {(validation.status === "loading" || validation.status === "idle") && <LoadingRows label="the validation results" />}
            {notRun && <EmptyState>Held-out validation has not been run yet, so there are no contrasts to show. This page shows them as soon as a sealed run has finished, whatever the result.</EmptyState>}
            {validation.status === "error" && !notRun && (
                <ErrorCallout error={validation.error instanceof ApiError ? validation.error : new ApiError("server", "The validation results couldn't be loaded.")} onRetry={onRetry} />
            )}
            {report && validation.status === "success" && (
                <>
                    <section aria-label="Pre-registered checks" className="grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
                        {checksFrom(report.score, report.pass_marks).map((check) => (
                            <div key={check.id} className="bg-background p-4" data-testid="proof-check" data-check={check.id}>
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-medium"><span className="tnum text-muted-foreground">{check.id}</span> {check.title}</p>
                                    <CheckBadge passed={check.passed} />
                                </div>
                                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{check.rule}</p>
                            </div>
                        ))}
                    </section>
                    <section aria-labelledby="scatter-heading" className="grid gap-8 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 id="scatter-heading" className="text-base font-medium tracking-tight">Predicted against observed</h3>
                                <ProvenanceTag provenance={validation.data.provenance} />
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                HbA1c contrasts in points. Mean error {fmtNum(report.score.mae)}, average signed error {fmtNum(report.score.bias)}, {fmtShare(report.score.within_0_30)} within ±0.30.
                            </p>
                            <div className="mt-4">
                                <ValidationScatter contrasts={report.contrasts} activeKey={activeKey} onActive={setActiveKey} />
                            </div>
                        </div>
                        <Facts report={report} />
                    </section>
                    <section aria-label="Every contrast">
                        <h3 className="mb-3 text-base font-medium tracking-tight">Every contrast</h3>
                        <ContrastTable contrasts={report.contrasts} activeKey={activeKey} onActive={setActiveKey} />
                    </section>
                    <Context report={report} />
                </>
            )}
            <section aria-labelledby="parameters-heading">
                <h3 id="parameters-heading" className="text-base font-medium tracking-tight">Every number in the model</h3>
                <p className="mt-1 mb-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                    Published values are read from a cited source. Calibrated values are fitted to the training trials. Assumed values have no direct source and are listed so they can be questioned.
                </p>
                <ParametersTable />
            </section>
        </div>
    );
};
