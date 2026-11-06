import { TrackRecord } from "./TrackRecord";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles, TriangleAlert } from "lucide-react";
import { useRemote } from "@/hooks/useRemote";
import { useSimRun } from "@/hooks/useSimRun";
import { guards, loadSnapshot } from "@/lib/trials/api";
import { BACKGROUNDS, drugName, fmtInterval, fmtNum, fmtShare } from "@/lib/trials/format";
import type { Background } from "@/lib/trials/form";
import type { DesignResponse, DesignStep, Drug, DoseResult, Provenance, SimulatedDesign } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import DoseSearchChart, { type DosePoint } from "@/components/charts/DoseSearchChart";
import { ErrorCallout, ProvenanceTag, RunProgress, SimulatedTag } from "./bits";
import { CaveatsPanel } from "./CaveatsPanel";
import { ValidationPanel, ValidationStrip } from "./ValidationPanel";

const isDoseResult = (result: DesignStep["result"]): result is DoseResult => "mg" in result;
const STEP_STAGGER = 0.09;

interface Goal {
    drug: string;
    target_effect: string;
    weeks: string;
    background: Background;
    target_power_pct: string;
}

const StepResult = ({ step, target }: { step: DesignStep; target: number }) => {
    if (isDoseResult(step.result)) {
        const met = step.result.effect <= -target;
        return (
            <p className="tnum mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                    Effect <span className="font-medium text-foreground">{fmtNum(step.result.effect)}</span>, 95% interval {fmtInterval(step.result.interval95)}
                </span>
                <span className={cn("rounded-sm border px-1.5 py-px font-sans", met ? "border-foreground/50 text-foreground" : "border-dashed border-border")}>
                    {met ? "Target met" : "Target not met"}
                </span>
            </p>
        );
    }
    return (
        <ul className="tnum mt-2 flex flex-wrap gap-1.5 text-xs" aria-label="Simulated power by arm size">
            {step.result.curve.map((point) => (
                <li key={point.n_per_arm} className="rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground">
                    {point.n_per_arm}: <span className="font-medium text-foreground">{fmtShare(point.power)}</span>
                </li>
            ))}
        </ul>
    );
};

/** The search's own log, top to bottom. The whole log arrives at once; the reveal is only a replay. */
const Chain = ({ steps, target, activeStep, onActive }: { steps: DesignStep[]; target: number; activeStep: number | null; onActive: (step: number | null) => void }) => {
    const reduce = useReducedMotion();
    return (
        <ol data-testid="designer-chain" onPointerLeave={() => onActive(null)}>
            {steps.map((step, i) => {
                const last = i === steps.length - 1;
                return (
                    <motion.li
                        key={step.step}
                        data-testid="designer-step"
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : i * STEP_STAGGER }}
                        onPointerEnter={() => onActive(step.step)}
                        className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 pb-5"
                    >
                        {!last && <span className="absolute bottom-0 left-[0.8125rem] top-7 w-px bg-border" aria-hidden="true" />}
                        <span
                            className={cn(
                                "tnum z-[1] flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                                activeStep === step.step ? "border-foreground bg-foreground text-background" : "border-input bg-background text-foreground",
                            )}
                            aria-hidden="true"
                        >
                            {step.step}
                        </span>
                        <div className="min-w-0 pt-0.5">
                            <p className="text-sm font-medium"><span className="sr-only">Step {step.step}: </span>{step.action}</p>
                            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.finding}</p>
                            <StepResult step={step} target={target} />
                        </div>
                    </motion.li>
                );
            })}
        </ol>
    );
};

/** The notice comes first: a design from this search is an output of a simulator, not advice. */
const DesignOutcome = ({ design, notice, reason, background, onUse }: { design: SimulatedDesign | null; notice: string; reason: string; background: string; onUse: (d: SimulatedDesign, background: string) => void }) => (
    <div className="space-y-3">
        <p data-testid="designer-notice" className="flex items-start gap-2 rounded-md border border-[hsl(var(--prov-extrapolated))]/50 bg-[hsl(var(--prov-extrapolated))]/10 p-3 text-sm leading-relaxed">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
            {notice}
        </p>
        {design ? (
            <div data-testid="designer-design" className="rounded-md border border-foreground/30 bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="label-caps">Simulated study design</p>
                    <SimulatedTag />
                </div>
                <p className="mt-2 text-xl font-medium tracking-tight sm:text-2xl">
                    {drugName(design.drug)} <span className="tnum">{design.dose_mg} {design.unit}</span>, <span className="tnum">{design.n_per_arm}</span> per arm, <span className="tnum">{design.weeks}</span> weeks
                </p>
                <p className="tnum mt-2 text-sm text-muted-foreground">
                    Simulated effect <span className="text-foreground">{fmtNum(design.expected_effect)}</span> points against placebo, 95% interval {fmtInterval(design.effect_interval95)}. Simulated power <span className="text-foreground">{fmtShare(design.power)}</span>.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{reason}</p>
                <button type="button" onClick={() => onUse(design, background)} className="btn-outline mt-4 gap-1.5">
                    Run this design as a full simulated trial
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            </div>
        ) : (
            <div data-testid="designer-no-design" className="rounded-md border border-foreground/30 bg-card p-4 sm:p-5">
                <p className="label-caps">Outcome</p>
                <p className="mt-2 text-xl font-medium tracking-tight sm:text-2xl">No design met this goal</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{reason}</p>
            </div>
        )}
    </div>
);

