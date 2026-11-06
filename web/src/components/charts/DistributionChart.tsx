import { percentile } from "@/sim/cohort";
import { useElementWidth } from "./useElementWidth";

export interface DistributionArm {
    id: string;
    label: string;
    color: string;
    values: number[];
}

interface Props {
    arms: DistributionArm[];
    format: (v: number) => string;
    bins?: number;
}

/**
 * Small multiples rather than overlaid histograms: overlapping translucent distributions
 * are unreadable past two series, and the comparison that matters here is between arms.
 */
const DistributionChart = ({ arms, format, bins = 26 }: Props) => {
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const all = arms.flatMap((a) => a.values);

    const compact = width < 560;
    const rowH = compact ? 92 : 78;
    const PAD = { left: 4, right: 4, top: 6, bottom: 28 };

    if (all.length === 0) return <div ref={ref} />;

    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const plotW = Math.max(40, width - PAD.left - PAD.right);
    const binWidth = plotW / bins;

    const histograms = arms.map((arm) => {
        const counts = new Array(bins).fill(0);
        arm.values.forEach((v) => {
            const idx = Math.min(bins - 1, Math.floor(((v - min) / span) * bins));
            counts[idx] += 1;
        });
        const sorted = [...arm.values].sort((a, b) => a - b);
        return {
            arm,
            counts,
            median: percentile(sorted, 0.5),
            p10: percentile(sorted, 0.1),
            p90: percentile(sorted, 0.9),
        };
    });

    const peak = Math.max(...histograms.flatMap((h) => h.counts));
    const height = arms.length * rowH + PAD.top + PAD.bottom;
    const xFor = (v: number) => PAD.left + ((v - min) / span) * plotW;

    return (
        <div ref={ref}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                width={width}
                height={height}
                className="max-w-full"
                role="img"
                aria-label={`Outcome distribution across simulated patients for ${arms.map((a) => a.label).join(", ")}`}
            >
                {histograms.map((h, row) => {
                    const top = PAD.top + row * rowH;
                    const statsY = compact ? top + 26 : top + 11;
                    const baseY = top + rowH - 16;
                    const barMax = rowH - (compact ? 48 : 34);
                    return (
                        <g key={h.arm.id}>
                            <text
                                x={PAD.left}
                                y={top + 11}
                                className="text-[11px] font-medium"
                                fill={h.arm.color}
                            >
                                {h.arm.label}
                            </text>
                            <text
                                x={compact ? PAD.left : width - PAD.right}
                                y={statsY}
                                textAnchor={compact ? "start" : "end"}
                                className="tnum fill-muted-foreground text-[11px]"
                            >
                                median {format(h.median)} · p10–p90 {format(h.p10)}–{format(h.p90)}
                            </text>

                            <line
                                x1={PAD.left}
                                x2={width - PAD.right}
                                y1={baseY}
                                y2={baseY}
                                stroke="hsl(var(--rule))"
                                strokeWidth={1}
                            />

                            {h.counts.map((c, i) =>
                                c > 0 ? (
                                    <rect
                                        key={i}
                                        x={PAD.left + i * binWidth + 1}
                                        y={baseY - (c / peak) * barMax}
                                        width={Math.max(1, binWidth - 2)}
                                        height={(c / peak) * barMax}
                                        rx={2}
                                        fill={h.arm.color}
                                        opacity={0.85}
                                    />
                                ) : null,
                            )}

                            <line
                                x1={xFor(h.median)}
                                x2={xFor(h.median)}
                                y1={baseY - barMax - 4}
                                y2={baseY + 4}
                                stroke="hsl(var(--foreground))"
                                strokeWidth={1.5}
                            />
                        </g>
                    );
                })}

                {(compact ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => {
                    const v = min + f * span;
                    return (
                        <text
                            key={f}
                            x={xFor(v)}
                            y={height - 10}
                            textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
                            className="tnum fill-muted-foreground text-[11px]"
                        >
                            {format(v)}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
};

export default DistributionChart;
