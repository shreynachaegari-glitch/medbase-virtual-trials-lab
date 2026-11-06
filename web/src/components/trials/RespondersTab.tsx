import { motion, useReducedMotion } from "motion/react";
import { Play, TriangleAlert } from "lucide-react";
import { useRemote } from "@/hooks/useRemote";
import { useSimRun } from "@/hooks/useSimRun";
import { guards, loadSnapshot } from "@/lib/trials/api";
import type { DesignForm } from "@/lib/trials/form";
import { useSingleArm } from "@/hooks/useSingleArm";
import { endpointInfo, fmtNum, fmtShare, prettyRule } from "@/lib/trials/format";
import type { DrugsResponse, Provenance, RespondersResponse } from "@/lib/trials/types";
import { EmptyState } from "@/components/lab/primitives";
import { ArmPicker } from "./ArmPicker";
import { CaveatsPanel } from "./CaveatsPanel";
import { ErrorCallout, ProvenanceTag, RunProgress, SimulatedTag, Stat } from "./bits";
import { EnrolmentPanel } from "./EnrolmentPanel";
import { ValidationPanel } from "./ValidationPanel";

const SAVED = "responders.json";

const Output = ({ data, provenance }: { data: RespondersResponse; provenance: Provenance }) => {
    const reduce = useReducedMotion();
    const unit = endpointInfo(data.endpoint).unit;
    const peak = Math.max(...data.subgroups.map((s) => Math.abs(s.mean_effect)), 0.01);
    const topDriver = Math.max(...data.drivers.map((d) => d.importance), 0.01);
    return (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]" data-testid="responders-result">
            <div className="order-2 min-w-0 space-y-7 lg:order-none">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-medium tracking-tight">{data.arm} against {data.control.toLowerCase()}</h3>
                    <SimulatedTag />
                    <ProvenanceTag provenance={provenance} />
                </div>
                <div className="grid grid-cols-3 gap-4 border-y border-border py-4">
                    <Stat label="Mean effect" value={fmtNum(data.mean_individual_effect)} note={`${endpointInfo(data.endpoint).label} ${unit}`} />
                    <Stat label="Spread" value={fmtNum(data.spread_sd)} note="Standard deviation" />
                    <Stat label="Tree fit, R²" value={fmtNum(data.fit_r2)} note="Of the model's own output" />
                </div>
                <section aria-labelledby="drivers-heading">
                    <h4 id="drivers-heading" className="text-sm font-medium">What drives the simulated effect</h4>
                    <ul className="mt-3 space-y-2">
                        {data.drivers.map((driver, i) => (
                            <li key={driver.feature} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem] items-center gap-3 text-xs">
                                <span className="min-w-0 break-words">{driver.feature}</span>
                                <span className="h-1.5 rounded-full bg-secondary" aria-hidden="true">
                                    <motion.span
                                        className="block h-full origin-left rounded-full bg-foreground"
                                        initial={reduce ? false : { scaleX: 0 }}
                                        animate={{ scaleX: driver.importance / topDriver }}
                                        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : i * 0.05 }}
                                    />
                                </span>
                                <span className="tnum text-right">{fmtShare(driver.importance)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
                <section aria-labelledby="subgroups-heading">
                    <h4 id="subgroups-heading" className="text-sm font-medium">Groups the model separates, largest simulated effect first</h4>
                    <ul className="mt-2" data-testid="subgroups">
                        {data.subgroups.map((group) => (
                            <li key={group.rule} className="grid gap-x-4 gap-y-1 border-t border-[hsl(var(--rule))] py-2.5 transition-colors hover:bg-card/70 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_5rem] sm:items-center">
                                <span className="min-w-0 text-xs leading-relaxed">
                                    {prettyRule(group.rule).join(", ")}
                                    <span className="tnum block text-muted-foreground">{group.patients} virtual patients</span>
                                </span>
                                <span className="relative hidden h-1.5 rounded-full bg-secondary sm:block" aria-hidden="true">
                                    <span className="block h-full origin-left rounded-full bg-[hsl(var(--primary))]" style={{ transform: `scaleX(${Math.abs(group.mean_effect) / peak})` }} />
                                </span>
                                <span className="tnum text-sm font-medium sm:text-right">{fmtNum(group.mean_effect)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
            <aside className="contents min-w-0 lg:sticky lg:top-40 lg:block lg:space-y-4 lg:self-start" aria-label="Status of this result">
                <div className="order-1 space-y-4 lg:order-none">
                    <CaveatsPanel caveats={data} />
                    <ValidationPanel status={data.validation} notice={data.notice} provenance={provenance} />
                </div>
                <div className="order-3 lg:order-none"><EnrolmentPanel enrolment={data.enrolment} /></div>
            </aside>
        </div>
    );
};

export const RespondersTab = ({ form, drugs, offline }: { form: DesignForm; drugs: DrugsResponse | null; offline: boolean }) => {
    const single = useSingleArm(form, drugs);
    const sim = useSimRun<RespondersResponse>(guards.responders);
    const { body, invalid } = single;
    const start = () => void sim.run([{ path: "/api/responders", body, label: "who responds", savedFile: SAVED }], JSON.stringify(body));
    const saved = useRemote<RespondersResponse | null>(offline && !sim.outcome ? SAVED : null, (signal) => loadSnapshot<RespondersResponse>(SAVED, guards.responders, signal));
    const savedData = saved.state.status === "success" ? saved.state.data : null;
    const output = sim.outcome?.outputs[0] ?? null;
    const shown = output?.data ?? savedData;

    return (
        <div className="space-y-6" data-testid="responders-tab">
            <div>
                <h2 className="text-lg font-semibold tracking-tight">Who responds, in the model?</h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    Runs the same virtual patients on the drug and on placebo, then summarises which baseline traits separate larger and smaller simulated effects.
                </p>
                <p data-testid="responders-model-note" className="mt-3 flex items-start gap-2 rounded-md border border-[hsl(var(--prov-extrapolated))]/50 bg-[hsl(var(--prov-extrapolated))]/10 p-3 text-sm leading-relaxed">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
                    <span>
                        <strong className="font-semibold">This describes the model, not biology.</strong>{" "}
                        {shown?.notice ?? "Patterns here reflect how the simulator is built, so they are hypotheses at most."}
                    </span>
                </p>
            </div>
            <div className="flex flex-wrap items-end gap-4 rounded-md border border-border p-4">
                <ArmPicker id="responders-arm" form={form} drugs={drugs} single={single} />
                <button type="button" onClick={start} disabled={sim.running !== null || invalid} className="btn-solid gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    {sim.running ? "Running…" : "Find who responds"}
                </button>
            </div>
            {sim.running && <RunProgress running={sim.running} onCancel={sim.cancel} summary="Running the same virtual patients on both arms." />}
            {sim.error && <ErrorCallout error={sim.error} onRetry={start} />}
            {output ? <Output data={output.data} provenance={output.provenance} /> : savedData ? <Output data={savedData} provenance="saved" /> : !sim.running && (
                <EmptyState>{offline ? "The live simulator is offline and no saved who-responds run is available yet." : "Pick an arm and run it. Nothing has been run yet."}</EmptyState>
            )}
        </div>
    );
};
