import type { SensitivityEntry } from "@/sim/cohort";
import type { Provenance } from "@/sim/params";

interface Props {
    entries: SensitivityEntry[];
    provenanceFor: (paramId: string) => Provenance["kind"];
    format: (v: number) => string;
}

const kindFill: Record<Provenance["kind"], string> = {
    derived: "hsl(var(--prov-derived))",
    extrapolated: "hsl(var(--prov-extrapolated))",
    illustrative: "hsl(var(--prov-illustrative))",
};

/**
 * Bars are coloured by provenance rather than by parameter identity, so an unsourced
 * assumption that dominates the outcome is visible at a glance instead of blending in.
 */
const TornadoChart = ({ entries, provenanceFor, format }: Props) => {
    if (entries.length === 0) return null;
    const maxSwing = Math.max(...entries.map((e) => e.swing)) || 1;

    return (
        <div className="space-y-2.5">
            {entries.map((e) => {
                const kind = provenanceFor(e.paramId);
                const pct = (e.swing / maxSwing) * 100;
                return (
                    <div key={e.paramId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                        <div className="min-w-0">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="truncate text-sm">{e.label}</span>
                                <span className="tnum shrink-0 text-xs text-muted-foreground">
                                    {format(e.lowOutcome)} → {format(e.highOutcome)}
                                </span>
                            </div>
                            <div className="mt-1 h-2.5 w-full rounded-sm bg-secondary">
                                <div
                                    className="h-2.5 rounded-sm"
                                    style={{ width: `${pct}%`, background: kindFill[kind] }}
                                />
                            </div>
                        </div>
                        <div className="tnum self-end pb-0.5 text-right text-sm font-medium">
                            {format(e.swing)}
                        </div>
                    </div>
                );
            })}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1.5 text-xs text-muted-foreground">
                <span className="label-caps">Bar colour</span>
                {(["derived", "extrapolated", "illustrative"] as const).map((k) => (
                    <span key={k} className="flex items-center gap-1.5">
                        <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ background: kindFill[k] }}
                        />
                        {k}
                    </span>
                ))}
            </div>
        </div>
    );
};

export default TornadoChart;
