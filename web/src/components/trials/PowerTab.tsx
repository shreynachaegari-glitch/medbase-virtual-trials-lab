import { Play } from "lucide-react";
import { useRemote } from "@/hooks/useRemote";
import { useSimRun } from "@/hooks/useSimRun";
import { guards, loadSnapshot } from "@/lib/trials/api";
import type { DesignForm } from "@/lib/trials/form";
import { useSingleArm } from "@/hooks/useSingleArm";
import { endpointInfo, fmtShare } from "@/lib/trials/format";
import type { DrugsResponse, PowerResponse, Provenance } from "@/lib/trials/types";
import { EmptyState } from "@/components/lab/primitives";
import PowerCurve from "@/components/charts/PowerCurve";
import { ArmPicker } from "./ArmPicker";
import { CaveatsPanel } from "./CaveatsPanel";
import { ErrorCallout, ProvenanceTag, RunProgress, SimulatedTag } from "./bits";
import { EnrolmentPanel } from "./EnrolmentPanel";
import { ValidationPanel } from "./ValidationPanel";

const SAVED = "power.json";

const Output = ({ data, provenance }: { data: PowerResponse; provenance: Provenance }) => {
    const size = data.smallest_size_reaching_80pct;
    return (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]" data-testid="power-result">
            <div className="order-2 min-w-0 lg:order-none">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-medium tracking-tight">{data.arm} against {data.control.toLowerCase()}, {endpointInfo(data.endpoint).label}</h3>
                    <SimulatedTag />
                    <ProvenanceTag provenance={provenance} />
                </div>
                <p className="mt-3 text-2xl font-medium tracking-tight" data-testid="power-answer">
                    {size === null ? "No tested size reached the 80% reference" : <>Smallest tested size reaching the 80% reference: <span className="tnum">{size}</span> per arm</>}
                </p>
                <div className="mt-4"><PowerCurve curve={data.curve} highlight={size} /></div>
                <table className="stack-table mt-5 w-full max-w-md text-sm">
                    <thead>
                        <tr className="border-b border-border text-left">
                            <th scope="col" className="label-caps py-1.5 pr-3 font-medium">Patients per arm</th>
                            <th scope="col" className="label-caps py-1.5 text-right font-medium">Simulated power</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.curve.map((c) => (
                            <tr key={c.n_per_arm} className="border-b border-[hsl(var(--rule))]">
                                <td data-label="Patients per arm" className="tnum py-1.5 pr-3">{c.n_per_arm}</td>
                                <td data-label="Simulated power" className="tnum py-1.5 md:text-right">{fmtShare(c.power)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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

export const PowerTab = ({ form, drugs, offline }: { form: DesignForm; drugs: DrugsResponse | null; offline: boolean }) => {
    const single = useSingleArm(form, drugs);
    const sim = useSimRun<PowerResponse>(guards.power);
    const { body, invalid } = single;
    const start = () => void sim.run([{ path: "/api/power", body, label: "power", savedFile: SAVED }], JSON.stringify(body));
    const saved = useRemote<PowerResponse | null>(offline && !sim.outcome ? SAVED : null, (signal) => loadSnapshot<PowerResponse>(SAVED, guards.power, signal));
    const savedData = saved.state.status === "success" ? saved.state.data : null;
    const output = sim.outcome?.outputs[0] ?? null;

    return (
        <div className="space-y-6" data-testid="power-tab">
            <div>
                <h2 className="text-lg font-semibold tracking-tight">How large would the study need to be?</h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    Repeats the simulated trial at several arm sizes and counts how often it shows a significant benefit, including uncertainty in the model&rsquo;s parameters.
                </p>
            </div>
            <div className="flex flex-wrap items-end gap-4 rounded-md border border-border p-4">
                <ArmPicker id="power-arm" form={form} drugs={drugs} single={single} />
                <button type="button" onClick={start} disabled={sim.running !== null || invalid} className="btn-solid gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    {sim.running ? "Running…" : "Estimate power"}
                </button>
            </div>
            {sim.running && <RunProgress running={sim.running} onCancel={sim.cancel} summary="Repeating the trial at each arm size." />}
            {sim.error && <ErrorCallout error={sim.error} onRetry={start} />}
            {output ? <Output data={output.data} provenance={output.provenance} /> : savedData ? <Output data={savedData} provenance="saved" /> : !sim.running && (
                <EmptyState>{offline ? "The live simulator is offline and no saved power run is available yet." : "Pick an arm and estimate power. Nothing has been run yet."}</EmptyState>
            )}
        </div>
    );
};