const SurrogateBanner = ({ data }: { data: DesignResponse }) => {
    const guide = data.surrogate;
    if (!guide?.used) return null;
    const unit = data.goal.drug === "semaglutide" ? "mg/week" : "mg/day";
    return (
        <div className="my-4 rounded-md border border-border p-3 text-sm" data-testid="surrogate-guide">
            <p className="font-medium">A trained neural surrogate chose where to start</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
                It screened {guide.screened} doses in <span className="tnum">{guide.milliseconds}</span> ms and {guide.reachable ? "proposed" : "expected no lower dose to reach the target, so it pointed to"}{" "}
                <span className="tnum">{guide.proposed_mg}</span> {unit}, predicting <span className="tnum">{guide.predicted_effect}</span> points. The simulator then checked{" "}
                <span className="tnum">{data.simulator_runs}</span> doses, and every number below comes from the simulator. The network approximates the simulator (mean error{" "}
                <span className="tnum">{guide.test_mae_vs_simulator}</span> points on simulator runs it never saw), not real patients.
            </p>
        </div>
    );
};

const Result = ({ data, provenance, onUse }: { data: DesignResponse; provenance: Provenance; onUse: (d: SimulatedDesign, background: string) => void }) => {
    const [activeStep, setActiveStep] = useState<number | null>(null);
    const points: DosePoint[] = useMemo(
        () => data.steps.flatMap((step) => (isDoseResult(step.result) ? [{ ...step.result, step: step.step }] : [])),
        [data.steps],
    );
    const { goal } = data;
    const unit = data.simulated_design?.unit ?? (goal.drug === "semaglutide" ? "mg/week" : "mg/day");
    const background = BACKGROUNDS.find((b) => b.id === goal.background)?.inSentence ?? goal.background;
    return (
        <div className="mt-8" data-testid="designer-result">
            <ValidationStrip status={data.validation} />
            <SurrogateBanner data={data} />
            {data.dose_evidence && (
                <p className="my-4 rounded-md border border-[hsl(var(--prov-extrapolated))]/50 p-3 text-sm leading-relaxed" data-testid="dose-evidence">
                    <span className="font-medium">The blind test at this dose. </span>{data.dose_evidence.sentence}
                </p>
            )}
            <TrackRecord records={data.track_record ? { [goal.drug]: data.track_record } : undefined} />
            <div className="mt-3 flex flex-wrap items-center gap-2 lg:mt-0">
                <h3 className="text-sm font-medium">
                    What it tried, for {goal.drug}, a target of {goal.target_effect} points over {goal.weeks} weeks in {background}
                </h3>
                <SimulatedTag />
                <ProvenanceTag provenance={provenance} />
            </div>
            <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                    <Chain steps={data.steps} target={goal.target_effect} activeStep={activeStep} onActive={setActiveStep} />
                    <DesignOutcome design={data.simulated_design} notice={data.notice} reason={data.reason} background={goal.background} onUse={onUse} />
                </div>
                <div className="min-w-0 space-y-5 lg:sticky lg:top-40 lg:self-start">
                    <div className="rounded-md border border-border p-3 sm:p-4">
                        <p className="label-caps mb-2">The search, drawn</p>
                        <DoseSearchChart
                            points={points}
                            target={goal.target_effect}
                            unit={unit}
                            activeStep={activeStep}
                            onActive={setActiveStep}
                            chosenMg={data.simulated_design?.dose_mg ?? null}
                        />
                    </div>
                    <CaveatsPanel caveats={{ label_flags: data.label_flags ?? [], validation_scope: data.validation_scope ?? [], not_modelled: data.not_modelled }} />
                    <ValidationPanel status={data.validation} notice={data.notice} provenance={provenance} />
                </div>
            </div>
        </div>
    );
};

interface Props {
    drugs: Drug[] | null;
    offline: boolean;
    onUse: (design: SimulatedDesign, background: string) => void;
}

