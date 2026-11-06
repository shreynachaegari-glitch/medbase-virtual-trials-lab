import { useMemo, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { fmtNum } from "@/lib/trials/format";
import type { ProgressionRow } from "@/lib/trials/types";
import { niceTicks } from "./ticks";
import { useElementWidth } from "./useElementWidth";

export interface ProgressionLine {
    id: string;
    label: string;
    color: string;
    interventionDay: number;
    rows: ProgressionRow[];
}

type Metric = "glucose_mg_dl" | "beta_cell_state" | "insulin_sensitivity";

const PANELS: { metric: Metric; title: string; unit: string; digits: number; reference?: number }[] = [
    { metric: "glucose_mg_dl", title: "Glucose", unit: "mg/dL", digits: 1, reference: 126 },
    { metric: "beta_cell_state", title: "Beta-cell state", unit: "source-model state, not a cell count", digits: 0 },
    { metric: "insulin_sensitivity", title: "Insulin sensitivity", unit: "source-model Si", digits: 3 },
];

const PANEL_HEIGHT = 170;
const PAD = { top: 12, right: 14, bottom: 22, left: 48 };

const nearest = (rows: ProgressionRow[], day: number): ProgressionRow | null => {
    if (rows.length === 0) return null;
    return rows.reduce((best, row) => (Math.abs(row.day - day) < Math.abs(best.day - day) ? row : best));
};

/** Three stacked panels on one shared time axis, with a crosshair that moves across all of them. */
const ProgressionCharts = ({ lines }: { lines: ProgressionLine[] }) => {
    const reduce = useReducedMotion();
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const [day, setDay] = useState<number | null>(null);

    const maxDay = useMemo(() => Math.max(...lines.flatMap((l) => l.rows.map((r) => r.day))), [lines]);
    const plotW = Math.max(40, width - PAD.left - PAD.right);
    const plotH = PANEL_HEIGHT - PAD.top - PAD.bottom;
    const x = (d: number) => PAD.left + (d / (maxDay || 1)) * plotW;
    const xTicks = niceTicks(0, maxDay, width < 520 ? 3 : 8);
    const step = lines[0]?.rows[1] ? lines[0].rows[1].day - lines[0].rows[0].day : 1;

    const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const frac = (e.clientX - rect.left - PAD.left) / plotW;
        setDay(frac >= 0 && frac <= 1 ? frac * maxDay : null);
    };

    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        const from = day ?? 0;
        const stride = e.shiftKey ? step * 20 : step * 4;
        const to =
            e.key === "ArrowRight" ? Math.min(maxDay, from + stride)
            : e.key === "ArrowLeft" ? Math.max(0, from - stride)
            : e.key === "Home" ? 0
            : e.key === "End" ? maxDay
            : null;
        if (to === null) {
            if (e.key === "Escape") setDay(null);
            return;
        }
        e.preventDefault();
        setDay(to);
    };

    return (
        <div
            ref={ref}
            className="rounded-sm"
            tabIndex={0}
            role="group"
            aria-label="Glucose, beta-cell state and insulin sensitivity over time in one model scenario. Use the left and right arrow keys to move through time."
            onKeyDown={onKey}
            onFocus={() => setDay((d) => d ?? 0)}
            onBlur={() => setDay(null)}
        >
            {PANELS.map((panel) => {
                const values = lines.flatMap((l) => l.rows.map((r) => r[panel.metric]));
                const lo = Math.min(...values, panel.reference ?? Infinity);
                const hi = Math.max(...values, panel.reference ?? -Infinity);
                const margin = (hi - lo) * 0.08 || 0.5;
                const min = lo - margin;
                const max = hi + margin;
                const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;
                return (
                    <figure key={panel.metric} className="mb-4">
                        <figcaption className="text-xs">
                            <span className="font-medium text-foreground">{panel.title}</span>{" "}
                            <span className="text-muted-foreground">{panel.unit}</span>
                        </figcaption>
                        <svg viewBox={`0 0 ${width} ${PANEL_HEIGHT}`} width={width} height={PANEL_HEIGHT} className="mt-1 max-w-full touch-pan-y" aria-hidden="true" onPointerMove={onMove} onPointerLeave={() => setDay(null)}>
                            {niceTicks(min, max, 4).map((t) => (
                                <g key={t}>
                                    <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="hsl(var(--rule))" />
                                    <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="tnum fill-muted-foreground text-[11px]">
                                        {panel.digits > 1 ? t.toFixed(2) : t}
                                    </text>
                                </g>
                            ))}
                            {xTicks.map((t) => (
                                <text key={t} x={x(t)} y={PANEL_HEIGHT - 6} textAnchor="middle" className="tnum fill-muted-foreground text-[11px]">{t}</text>
                            ))}
                            {panel.reference !== undefined && (
                                <>
                                    <line x1={PAD.left} x2={PAD.left + plotW} y1={y(panel.reference)} y2={y(panel.reference)} stroke="hsl(var(--foreground))" strokeDasharray="2 3" opacity={0.75} />
                                    <text x={PAD.left + plotW} y={y(panel.reference) - 5} textAnchor="end" className="tnum fill-foreground text-[11px]">{panel.reference} mg/dL, a fasting reference line</text>
                                </>
                            )}
                            {lines.map((line) => (
                                <line key={`day-${line.id}`} x1={x(line.interventionDay)} x2={x(line.interventionDay)} y1={PAD.top} y2={PAD.top + plotH} stroke={line.color} strokeDasharray="5 3" opacity={0.65} />
                            ))}
                            {lines.map((line) => (
                                <motion.path
                                    key={line.id}
                                    d={line.rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(r.day)},${y(r[panel.metric])}`).join(" ")}
                                    fill="none"
                                    stroke={line.color}
                                    strokeWidth={2}
                                    strokeLinejoin="round"
                                    initial={reduce ? false : { pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
                                />
                            ))}
                            {day !== null && (
                                <>
                                    <line x1={x(day)} x2={x(day)} y1={PAD.top} y2={PAD.top + plotH} stroke="hsl(var(--foreground))" opacity={0.35} />
                                    {lines.map((line) => {
                                        const row = nearest(line.rows, day);
                                        return row ? <circle key={line.id} cx={x(row.day)} cy={y(row[panel.metric])} r={4} fill={line.color} stroke="hsl(var(--background))" strokeWidth={2} /> : null;
                                    })}
                                </>
                            )}
                        </svg>
                    </figure>
                );
            })}
            <p className="label-caps text-center">Days in the model</p>

            <div className="mt-3 min-h-[4.5rem] rounded-md border border-border bg-card/50 p-3 text-xs" role="status">
                {day === null ? (
                    <p className="text-muted-foreground">Hover the charts, or focus them and use the arrow keys, to read all three states on one day. Dashed verticals mark each scenario&rsquo;s intervention day.</p>
                ) : (
                    <table className="w-full">
                        <caption className="label-caps mb-1 text-left">Model state, day {Math.round(nearest(lines[0].rows, day)?.day ?? day)}</caption>
                        <tbody>
                            {lines.map((line) => {
                                const row = nearest(line.rows, day);
                                if (!row) return null;
                                return (
                                    <tr key={line.id}>
                                        <td className="py-0.5 pr-3">
                                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: line.color }} aria-hidden="true" />
                                                {line.label}
                                            </span>
                                        </td>
                                        <td className="tnum whitespace-nowrap py-0.5 pr-3 text-right">{fmtNum(row.glucose_mg_dl, 1)} mg/dL</td>
                                        <td className="tnum hidden whitespace-nowrap py-0.5 pr-3 text-right sm:table-cell">{fmtNum(row.beta_cell_state, 0)}</td>
                                        <td className="tnum hidden whitespace-nowrap py-0.5 text-right sm:table-cell">Si {fmtNum(row.insulin_sensitivity, 3)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ProgressionCharts;
