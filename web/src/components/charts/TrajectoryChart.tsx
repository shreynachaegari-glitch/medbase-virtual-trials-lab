import { useMemo, useRef, useState } from "react";
import { niceTicks } from "./ticks";
import { useElementWidth } from "./useElementWidth";

export interface TrajectorySeries {
    id: string;
    label: string;
    color: string;
    values: number[];
    band?: { lo: number[]; hi: number[] };
}

interface Props {
    years: number[];
    series: TrajectorySeries[];
    yLabel: string;
    format: (v: number) => string;
    yDomain?: [number, number];
    showBands?: boolean;
    height?: number;
}

const TrajectoryChart = ({
    years,
    series,
    yLabel,
    format,
    yDomain,
    showBands = true,
    height = 300,
}: Props) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const { ref: wrapRef, width } = useElementWidth<HTMLDivElement>();

    const compact = width < 560;
    const PAD = {
        top: 14,
        right: compact ? 14 : 92,
        bottom: compact ? 40 : 38,
        left: compact ? 44 : 50,
    };

    const { min, max } = useMemo(() => {
        const all: number[] = [];
        series.forEach((s) => {
            all.push(...s.values);
            if (showBands && s.band) all.push(...s.band.lo, ...s.band.hi);
        });
        if (yDomain) return { min: yDomain[0], max: yDomain[1] };
        const lo = Math.min(...all);
        const hi = Math.max(...all);
        const pad = (hi - lo) * 0.08 || 0.5;
        return { min: lo - pad, max: hi + pad };
    }, [series, showBands, yDomain]);

    const plotW = Math.max(40, width - PAD.left - PAD.right);
    const plotH = height - PAD.top - PAD.bottom;
    const xFor = (i: number) => PAD.left + (i / Math.max(1, years.length - 1)) * plotW;
    const yFor = (v: number) => PAD.top + plotH - ((v - min) / (max - min || 1)) * plotH;

    const ticks = niceTicks(min, max, compact ? 4 : 5);
    const xTickEvery = Math.ceil(years.length / (compact ? 6 : 11));

    const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const xPx = ((e.clientX - rect.left) / rect.width) * width;
        const frac = (xPx - PAD.left) / plotW;
        const idx = Math.round(frac * (years.length - 1));
        setHoverIdx(idx >= 0 && idx < years.length ? idx : null);
    };

    const hoverX = hoverIdx !== null ? xFor(hoverIdx) : 0;
    const tooltipPct = hoverIdx !== null ? (hoverX / width) * 100 : 0;
    const flip = tooltipPct > 58;

    return (
        <div className="relative" ref={wrapRef}>
            <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                width={width}
                height={height}
                className="max-w-full touch-none"
                onPointerMove={handleMove}
                onPointerLeave={() => setHoverIdx(null)}
                role="img"
                aria-label={`${yLabel} over ${years.length - 1} years for ${series.map((s) => s.label).join(", ")}`}
            >
                {ticks.map((t) => (
                    <g key={t}>
                        <line
                            x1={PAD.left}
                            x2={PAD.left + plotW}
                            y1={yFor(t)}
                            y2={yFor(t)}
                            stroke="hsl(var(--rule))"
                            strokeWidth={1}
                        />
                        <text
                            x={PAD.left - 8}
                            y={yFor(t) + 4}
                            textAnchor="end"
                            className="tnum fill-muted-foreground text-[11px]"
                        >
                            {format(t)}
                        </text>
                    </g>
                ))}

                {years.map((yr, i) =>
                    i % xTickEvery === 0 || i === years.length - 1 ? (
                        <text
                            key={yr}
                            x={xFor(i)}
                            y={height - PAD.bottom + 18}
                            textAnchor="middle"
                            className="tnum fill-muted-foreground text-[11px]"
                        >
                            {yr}
                        </text>
                    ) : null,
                )}
                <text
                    x={PAD.left + plotW / 2}
                    y={height - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px] uppercase"
                    style={{ letterSpacing: "0.08em" }}
                >
                    Years from entry
                </text>

                {showBands &&
                    series.map((s) =>
                        s.band ? (
                            <path
                                key={`band-${s.id}`}
                                d={[
                                    ...s.band.hi.map(
                                        (v, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(v)}`,
                                    ),
                                    ...[...s.band.lo]
                                        .map((v, i) => ({ v, i }))
                                        .reverse()
                                        .map(({ v, i }) => `L${xFor(i)},${yFor(v)}`),
                                    "Z",
                                ].join(" ")}
                                fill={s.color}
                                opacity={0.1}
                            />
                        ) : null,
                    )}

                {series.map((s) => (
                    <path
                        key={s.id}
                        d={s.values
                            .map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(v)}`)
                            .join(" ")}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                ))}

                {/* Direct labels where there is room; the legend above carries identity otherwise. */}
                {!compact &&
                    series.map((s) => (
                        <text
                            key={`lab-${s.id}`}
                            x={PAD.left + plotW + 8}
                            y={yFor(s.values[s.values.length - 1]) + 4}
                            className="text-[11px] font-medium"
                            fill={s.color}
                        >
                            {s.label}
                        </text>
                    ))}

                {hoverIdx !== null && (
                    <>
                        <line
                            x1={hoverX}
                            x2={hoverX}
                            y1={PAD.top}
                            y2={PAD.top + plotH}
                            stroke="hsl(var(--foreground))"
                            strokeWidth={1}
                            opacity={0.35}
                        />
                        {series.map((s) => (
                            <circle
                                key={`pt-${s.id}`}
                                cx={hoverX}
                                cy={yFor(s.values[hoverIdx])}
                                r={4.5}
                                fill={s.color}
                                stroke="hsl(var(--card))"
                                strokeWidth={2}
                            />
                        ))}
                    </>
                )}
            </svg>

            {hoverIdx !== null && (
                <div
                    className="pointer-events-none absolute top-2 z-10 min-w-[180px] rounded border border-border bg-card p-2.5 shadow-sm"
                    style={
                        flip ? { right: `${100 - tooltipPct + 2}%` } : { left: `${tooltipPct + 2}%` }
                    }
                >
                    <p className="label-caps mb-1.5">Year {years[hoverIdx]}</p>
                    <table className="w-full text-xs">
                        <tbody>
                            {series.map((s) => (
                                <tr key={s.id}>
                                    <td className="py-0.5 pr-3">
                                        <span className="flex items-center gap-1.5">
                                            <span
                                                className="inline-block h-2 w-2 rounded-full"
                                                style={{ background: s.color }}
                                            />
                                            <span className="text-muted-foreground">{s.label}</span>
                                        </span>
                                    </td>
                                    <td className="tnum py-0.5 text-right font-medium">
                                        {format(s.values[hoverIdx])}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default TrajectoryChart;
