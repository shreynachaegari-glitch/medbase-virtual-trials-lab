import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import {
    Bookmark,
    Check,
    FileJson,
    FileSpreadsheet,
    Link2,
    LoaderCircle,
    RotateCcw,
    Shuffle,
    Trash2,
} from "lucide-react";
import { ProvenanceTag } from "@/components/Provenance";
import TrajectoryChart, { type TrajectorySeries } from "@/components/charts/TrajectoryChart";
import DistributionChart from "@/components/charts/DistributionChart";
import TornadoChart from "@/components/charts/TornadoChart";
import ParameterControl from "./ParameterControl";
import { Chip, Disclosure, Segmented } from "./primitives";
import { downloadFile, useCopy, useLocalStorage } from "./utils";
import {
    activePreset,
    allParams,
    changedParams,
    compare,
    constantParamIds,
    COHORT_N,
    decodeExperiment,
    defaultExperiment,
    encodeExperiment,
    HORIZON,
    patientParamIds,
    presets,
    provenanceMix,
    referenceArm,
    runExperiment,
    runSensitivity,
    SEED_MAX,
    toCsv,
    toManifest,
    type ArmRun,
    type ExperimentConfig,
} from "@/sim/experiment";
import type { Endpoint } from "@/sim/cohort";
import { spreadParams, treatmentArms } from "@/sim/params";
import { cn } from "@/lib/utils";

