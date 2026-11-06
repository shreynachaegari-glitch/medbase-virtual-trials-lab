import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Gauge, LoaderCircle } from "lucide-react";
import { useRemote } from "@/hooks/useRemote";
import { loadSnapshotAt } from "@/lib/trials/api";
import { BACKGROUNDS, drugName, egfrLabel, fmtNum } from "@/lib/trials/format";
import { doseAt, doseResponse, isSurrogate, predict, type SurrogateNet } from "@/lib/trials/surrogate";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/lab/primitives";
import { niceTicks } from "@/components/charts/ticks";
import { useElementWidth } from "@/components/charts/useElementWidth";

export interface FullRunRequest {
    drug: string;
    mg: number;
    weeks: number;
    egfrLow: number;
    egfrHigh: number;
    predictedA1c: number;
    predictedWeight: number;
}

export type FullRunState =
    | { status: "idle" }
    | { status: "running" }
    | { status: "error"; message: string }
    | { status: "done"; a1c: number; weight: number; predictedA1c: number; predictedWeight: number };

/** The surrogate's training stops eGFR at 150 to stand for "no upper limit", as the trial form's 400 does. */
const OPEN_ENDED_TRAINING = 150;
const OPEN_ENDED_FORM = 400;
/** The trainer never saw metformin below this, because the label restricts it there. */
const METFORMIN_EGFR_FLOOR = 45;
const bandLabel = ([low, high]: [number, number]) => egfrLabel(low, high >= OPEN_ENDED_TRAINING ? OPEN_ENDED_FORM : high);

const CHART_HEIGHT = 170;
const PAD = { top: 10, right: 12, bottom: 28, left: 42 };