const inlineInput = "inline-field tnum w-[4.75rem]";

/** The feature the Applied AI track judges: a goal in, and every step of the search visible. */
export const DesignerSection = ({ drugs, offline, onUse }: Props) => {
    const [goal, setGoal] = useState<Goal>({ drug: "semaglutide", target_effect: "1.0", weeks: "26", background: "any", target_power_pct: "80" });
    const sim = useSimRun<DesignResponse>(guards.design);
    const set = <K extends keyof Goal>(key: K, value: Goal[K]) => setGoal((g) => ({ ...g, [key]: value }));
    const drugList = drugs?.map((d) => d.drug) ?? [goal.drug];

    const saved = useRemote<DesignResponse | null>(offline && !sim.outcome ? `design-${goal.drug}` : null, (signal) =>
        loadSnapshot<DesignResponse>(`design-${goal.drug}.json`, guards.design, signal),
    );
    const savedData = saved.state.status === "success" ? saved.state.data : null;

    const start = () => {
        const body = {
            drug: goal.drug,
            target_effect: Number(goal.target_effect),
            weeks: Number(goal.weeks),
            background: goal.background,
            target_power: Number(goal.target_power_pct) / 100,
        };
        void sim.run([{ path: "/api/design", body, label: goal.drug, savedFile: `design-${goal.drug}.json` }], JSON.stringify(body));
    };

    const output = sim.outcome?.outputs[0] ?? null;

    return (
        <section id="designer" aria-labelledby="designer-heading" className="relative scroll-mt-28 border-b border-border">
            <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:py-14">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-foreground" aria-hidden="true" />
                    <p className="label-caps text-foreground">AI Trial Designer</p>
                </div>
                <h2 id="designer-heading" className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                    State a goal. See every step of its search for a study that meets it.
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    A neural network trained on simulator runs proposes where to look, and the simulator checks that dose, refines it toward your target, then sizes the study. Every number below comes from a simulator run, and every step it took is listed, including dead ends. No language model writes these numbers.
                </p>

                <form
                    noValidate
                    className="mt-7 rounded-md border border-border bg-card/40 p-4 sm:p-6"
                    onSubmit={(e) => {
                        e.preventDefault();
                        start();
                    }}
                >
                    <p className="text-lg leading-[2.6rem] tracking-tight sm:text-xl">
                        Find the lowest{" "}
                        <select aria-label="Drug" value={goal.drug} onChange={(e) => set("drug", e.target.value)} className="inline-field">
                            {drugList.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>{" "}
                        dose that lowers HbA1c by{" "}
                        <input aria-label="Target HbA1c effect in points" type="number" step="0.1" min="0.1" max="3" required value={goal.target_effect} onChange={(e) => set("target_effect", e.target.value)} className={inlineInput} />{" "}
                        points against placebo over{" "}
                        <input aria-label="Weeks" type="number" min="4" max="156" required value={goal.weeks} onChange={(e) => set("weeks", e.target.value)} className={inlineInput} />{" "}
                        weeks, in{" "}
                        <select aria-label="Background therapy" value={goal.background} onChange={(e) => set("background", e.target.value as Background)} className="inline-field max-w-full">
                            {BACKGROUNDS.map((b) => <option key={b.id} value={b.id}>{b.inSentence}</option>)}
                        </select>
                        , with{" "}
                        <input aria-label="Target power in percent" type="number" min="50" max="99" required value={goal.target_power_pct} onChange={(e) => set("target_power_pct", e.target.value)} className={inlineInput} />
                        % power.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button type="submit" disabled={sim.running !== null} className="btn-solid gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            {sim.running ? "Searching…" : "Run the designer"}
                        </button>
                        <p className="text-xs text-muted-foreground">Produces a simulated study design for research and learning, not a dosing recommendation.</p>
                    </div>
                </form>

                <div className="mt-4 space-y-3" aria-live="polite">
                    {sim.running && (
                        <RunProgress
                            running={sim.running}
                            onCancel={sim.cancel}
                            summary="Running a chain of simulated trials at different doses, then estimating power."
                            typical="A chain takes longer than a single trial."
                        />
                    )}
                    {sim.error && <ErrorCallout error={sim.error} onRetry={start} />}
                </div>

                {output ? (
                    <Result key={sim.outcome?.id} data={output.data} provenance={output.provenance} onUse={onUse} />
                ) : savedData ? (
                    <Result data={savedData} provenance="saved" onUse={onUse} />
                ) : offline && saved.state.status === "success" ? (
                    <p data-testid="designer-empty" className="mt-6 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                        The live simulator is offline and no saved designer run is available for {goal.drug} yet.
                    </p>
                ) : null}
            </div>
        </section>
    );
};
