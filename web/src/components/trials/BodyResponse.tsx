import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { canUseWebGL } from "@/components/atlas/webgl";
import type { MeshState } from "@/components/atlas/BodyScene";
import { Segmented } from "@/components/lab/primitives";
import { MESH_COLOURS, type MeshId } from "@/data/bodyAtlas";
import { fmtNum } from "@/lib/trials/format";
import type { OrganSignals, TrialResponse } from "@/lib/trials/types";
import { SimulatedTag } from "./bits";

const BodyScene = lazy(() => import("@/components/atlas/BodyScene"));

const MESHES: MeshId[] = ["skin", "liver", "pancreas", "kidney-l", "kidney-r"];
const FOCUS: MeshId[] = ["liver", "pancreas", "kidney-l", "kidney-r"];

interface Signal {
    key: keyof OrganSignals;
    organ: string;
    meaning: string;
    unit: string;
    digits: number;
    meshes: MeshId[];
    /** Colour of the swatch. Weight is the whole body, shown on the outline. */
    colour: string;
}

const SIGNALS: Signal[] = [
    { key: "liver_glucose_output_change_pct", organ: "Liver", meaning: "glucose output", unit: "%", digits: 1, meshes: ["liver"], colour: MESH_COLOURS.liver },
    { key: "insulin_secretion_capacity_change_pct", organ: "Pancreas", meaning: "insulin secretion capacity", unit: "%", digits: 1, meshes: ["pancreas"], colour: MESH_COLOURS.pancreas },
    { key: "urinary_glucose_change_g_day", organ: "Kidneys", meaning: "urinary glucose", unit: "g/day", digits: 1, meshes: ["kidney-l", "kidney-r"], colour: MESH_COLOURS["kidney-l"] },
    { key: "weight_change_kg", organ: "Body", meaning: "weight", unit: "kg", digits: 1, meshes: [], colour: MESH_COLOURS.skin },
];

const signed = (value: number, digits: number) => `${value > 0 ? "+" : ""}${fmtNum(value, digits)}`;

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? <p className="p-4 text-xs text-muted-foreground">The 3D view couldn&rsquo;t load. The numbers here are the whole result.</p> : this.props.children;
    }
}

/**
 * This run's values, on real organ models. Brightness is the size of each simulated change relative to the
 * largest for that signal across this run's arms, and nothing else moves. It is not an image of any organ.
 */
export const BodyResponse = ({ data }: { data: TrialResponse }) => {
    const names = Object.keys(data.arms);
    const active = names.filter((n) => n !== data.control && data.arms[n].organ_signals);
    const [picked, setPicked] = useState(active[0] ?? "");
    const [webgl] = useState(canUseWebGL);
    const arm = active.includes(picked) ? picked : active[0];
    const signals = arm ? data.arms[arm].organ_signals : undefined;
    const control = data.arms[data.control]?.organ_signals;

    const relative = useMemo(() => {
        const out = {} as Record<keyof OrganSignals, number>;
        if (!signals) return out;
        for (const { key } of SIGNALS) {
            const largest = Math.max(...names.map((n) => Math.abs(data.arms[n].organ_signals?.[key] ?? 0)));
            out[key] = largest > 0 ? Math.abs(signals[key]) / largest : 0;
        }
        return out;
    }, [signals, names, data.arms]);

    const states = useMemo(() => {
        const out: Partial<Record<MeshId, MeshState>> = {};
        for (const signal of SIGNALS) {
            for (const mesh of signal.meshes) out[mesh] = { glow: relative[signal.key] ?? 0 };
        }
        return out;
    }, [relative]);

    if (!signals || !arm) return null;

    return (
        <section className="border-t border-border pt-5" data-testid="body-response" aria-labelledby="body-response-heading">
            <div className="flex flex-wrap items-center gap-2">
                <h3 id="body-response-heading" className="text-base font-medium tracking-tight">See it in the body</h3>
                <SimulatedTag />
            </div>
            {active.length > 1 && (
                <div className="mt-2 max-w-full overflow-x-auto">
                    <Segmented value={arm} options={active.map((n) => ({ id: n, label: n }))} onChange={setPicked} label="Arm to show" />
                </div>
            )}
            <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="relative h-72 overflow-hidden rounded-md bg-[radial-gradient(ellipse_at_50%_45%,hsl(217_60%_14%/0.55),hsl(var(--background))_70%)] md:h-80" data-testid="body-response-canvas">
                    {webgl ? (
                        <SceneBoundary>
                            <Suspense fallback={null}>
                                <BodyScene meshes={MESHES} states={states} shellGlow={relative.weight_change_kg ?? 0} focus={FOCUS} label={`Liver, pancreas and kidneys on a body outline, brightened in proportion to the simulated changes listed beside this for ${arm}.`} />
                            </Suspense>
                        </SceneBoundary>
                    ) : (
                        <p className="p-4 text-xs text-muted-foreground">3D can&rsquo;t run in this browser. The numbers here are the whole result.</p>
                    )}
                </div>
                <div className="min-w-0">
                    <ul className="divide-y divide-border border-y border-border" data-testid="body-signals">
                        {SIGNALS.map((signal) => {
                            const value = signals[signal.key];
                            return (
                                <li key={signal.key} className="py-2.5" data-testid="body-signal" data-signal={signal.key}>
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                        <span className="flex items-center gap-2 text-sm">
                                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: signal.colour }} aria-hidden="true" />
                                            <span><span className="font-medium">{signal.organ}</span> <span className="text-muted-foreground">{signal.meaning}</span></span>
                                        </span>
                                        <span className="tnum text-base font-medium">
                                            {signed(value, signal.digits)} {signal.unit} <span className="font-sans text-[11px] font-normal text-muted-foreground">simulated</span>
                                        </span>
                                    </div>
                                    <div className="mt-1.5 h-1 rounded-full bg-secondary" aria-hidden="true">
                                        <div className="h-full origin-left rounded-full transition-transform duration-700" style={{ background: signal.colour, transform: `scaleX(${relative[signal.key] ?? 0})` }} data-testid="body-signal-bar" />
                                    </div>
                                    {control && (
                                        <p className="tnum mt-1 text-[11px] text-muted-foreground">{data.control}: {signed(control[signal.key], signal.digits)} {signal.unit}</p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <p className="tnum mt-2 text-xs text-muted-foreground">
                        Fasting glucose: {signed(signals.fasting_glucose_change_mg_dl, 1)} mg/dL, simulated{control ? ` (${data.control}: ${signed(control.fasting_glucose_change_mg_dl, 1)})` : ""}.
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        Change over this run, as a cohort mean. Brightness is each change&rsquo;s size relative to the largest for that signal in this run. It is the simulator&rsquo;s account, not an image or measurement of any organ. 3D organs: Human Reference Atlas, CC BY 4.0.
                    </p>
                </div>
            </div>
        </section>
    );
};