const Curve = ({ net, drug, weeks, targetA1c, egfrLow, egfrHigh, position, unit }: { net: SurrogateNet; drug: string; weeks: number; targetA1c: number; egfrLow: number; egfrHigh: number; position: number; unit: string }) => {
    const { ref, width } = useElementWidth<HTMLDivElement>(420);
    const curve = useMemo(() => doseResponse(net, { drug, weeks, targetA1c, egfrLow, egfrHigh }, "hba1c_vs_placebo"), [net, drug, weeks, targetA1c, egfrLow, egfrHigh]);
    const values = curve.map((p) => p.value);
    const lo = Math.min(...values, 0);
    const hi = Math.max(...values, 0);
    const margin = (hi - lo) * 0.1 || 0.2;
    const min = lo - margin;
    const max = hi + margin;
    const plotW = Math.max(40, width - PAD.left - PAD.right);
    const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
    const x = (p: number) => PAD.left + p * plotW;
    const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;
    const [low, high] = net.dose_ranges[drug];
    const here = curve.reduce((best, p) => (Math.abs(p.position - position) < Math.abs(best.position - position) ? p : best));
    return (
        <div ref={ref} data-testid="surrogate-curve">
            <svg viewBox={`0 0 ${width} ${CHART_HEIGHT}`} width={width} height={CHART_HEIGHT} className="max-w-full" role="img" aria-label={`AI surrogate of the simulator: dose against HbA1c change from placebo for ${drug}, from ${low} to ${high} ${unit}.`}>
                {niceTicks(min, max, 4).map((t) => (
                    <g key={t}>
                        <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "hsl(var(--foreground) / 0.4)" : "hsl(var(--rule))"} />
                        <text x={PAD.left - 7} y={y(t) + 4} textAnchor="end" className="tnum fill-muted-foreground text-[11px]">{fmtNum(t, 1)}</text>
                    </g>
                ))}
                <path d={curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.position)},${y(p.value)}`).join(" ")} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
                <line x1={x(position)} x2={x(position)} y1={PAD.top} y2={PAD.top + plotH} stroke="hsl(var(--foreground))" strokeDasharray="3 3" opacity={0.5} />
                <circle cx={x(position)} cy={y(predict(net, { drug, mg: here.mg, weeks, targetA1c, egfrLow, egfrHigh }).hba1c_vs_placebo)} r={5} fill="hsl(var(--foreground))" stroke="hsl(var(--background))" strokeWidth={2} />
                <text x={PAD.left} y={CHART_HEIGHT - 8} className="tnum fill-muted-foreground text-[11px]">{low} {unit}</text>
                <text x={PAD.left + plotW} y={CHART_HEIGHT - 8} textAnchor="end" className="tnum fill-muted-foreground text-[11px]">{high} {unit}</text>
                <text x={PAD.left + plotW / 2} y={CHART_HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase" style={{ letterSpacing: "0.08em" }}>Dose, log scale</text>
            </svg>
        </div>
    );
};

const Slider = ({ id, label, value, display, min, max, step, onChange, hint }: { id: string; label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void; hint?: string }) => (
    <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
            <span className="tnum text-sm font-medium">{display}</span>
        </div>
        <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={display} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 block cursor-grab active:cursor-grabbing" />
        {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
);

const Explorer = ({ net, onRunFull, full }: { net: SurrogateNet; onRunFull: (request: FullRunRequest) => void; full: FullRunState }) => {
    const reduce = useReducedMotion();
    const [drug, setDrug] = useState(net.drugs[0]);
    const [position, setPosition] = useState(0.5);
    const [weeks, setWeeks] = useState(() => Math.min(26, net.ranges.weeks[1]));
    const [targetA1c, setTargetA1c] = useState(() => Number(((net.ranges.target_a1c[0] + net.ranges.target_a1c[1]) / 2).toFixed(1)));
    const [band, setBand] = useState(net.ranges.egfr_bands.length - 1);

    const chosen = net.ranges.egfr_bands[band];
    const floored = drug === "metformin" && chosen[0] < METFORMIN_EGFR_FLOOR;
    const egfrLow = floored ? METFORMIN_EGFR_FLOOR : chosen[0];
    const egfrHigh = chosen[1];
    const unit = drug === "semaglutide" ? "mg/week" : "mg/day";
    // Sensible precision for a dose, which is also what a full run is asked for, so the two compare fairly.
    const mg = Number(doseAt(net, drug, position).toPrecision(2));
    const output = predict(net, { drug, mg, weeks, targetA1c, egfrLow, egfrHigh });
    const a1c = output.hba1c_vs_placebo;
    const weight = output.weight_kg_vs_placebo;
    const e = net.evaluation;

    return (
        <div className="space-y-3">
            <div className="max-w-full overflow-x-auto">
                <Segmented value={drug} options={net.drugs.map((d) => ({ id: d, label: drugName(d) }))} onChange={setDrug} label="Drug" />
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border" data-testid="surrogate-output" aria-live="polite">
                <div className="bg-background p-3">
                    <dt className="label-caps">HbA1c vs placebo</dt>
                    <dd className="tnum mt-1 text-2xl font-medium tracking-tight" data-testid="surrogate-a1c">{fmtNum(a1c)}<span className="ml-1 font-sans text-xs font-normal text-muted-foreground">points</span></dd>
                </div>
                <div className="bg-background p-3">
                    <dt className="label-caps">Weight vs placebo</dt>
                    <dd className="tnum mt-1 text-2xl font-medium tracking-tight" data-testid="surrogate-weight">{fmtNum(weight, 1)}<span className="ml-1 font-sans text-xs font-normal text-muted-foreground">kg</span></dd>
                </div>
            </dl>
            <Curve net={net} drug={drug} weeks={weeks} targetA1c={targetA1c} egfrLow={egfrLow} egfrHigh={egfrHigh} position={position} unit={unit} />
            <div className="grid gap-3 sm:grid-cols-2">
                <Slider id="surrogate-dose" label="Dose" value={position} display={`${mg} ${unit}`} min={0} max={1} step={0.01} onChange={setPosition} />
                <Slider id="surrogate-weeks" label="Duration" value={weeks} display={`${weeks} weeks`} min={net.ranges.weeks[0]} max={net.ranges.weeks[1]} step={1} onChange={setWeeks} />
                <Slider id="surrogate-a1c-mean" label="Study population mean HbA1c" value={targetA1c} display={`${targetA1c.toFixed(1)}%`} min={net.ranges.target_a1c[0]} max={net.ranges.target_a1c[1]} step={0.1} onChange={setTargetA1c} hint="Describes a whole study population, not a person's labs." />
                <div className="min-w-0">
                    <p className="mb-1.5 text-xs text-muted-foreground">Study population kidney function</p>
                    <div className="max-w-full overflow-x-auto">
                        <Segmented size="xs" value={String(band)} options={net.ranges.egfr_bands.map((b, i) => ({ id: String(i), label: bandLabel(b) }))} onChange={(v) => setBand(Number(v))} label="Kidney function band" />
                    </div>
                    {floored && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">For metformin this starts at eGFR {METFORMIN_EGFR_FLOOR}. The surrogate was not trained on it below that.</p>}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={full.status === "running"} onClick={() => onRunFull({ drug, mg, weeks, egfrLow, egfrHigh: egfrHigh >= OPEN_ENDED_TRAINING ? OPEN_ENDED_FORM : egfrHigh, predictedA1c: a1c, predictedWeight: weight })} className="btn-outline gap-1.5 !px-3 !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50" data-testid="surrogate-run-full">
                    {full.status === "running" ? <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight className="h-3 w-3" aria-hidden="true" />}
                    {full.status === "running" ? "Running the full simulator…" : "Check with the full simulator"}
                </button>
                <p className="text-[11px] text-muted-foreground">Same drug, dose, duration and kidney band. The full run uses the simulator&rsquo;s own HbA1c entry range, {BACKGROUNDS[0].inSentence}.</p>
            </div>
            {full.status === "error" && <p role="alert" data-testid="surrogate-full-error" className="rounded border border-[hsl(var(--prov-extrapolated))]/50 p-2 text-xs">{full.message}</p>}
            {full.status === "done" && (
                <motion.table initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="w-full text-xs" data-testid="surrogate-compare">
                    <thead>
                        <tr className="border-b border-border text-left">
                            <th scope="col" className="label-caps py-1 font-medium">Vs placebo</th>
                            <th scope="col" className="label-caps py-1 text-right font-medium">Surrogate</th>
                            <th scope="col" className="label-caps py-1 text-right font-medium">Full simulator</th>
                            <th scope="col" className="label-caps py-1 text-right font-medium">Gap</th>
                        </tr>
                    </thead>
                    <tbody className="tnum">
                        <tr className="border-b border-[hsl(var(--rule))]">
                            <th scope="row" className="py-1 text-left font-sans font-normal">HbA1c, points</th>
                            <td className="py-1 text-right">{fmtNum(full.predictedA1c)}</td>
                            <td className="py-1 text-right">{fmtNum(full.a1c)}</td>
                            <td className="py-1 text-right font-medium">{fmtNum(full.predictedA1c - full.a1c)}</td>
                        </tr>
                        <tr>
                            <th scope="row" className="py-1 text-left font-sans font-normal">Weight, kg</th>
                            <td className="py-1 text-right">{fmtNum(full.predictedWeight, 1)}</td>
                            <td className="py-1 text-right">{fmtNum(full.weight, 1)}</td>
                            <td className="py-1 text-right font-medium">{fmtNum(full.predictedWeight - full.weight, 1)}</td>
                        </tr>
                    </tbody>
                </motion.table>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground" data-testid="surrogate-evaluation">
                <span className="tnum">Tested on {e.test_runs} simulator runs it never trained on: HbA1c mean error {fmtNum(e.a1c_mae, 3)} points (R² {fmtNum(e.a1c_r2, 3)}), weight {fmtNum(e.weight_mae_kg, 3)} kg (R² {fmtNum(e.weight_r2, 3)}).</span>{" "}
                {net.notice}
            </p>
        </div>
    );
};

/** Answers on the main thread with no Pyodide, so it works the moment the page opens. */
export const SurrogateExplorer = ({ onRunFull, full, className }: { onRunFull: (request: FullRunRequest) => void; full: FullRunState; className?: string }) => {
    const { state } = useRemote<SurrogateNet | null>("surrogate", (signal) => loadSnapshotAt<SurrogateNet>("surrogate.json", isSurrogate, signal));
    const net = state.status === "success" ? state.data : null;
    return (
        <section aria-labelledby="surrogate-heading" data-testid="surrogate" className={cn("rounded-lg border border-border bg-card/50 p-4 sm:p-5", className)}>
            <div className="flex flex-wrap items-center gap-2">
                <Gauge className="h-4 w-4" aria-hidden="true" />
                <h2 id="surrogate-heading" className="text-base font-semibold tracking-tight">Move a slider, see the answer</h2>
                <span className="label-caps rounded-sm border border-dashed border-foreground/40 px-1.5 py-0.5 text-foreground">AI surrogate of the simulator</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">A small neural network trained on simulator runs, so it answers instantly while the full simulator warms up.</p>
            <div className="mt-3">
                {state.status === "loading" || state.status === "idle" ? (
                    <div className="h-64 animate-pulse rounded-md bg-secondary/40 motion-reduce:animate-none" role="status"><span className="sr-only">Loading the surrogate…</span></div>
                ) : net ? (
                    <Explorer net={net} onRunFull={onRunFull} full={full} />
                ) : (
                    <div data-testid="surrogate-not-trained" className="rounded-md border border-dashed border-border px-4 py-10 text-center">
                        <p className="text-sm font-medium">The surrogate hasn&rsquo;t been trained yet.</p>
                        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">It is trained on the simulator after calibration finishes, so no slider values are shown until then. The copilot and the full simulator work without it.</p>
                    </div>
                )}
            </div>
        </section>
    );
};
