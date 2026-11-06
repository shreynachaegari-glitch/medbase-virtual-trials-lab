import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { fmtInterval, fmtNum } from "@/lib/trials/format";
import { niceTicks } from "./ticks";
import { useElementWidth } from "./useElementWidth";

export interface ArmSeries {
    id: string;
    label: string;
    color: string;
    dash?: string;
    values: number[];
    lo: number[];
    hi: number[];
}

const HEIGHT = 320;
const LABEL_SEPARATION = 15;
const CHAR_WIDTH = 6.2;

/** Nudges end-of-line labels apart so two arms finishing close together stay readable. */
const spreadLabels = (ys: number[]): number[] => {
    const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
    const out = [...ys];
    order.forEach(({ i }, rank) => {
        if (rank === 0) return;
        const prev = order[rank - 1].i;
        out[i] = Math.max(out[i], out[prev] + LABEL_SEPARATION);
    });
    return out;
};

/** HbA1c by week per arm, in the Lab's chart style, with a keyboard readout. */
const ArmTimeChart = ({ series }: { series: ArmSeries[] }) => {
    const reduce = useReducedMotion();
    const clipId = `arm-clip-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const [active, setActive] = useState<number | null>(null);

    const weeks = series[0]?.values.length ?? 0;
    const wide = width >= 760;
    const longest = Math.max(...series.map((s) => s.label.length));
    const pad = { top: 14, right: wide ? Math.min(longest * CHAR_WIDTH + 14, 250) : 14, bottom: 42, left: 44 };
    const plotW = Math.max(40, width - pad.left - pad.right);
    const plotH = HEIGHT - pad.top - pad.bottom;

    const { min, max } = useMemo(() => {
        const all = series.flatMap((s) => [...s.lo, ...s.hi, ...s.values]);
        const lo = Math.min(...all);
        const hi = Math.max(...all);
        const margin = (hi - lo) * 0.08 || 0.5;
        return { min: lo - margin, max: hi + margin };
    }, [series]);

    const xFor = (i: number) => pad.left + (i / Math.max(1, weeks - 1)) * plotW;
    const yFor = (v: number) => pad.top + plotH - ((v - min) / (max - min || 1)) * plotH;
    const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(v)}`).join(" ");
    const xTicks = niceTicks(0, weeks - 1, wide ? 8 : 4).filter((t) => Number.isInteger(t));
    const labelYs = spreadLabels(series.map((s) => yFor(s.values[s.values.length - 1]) + 4));

    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        const from = active ?? weeks - 1;
        const to =
            e.key === "ArrowRight" ? Math.min(weeks - 1, from + 1)
            : e.key === "ArrowLeft" ? Math.max(0, from - 1)
            : e.key === "Home" ? 0
            : e.key === "End" ? weeks - 1
            : null;
        if (to === null) {
            if (e.key === "Escape") setActive(null);
            return;
        }
        e.preventDefault();
        setActive(to);
    };

    const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const frac = (e.clientX - rect.left - pad.left) / plotW;
        const i = Math.round(frac * (weeks - 1));
        setActive(i >= 0 && i < weeks ? i : null);
    };

    const activePct = active === null ? 0 : (xFor(active) / width) * 100;

    return (
        <div
            ref={ref}
            className="relative rounded-sm"
            tabIndex={0}
            role="group"
            aria-label="Simulated HbA1c by week for each arm. Use the left and right arrow keys to read it week by week."
            onKeyDown={onKey}
            onFocus={() => setActive((a) => a ?? weeks - 1)}
            onBlur={() => setActive(null)}
        >
            <svg
                viewBox={`0 0 ${width} ${HEIGHT}`}
                width={width}
                height={HEIGHT}
                className="max-w-full touch-pan-y"
                aria-hidden="true"
                onPointerMove={onMove}
                onPointerLeave={() => setActive(null)}
            >
                <defs>
                    <clipPath id={clipId}>
                        <motion.rect
                            x={0}
                            y={0}
                            height={HEIGHT}
                            initial={reduce ? false : { width: 0 }}
                            animate={{ width }}
                            transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
                        />
                    </clipPath>
                </defs>
                {niceTicks(min, max, 5).map((t) => (
                    <g key={t}>
                        <line x1={pad.left} x2={pad.left + plotW} y1={yFor(t)} y2={yFor(t)} stroke="hsl(var(--rule))" />
                        <text x={pad.left - 8} y={yFor(t) + 4} textAnchor="end" className="tnum fill-muted-foreground text-[11px]">
                            {t.toFixed(1)}
                        </text>
                    </g>
                ))}
                {xTicks.map((t) => (
                    <text key={t} x={xFor(t)} y={HEIGHT - pad.bottom + 18} textAnchor="middle" className="tnum fill-muted-foreground text-[11px]">
                        {t}
                    </text>
                ))}
                <text x={pad.left + plotW / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase" style={{ letterSpacing: "0.08em" }}>
                    Weeks from randomisation
                </text>

                <g clipPath={`url(#${clipId})`}>
                    {series.map((s) => (
                        <path
                            key={`band-${s.id}`}
                            d={`${path(s.hi)} ${[...s.lo].map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `L${xFor(i)},${yFor(v)}`).join(" ")} Z`}
                            fill={s.color}
                            opacity={0.14}
                        />
                    ))}
                    {series.map((s) => (
                        <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
                    ))}
                </g>

                {wide &&
                    series.map((s, i) => (
                        <motion.text
                            key={`label-${s.id}`}
                            x={pad.left + plotW + 8}
                            y={labelYs[i]}
                            className="text-[11px] font-medium"
                            fill={s.color}
                            initial={reduce ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: reduce ? 0 : 0.7, duration: 0.3 }}
                        >
                            {s.label}
                        </motion.text>
                    ))}

                {active !== null && (
                    <>
                        <line x1={xFor(active)} x2={xFor(active)} y1={pad.top} y2={pad.top + plotH} stroke="hsl(var(--foreground))" opacity={0.35} />
                        {series.map((s) => (
                            <circle key={s.id} cx={xFor(active)} cy={yFor(s.values[active])} r={4.5} fill={s.color} stroke="hsl(var(--background))" strokeWidth={2} />
                        ))}
                    </>
                )}
            </svg>

            {active !== null && (
                <div
                    className="pointer-events-none absolute top-2 z-10 max-w-[min(300px,90%)] rounded border border-border bg-card p-2.5 shadow-sm"
                    style={activePct > 50 ? { right: `${100 - activePct + 2}%` } : { left: `${Math.max(activePct, 8) + 2}%` }}
                    role="status"
                >
                    <p className="label-caps mb-1.5">Simulated, week {active}</p>
                    <table className="w-full text-xs">
                        <tbody>
                            {series.map((s) => (
                                <tr key={s.id}>
                                    <td className="py-0.5 pr-3 text-muted-foreground">{s.label}</td>
                                    <td className="tnum whitespace-nowrap py-0.5 text-right font-medium">{fmtNum(s.values[active])}</td>
                                    <td className="tnum hidden whitespace-nowrap py-0.5 pl-2 text-right text-muted-foreground sm:table-cell">
                                        {fmtInterval([s.lo[active], s.hi[active]])}
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

export default ArmTimeChart;