const ARM_COLOR: Record<string, string> = {
    none: "var(--series-1)",
    metformin: "var(--series-2)",
    lifestyle: "var(--series-3)",
    sulfonylurea: "var(--series-4)",
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pp = (v: number) => `${v > 0 ? "−" : v < 0 ? "+" : "±"}${Math.abs(v * 100).toFixed(1)} pp`;
const hba1c = (v: number) => `${v.toFixed(1)}%`;

const endpointMeta: Record<Endpoint, { label: string; short: string; note: string }> = {
    micro: {
        label: "Microvascular complications",
        short: "Microvascular",
        note: "hazard scaled to updated mean HbA1c (UKPDS 35: −37% per 1-point reduction)",
    },
    mi: {
        label: "Myocardial infarction",
        short: "MI",
        note: "hazard scaled to updated mean HbA1c (UKPDS 35: −14% per 1-point reduction)",
    },
};

interface SavedExperiment {
    id: string;
    name: string;
    savedAt: string;
    query: string;
}

const specById = Object.fromEntries(allParams.map((p) => [p.id, p]));

const SimulatePanel = ({
    config,
    setConfig,
    shareUrl,
}: {
    config: ExperimentConfig;
    setConfig: (next: ExperimentConfig | ((prev: ExperimentConfig) => ExperimentConfig)) => void;
    shareUrl: string;
}) => {
    const [endpoint, setEndpoint] = useState<Endpoint>("micro");
    const [sensArm, setSensArm] = useState<string | null>(null);
    const [saved, setSaved] = useLocalStorage<SavedExperiment[]>("medbase.lab.experiments.v1", []);
    const [naming, setNaming] = useState<string | null>(null);
    const { copied, copy } = useCopy();

    // Sliders stay responsive: the cohort recomputes against a deferred copy of the config,
    // so a drag never waits on a large simulated cohort.
    const deferred = useDeferredValue(config);
    const stale = deferred !== config;
    const run = useMemo(() => runExperiment(deferred), [deferred]);

    const setValue = (id: string, v: number) =>
        setConfig((prev) => ({ ...prev, values: { ...prev.values, [id]: v } }));

    const toggleArm = (id: string) =>
        setConfig((prev) => ({
            ...prev,
            arms: prev.arms.includes(id) ? prev.arms.filter((a) => a !== id) : [...prev.arms, id],
        }));

    const changes = changedParams(config);
    const preset = activePreset(config);
    const isDefault =
        changes.length === 0 && encodeExperiment(config).toString() === encodeExperiment(defaultExperiment()).toString();

    const last = run.years.length - 1;
    const ref = referenceArm(run);
    const sensitivityArmId =
        sensArm && deferred.arms.includes(sensArm) ? sensArm : (run.arms[0]?.arm.id ?? treatmentArms[0].id);
    const sensitivity = useMemo(
        () => runSensitivity(deferred, sensitivityArmId, endpoint),
        [deferred, sensitivityArmId, endpoint],
    );
    const mix = provenanceMix(deferred);

    const series = (pick: (a: ArmRun) => ArmRun["micro"]): TrajectorySeries[] =>
        run.arms.map((a) => {
            const band = pick(a);
            return {
                id: a.arm.id,
                label: a.arm.shortLabel,
                color: ARM_COLOR[a.arm.id],
                values: band.mean,
                band: band.lo && band.hi ? { lo: band.lo, hi: band.hi } : undefined,
            };
        });
    const hbSeries = series((a) => a.hbA1c);
    const outcomeSeries = series((a) => a[endpoint]);
    const outcomeMax = Math.max(0.01, ...outcomeSeries.flatMap((s) => s.band?.hi ?? s.values));

    const stamp = new Date().toISOString().slice(0, 10);
    const fileBase = `medbase-t2d-${stamp}-seed${deferred.seed}`;

    const saveCurrent = (name: string) => {
        const entry: SavedExperiment = {
            id: `${Date.now()}`,
            name: name.trim() || `Experiment ${saved.length + 1}`,
            savedAt: new Date().toISOString(),
            query: encodeExperiment(config).toString(),
        };
        setSaved((prev) => [entry, ...prev].slice(0, 20));
        setNaming(null);
    };

    return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
            {/* ------------------------------ controls ------------------------------ */}
            <aside
                aria-label="Experiment set-up"
                className="min-w-0 space-y-6 lg:sticky lg:top-[7.5rem] lg:max-h-[calc(100vh-8.5rem)] lg:overflow-y-auto lg:pb-6 lg:pr-3 [scrollbar-width:thin]"
            >
                <a
                    href="#lab-results"
                    className="flex items-center justify-center rounded-md border border-border py-2 text-xs text-muted-foreground hover:text-foreground lg:hidden"
                >
                    Jump to results ↓
                </a>

                <section>
                    <div className="mb-2.5 flex items-baseline justify-between">
                        <h2 className="label-caps">Start from</h2>
                        <span className="text-[11px] text-muted-foreground">illustrative archetypes</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {presets.map((p) => (
                            <Chip
                                key={p.id}
                                active={preset?.id === p.id}
                                title={p.blurb}
                                onClick={() => setConfig((prev) => ({ ...prev, values: { ...prev.values, ...p.values } }))}
                            >
                                {p.label}
                            </Chip>
                        ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        {preset ? preset.blurb : "Custom patient."} Archetypes set patient inputs only — they
                        are not published subtypes.
                    </p>
                </section>

                <section className="border-t border-border pt-5">
                    <h2 className="label-caps mb-3">Virtual patient</h2>
                    <div className="space-y-5">
                        {patientParamIds.map((id) => (
                            <ParameterControl
                                key={id}
                                spec={specById[id]}
                                value={config.values[id]}
                                onChange={(v) => setValue(id, v)}
                            />
                        ))}
                    </div>
                </section>

                <section className="border-t border-border pt-5">
                    <div className="mb-3 flex items-baseline justify-between">
                        <h2 className="label-caps">Comparison arms</h2>
                        <span className="tnum text-[11px] text-muted-foreground">
                            {config.arms.length} of {treatmentArms.length}
                        </span>
                    </div>
                    <div className="space-y-2">
                        {treatmentArms.map((arm) => {
                            const on = config.arms.includes(arm.id);
                            return (
                                <div
                                    key={arm.id}
                                    className={cn(
                                        "rounded-md border px-3 py-2.5 transition-colors",
                                        on ? "border-border bg-card" : "border-border/50 bg-transparent",
                                    )}
                                >
                                    <label className="flex cursor-pointer items-start gap-2.5">
                                        <input
                                            type="checkbox"
                                            checked={on}
                                            onChange={() => toggleArm(arm.id)}
                                            className="mt-[3px] h-3.5 w-3.5 shrink-0"
                                            style={{ accentColor: ARM_COLOR[arm.id] }}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2 text-sm">
                                                <span
                                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                                    style={{ background: ARM_COLOR[arm.id], opacity: on ? 1 : 0.35 }}
                                                />
                                                <span className={on ? "" : "text-muted-foreground"}>{arm.label}</span>
                                            </span>
                                            <span className="tnum mt-0.5 block text-[11px] text-muted-foreground">
                                                {arm.hbA1cShift === 0 ? "no shift" : `${arm.hbA1cShift.toFixed(2)} pp HbA1c`}
                                                {arm.driftMultiplier !== 1 && ` · drift ×${arm.driftMultiplier}`}
                                            </span>
                                            {arm.caveat && (
                                                <span className="mt-0.5 block text-[11px] text-[hsl(var(--prov-extrapolated))]">
                                                    {arm.caveat}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                    <ProvenanceTag provenance={arm.provenance} className="ml-6 mt-1.5" />
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className="border-t border-border pt-5">
                    <h2 className="label-caps mb-1">Model constants</h2>
                    <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">
                        The absolute hazards below are the model&rsquo;s least-supported inputs — check
                        the sensitivity panel before trusting a number.
                    </p>
                    <div className="space-y-5">
                        {constantParamIds.map((id) => (
                            <ParameterControl
                                key={id}
                                spec={specById[id]}
                                value={config.values[id]}
                                onChange={(v) => setValue(id, v)}
                            />
                        ))}
                    </div>
                </section>

                <section className="border-t border-border pt-5">
                    <h2 className="label-caps mb-3">Run settings</h2>
                    <div className="space-y-5">
                        <div>
                            <div className="flex items-baseline justify-between">
                                <label htmlFor="horizon" className="text-sm">
                                    Horizon
                                </label>
                                <span className="tnum text-sm font-medium">{config.horizon} yr</span>
                            </div>
                            <input
                                id="horizon"
                                type="range"
                                min={HORIZON.min}
                                max={HORIZON.max}
                                step={1}
                                value={config.horizon}
                                onChange={(e) => setConfig((prev) => ({ ...prev, horizon: Number(e.target.value) }))}
                                className="mt-2"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p id="cohort-label" className="text-sm">
                                    Cohort mode
                                </p>
                                <p className="text-[11px] text-muted-foreground">Seeded Monte Carlo over varied patients</p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={config.cohort}
                                aria-labelledby="cohort-label"
                                onClick={() => setConfig((prev) => ({ ...prev, cohort: !prev.cohort }))}
                                className={cn(
                                    "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
                                    config.cohort ? "border-primary bg-primary" : "border-input bg-secondary",
                                )}
                            >
                                <span
                                    className={cn(
                                        "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-foreground transition-[left] duration-150",
                                        config.cohort ? "left-[18px]" : "left-[2px]",
                                    )}
                                />
                            </button>
                        </div>

                        {config.cohort && (
                            <>
                                <div>
                                    <div className="flex items-baseline justify-between">
                                        <label htmlFor="cohort-n" className="text-sm">
                                            Virtual patients per arm
                                        </label>
                                        <span className="tnum text-sm font-medium">{config.n.toLocaleString()}</span>
                                    </div>
                                    <input
                                        id="cohort-n"
                                        type="range"
                                        min={COHORT_N.min}
                                        max={COHORT_N.max}
                                        step={COHORT_N.step}
                                        value={config.n}
                                        onChange={(e) => setConfig((prev) => ({ ...prev, n: Number(e.target.value) }))}
                                        className="mt-2"
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <label htmlFor="seed" className="text-sm">
                                        Seed
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            id="seed"
                                            type="number"
                                            min={0}
                                            max={SEED_MAX}
                                            value={config.seed}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    seed: Math.min(SEED_MAX, Math.max(0, Math.trunc(Number(e.target.value) || 0))),
                                                }))
                                            }
                                            className="tnum h-8 w-24 rounded border border-input bg-card px-2 text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setConfig((prev) => ({ ...prev, seed: Math.floor(Math.random() * 100000) }))
                                            }
                                            className="inline-flex h-8 items-center gap-1.5 rounded border border-input px-2 text-xs hover:bg-secondary"
                                        >
                                            <Shuffle className="h-3 w-3" aria-hidden="true" />
                                            Re-draw
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[11px] leading-relaxed text-muted-foreground">
                                    Same seed, same cohort. Every arm is run on the same sampled patients, so
                                    differences between arms are paired, not two independent draws.
                                </p>

                                <Disclosure summary="Cohort heterogeneity (between-patient spread)">
                                    <div className="space-y-5">
                                        {spreadParams.map((p) => (
                                            <ParameterControl
                                                key={p.id}
                                                spec={p}
                                                value={config.values[p.id]}
                                                onChange={(v) => setValue(p.id, v)}
                                            />
                                        ))}
                                    </div>
                                </Disclosure>
                            </>
                        )}
                    </div>
                </section>

                <div className="flex items-center justify-between border-t border-border pt-4">
                    <span className="tnum text-[11px] text-muted-foreground">
                        {changes.length === 0 ? "All parameters at defaults" : `${changes.length} parameter${changes.length === 1 ? "" : "s"} changed`}
                    </span>
                    <button
                        type="button"
                        disabled={isDefault}
                        onClick={() => setConfig(defaultExperiment())}
                        className="inline-flex items-center gap-1.5 rounded border border-input px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-40"
                    >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Reset experiment
                    </button>
                </div>
            </aside>

            {/* ------------------------------ results ------------------------------ */}
            <div id="lab-results" className="min-w-0 scroll-mt-32 space-y-9">
                {/* Toolbar */}
                <div className="flex flex-col gap-3 rounded-md border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="tnum flex items-center gap-2 text-xs text-muted-foreground">
                            {stale ? (
                                <LoaderCircle className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />
                            ) : (
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--prov-derived))]" aria-hidden="true" />
                            )}
                            <span aria-live="polite">
                                {deferred.cohort
                                    ? `${deferred.n.toLocaleString()} patients × ${deferred.arms.length} arm${deferred.arms.length === 1 ? "" : "s"} · seed ${deferred.seed}`
                                    : `Single deterministic patient × ${deferred.arms.length} arm${deferred.arms.length === 1 ? "" : "s"}`}{" "}
                                · {deferred.horizon} yr
                            </span>
                        </p>
                        <EvidenceMix mix={mix} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <ToolbarButton onClick={() => copy(shareUrl, "link")} icon={copied === "link" ? Check : Link2}>
                            {copied === "link" ? "Link copied" : "Copy link"}
                        </ToolbarButton>
                        <span className="text-[11px] text-muted-foreground" data-testid="share-link-note">
                            Links carry these settings. Don&rsquo;t enter real patient values.
                        </span>
                        <ToolbarButton
                            disabled={run.arms.length === 0}
                            onClick={() => downloadFile(`${fileBase}.csv`, toCsv(run, deferred.cohort), "text/csv")}
                            icon={FileSpreadsheet}
                        >
                            CSV
                        </ToolbarButton>
                        <ToolbarButton
                            disabled={run.arms.length === 0}
                            onClick={() =>
                                downloadFile(
                                    `${fileBase}.json`,
                                    JSON.stringify(toManifest(deferred, run, shareUrl), null, 2),
                                    "application/json",
                                )
                            }
                            icon={FileJson}
                        >
                            Manifest
                        </ToolbarButton>
                        <ToolbarButton onClick={() => setNaming(`Experiment ${saved.length + 1}`)} icon={Bookmark}>
                            Save
                        </ToolbarButton>
                    </div>
                </div>

                {naming !== null && (
                    <form
                        className="-mt-5 flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            saveCurrent(naming);
                        }}
                    >
                        <label htmlFor="save-name" className="text-xs text-muted-foreground">
                            Name this experiment
                        </label>
                        <input
                            id="save-name"
                            autoFocus
                            value={naming}
                            onChange={(e) => setNaming(e.target.value)}
                            onKeyDown={(e) => e.key === "Escape" && setNaming(null)}
                            maxLength={80}
                            className="h-8 min-w-0 flex-1 rounded border border-input bg-card px-2 text-sm"
                        />
                        <button type="submit" className="h-8 rounded bg-foreground px-3 text-xs font-medium text-background">
                            Save
                        </button>
                        <button type="button" onClick={() => setNaming(null)} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
                            Cancel
                        </button>
                        <p className="w-full text-[11px] text-muted-foreground">
                            Stored in this browser only. Use “Copy link” to share or archive a run.
                        </p>
                    </form>
                )}

                {run.arms.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                        Select at least one comparison arm to run the experiment.
                    </p>
                ) : (
                    <>
                        {/* Headline */}
                        <section aria-labelledby="headline-h">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <h2 id="headline-h" className="text-sm font-semibold">
                                    Outcome at {deferred.horizon} years
                                </h2>
                                <Segmented
                                    label="Endpoint"
                                    value={endpoint}
                                    onChange={setEndpoint}
                                    options={[
                                        { id: "micro", label: "Microvascular" },
                                        { id: "mi", label: "Myocardial infarction" },
                                    ]}
                                />
                            </div>
                            <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 2xl:grid-cols-4">
                                {run.arms.map((a) => {
                                    const band = a[endpoint];
                                    const value = band.mean[last];
                                    const cmp = ref && a !== ref ? compare(ref[endpoint].mean[last], value) : undefined;
                                    return (
                                        <div key={a.arm.id} className="bg-background p-4">
                                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="inline-block h-2 w-2 rounded-full" style={{ background: ARM_COLOR[a.arm.id] }} />
                                                {a.arm.shortLabel}
                                                {a === ref && run.arms.length > 1 && (
                                                    <span className="label-caps text-[10px]">reference</span>
                                                )}
                                            </p>
                                            <p className="tnum mt-2 text-2xl font-medium tracking-tight">{pct(value)}</p>
                                            <p className="tnum mt-0.5 text-[11px] text-muted-foreground">
                                                {band.lo && band.hi
                                                    ? `p10–p90 ${pct(band.lo[last])}–${pct(band.hi[last])}`
                                                    : "single patient"}
                                                {" · "}HbA1c {hba1c(a.hbA1c.mean[last])}
                                            </p>
                                            <div className="tnum mt-3 border-t border-border pt-2.5 text-xs">
                                                {cmp ? (
                                                    <>
                                                        <p className={cmp.absoluteReduction >= 0 ? "text-[hsl(var(--prov-derived))]" : "text-destructive"}>
                                                            {pp(cmp.absoluteReduction)} vs {ref!.arm.shortLabel.toLowerCase()}
                                                        </p>
                                                        <p className="mt-0.5 text-muted-foreground">
                                                            {deferred.cohort
                                                                ? cmp.nnt === undefined
                                                                    ? "No meaningful difference"
                                                                    : cmp.nnt > 0
                                                                      ? `NNT ${Math.ceil(cmp.nnt)} over ${deferred.horizon} yr`
                                                                      : `NNH ${Math.ceil(-cmp.nnt)} over ${deferred.horizon} yr`
                                                                : "NNT needs cohort mode"}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <p className="text-muted-foreground">
                                                        {run.arms.length > 1 ? "Comparator for the other arms" : "Add an arm to compare"}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                                {deferred.cohort
                                    ? "Cohort means. NNT is the model's number of virtual patients treated per event avoided over the horizon — a statement about the model, not a trial result."
                                    : "One deterministic virtual patient. Switch on cohort mode for spread, paired differences and NNT."}
                            </p>
                        </section>

                        <section aria-labelledby="traj-h">
                            <ChartHeader
                                id="traj-h"
                                title="HbA1c trajectory"
                                note={deferred.cohort ? `cohort mean, shaded p10–p90 across ${deferred.n.toLocaleString()} patients` : "single patient"}
                            />
                            <Legend arms={run.arms} />
                            <TrajectoryChart years={run.years} series={hbSeries} yLabel="HbA1c (%)" format={hba1c} />
                        </section>

                        <section aria-labelledby="outcome-h">
                            <ChartHeader id="outcome-h" title={`Cumulative ${endpointMeta[endpoint].label.toLowerCase()}`} note={endpointMeta[endpoint].note} />
                            <Legend arms={run.arms} />
                            <TrajectoryChart
                                years={run.years}
                                series={outcomeSeries}
                                yLabel={`Cumulative ${endpointMeta[endpoint].short} incidence`}
                                format={pct}
                                yDomain={[0, outcomeMax * 1.1]}
                            />
                        </section>

                        {deferred.cohort && (
                            <section aria-labelledby="spread-h">
                                <ChartHeader
                                    id="spread-h"
                                    title="Outcome spread across the cohort"
                                    note={`${endpointMeta[endpoint].short} incidence at ${deferred.horizon} yr · seed ${deferred.seed}`}
                                />
                                <DistributionChart
                                    arms={run.arms.map((a) => ({
                                        id: a.arm.id,
                                        label: a.arm.label,
                                        color: ARM_COLOR[a.arm.id],
                                        values: a.final![endpoint],
                                    }))}
                                    format={pct}
                                />
                                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                                    Spread reflects only the between-patient variation configured under cohort
                                    heterogeneity — it is not a confidence interval and excludes uncertainty in
                                    the parameters themselves.
                                </p>
                            </section>
                        )}

                        <section aria-labelledby="sens-h" className="border-t border-border pt-6">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 id="sens-h" className="text-sm font-semibold">
                                        What is actually driving this result
                                    </h2>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Swing in {deferred.horizon}-yr {endpointMeta[endpoint].short.toLowerCase()} incidence as each
                                        parameter moves across its full range, others held fixed
                                    </p>
                                </div>
                                {run.arms.length > 1 && (
                                    <Segmented
                                        label="Arm for sensitivity analysis"
                                        size="xs"
                                        value={sensitivityArmId}
                                        onChange={setSensArm}
                                        options={run.arms.map((a) => ({ id: a.arm.id, label: a.arm.shortLabel }))}
                                    />
                                )}
                            </div>
                            <TornadoChart
                                entries={sensitivity}
                                provenanceFor={(id) => specById[id].provenance.kind}
                                format={pct}
                            />
                        </section>
                    </>
                )}

                {saved.length > 0 && (
                    <section aria-labelledby="saved-h" className="border-t border-border pt-6">
                        <h2 id="saved-h" className="text-sm font-semibold">
                            Saved experiments
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">In this browser only.</p>
                        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                            {saved.map((s) => {
                                const c = decodeExperiment(new URLSearchParams(s.query));
                                const current = s.query === encodeExperiment(config).toString();
                                return (
                                    <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm">
                                                {s.name}
                                                {current && <span className="label-caps ml-2 text-[10px] text-primary">loaded</span>}
                                            </p>
                                            <p className="tnum text-[11px] text-muted-foreground">
                                                {new Date(s.savedAt).toLocaleDateString()} · HbA1c {c.values.baselineHbA1c}% · {c.arms.length} arm
                                                {c.arms.length === 1 ? "" : "s"} · {c.horizon} yr{c.cohort ? ` · n ${c.n} · seed ${c.seed}` : ""}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={current}
                                            onClick={() => setConfig(c)}
                                            className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                                        >
                                            Load
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSaved((prev) => prev.filter((x) => x.id !== s.id))}
                                            aria-label={`Delete saved experiment ${s.name}`}
                                            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    );
};

const ToolbarButton = ({
    onClick,
    icon: Icon,
    children,
    disabled,
}: {
    onClick: () => void;
    icon: typeof Link2;
    children: ReactNode;
    disabled?: boolean;
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-40"
    >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {children}
    </button>
);

const ChartHeader = ({ id, title, note }: { id: string; title: string; note: string }) => (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h2 id={id} className="text-sm font-semibold">
            {title}
        </h2>
        <span className="text-xs text-muted-foreground">{note}</span>
    </div>
);

const Legend = ({ arms }: { arms: ArmRun[] }) => (
    <div className="mb-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        {arms.map((a) => (
            <span key={a.arm.id} className="flex items-center gap-1.5">
                <span className="inline-block h-[2px] w-4" style={{ background: ARM_COLOR[a.arm.id] }} />
                <span className="text-muted-foreground">{a.arm.label}</span>
            </span>
        ))}
    </div>
);

/** How much of the current run rests on published numbers versus assumptions. */
const EvidenceMix = ({ mix }: { mix: ReturnType<typeof provenanceMix> }) => {
    const parts = [
        { kind: "derived", n: mix.derived, color: "hsl(var(--prov-derived))" },
        { kind: "extrapolated", n: mix.extrapolated, color: "hsl(var(--prov-extrapolated))" },
        { kind: "illustrative", n: mix.illustrative, color: "hsl(var(--prov-illustrative))" },
    ];
    return (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div
                className="flex h-1.5 w-28 overflow-hidden rounded-full bg-secondary"
                role="img"
                aria-label={`Inputs to this run: ${mix.derived} derived from a source, ${mix.extrapolated} extrapolated, ${mix.illustrative} illustrative`}
            >
                {parts.map((p) => (
                    <span key={p.kind} style={{ width: `${(p.n / mix.total) * 100}%`, background: p.color }} />
                ))}
            </div>
            <span className="tnum text-[11px] text-muted-foreground">
                {parts.map((p, i) => (
                    <span key={p.kind}>
                        {i > 0 && " · "}
                        <span style={{ color: p.color }}>{p.n}</span> {p.kind}
                    </span>
                ))}{" "}
                inputs
            </span>
        </div>
    );
};

export default SimulatePanel;
