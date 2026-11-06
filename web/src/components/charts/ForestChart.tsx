import { motion, useReducedMotion } from "motion/react";
import { fmtInterval, fmtNum, fmtShare } from "@/lib/trials/format";
import { niceTicks } from "./ticks";

export interface ForestRow {
    id: string;
    label: string;
    color: string;
    dashed?: boolean;
    /** Shown beside the arm's name, when the API calls it hypothetical. */
    hypothetical?: boolean;
    effect: number;
    lo: number;
    hi: number;
    probability: number;
}

export interface ForestPanel {
    id: string;
    title: string;
    unit: string;
    digits: number;
    rows: ForestRow[];
}

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * Effect versus placebo with a 95% interval. Each endpoint has its own scale because points, mg/dL
 * and kg do not share an axis. Drawn in HTML so tracks stay fluid at any width without measuring.
 */
const ForestChart = ({ panels }: { panels: ForestPanel[] }) => {
    const reduce = useReducedMotion();
    return (
        <div className="space-y-8">
            {panels.map((panel) => {
                const values = panel.rows.flatMap((r) => [r.lo, r.hi, r.effect, 0]);
                const lo = Math.min(...values);
                const hi = Math.max(...values);
                const margin = (hi - lo) * 0.12 || 0.5;
                const min = lo - margin;
                const max = hi + margin;
                const pct = (v: number) => ((v - min) / (max - min)) * 100;
                const ticks = niceTicks(min, max, 4);
                const tickDigits = ticks.every(Number.isInteger) ? 0 : 1;
                return (
                    <section key={panel.id} aria-label={`${panel.title} effect versus placebo`}>
                        <h4 className="text-sm font-medium">
                            {panel.title} <span className="font-normal text-muted-foreground">({panel.unit}, simulated)</span>
                        </h4>
                        <ul className="mt-2">
                            {panel.rows.map((row, i) => (
                                <li
                                    key={row.id}
                                    className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-[hsl(var(--rule))] py-2.5 transition-colors hover:bg-card/70 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_9.5rem_5.5rem] md:items-center"
                                >
                                    <span className="flex min-w-0 items-center gap-2 text-sm">
                                        <span
                                            aria-hidden="true"
                                            className="h-2 w-2 shrink-0 rounded-full"
                                            style={row.dashed ? { border: `1.5px dashed ${row.color}` } : { background: row.color }}
                                        />
                                        <span className="min-w-0 break-words">
                                            {row.label}
                                            {row.hypothetical && <span className="label-caps ml-1.5 whitespace-nowrap rounded-sm border border-dashed border-foreground/60 px-1 py-px text-foreground">Hypothetical</span>}
                                        </span>
                                    </span>
                                    <div className="relative h-5" aria-hidden="true">
                                        <span className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${pct(0)}%` }} />
                                        <motion.span
                                            className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
                                            style={{
                                                left: `${pct(row.lo)}%`,
                                                width: `${pct(row.hi) - pct(row.lo)}%`,
                                                background: row.color,
                                                transformOrigin: `${((pct(row.effect) - pct(row.lo)) / Math.max(pct(row.hi) - pct(row.lo), 0.01)) * 100}% 50%`,
                                            }}
                                            initial={reduce ? false : { scaleX: 0 }}
                                            animate={{ scaleX: 1 }}
                                            transition={{ duration: 0.6, ease: EASE, delay: reduce ? 0 : i * 0.05 }}
                                        />
                                        <span
                                            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-background"
                                            style={{ left: `${pct(row.effect)}%`, background: row.color }}
                                        />
                                    </div>
                                    <span className="tnum text-xs md:text-right">
                                        <span className="font-medium text-foreground">{fmtNum(row.effect, panel.digits)}</span>
                                        <span className="block text-muted-foreground">{fmtInterval([row.lo, row.hi], panel.digits)}</span>
                                    </span>
                                    <span className="tnum text-xs text-muted-foreground md:text-right" title="Share of simulated trials showing a statistically significant benefit">
                                        <span className="md:hidden">Significant benefit in </span>
                                        <span className="font-medium text-foreground">{fmtShare(row.probability)}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <div className="grid grid-cols-1 gap-x-4 border-t border-[hsl(var(--rule))] pt-1.5 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_9.5rem_5.5rem]">
                            <span className="hidden md:block" />
                            <div className="relative h-4" aria-hidden="true">
                                {ticks.map((t) => (
                                    <span key={t} className="tnum absolute -translate-x-1/2 text-[11px] text-muted-foreground" style={{ left: `${pct(t)}%` }}>
                                        {fmtNum(t, tickDigits)}
                                    </span>
                                ))}
                            </div>
                            <span className="label-caps hidden text-right md:block">Effect, 95%</span>
                            <span className="label-caps hidden text-right md:block">P(benefit)</span>
                        </div>
                    </section>
                );
            })}
        </div>
    );
};

export default ForestChart;
