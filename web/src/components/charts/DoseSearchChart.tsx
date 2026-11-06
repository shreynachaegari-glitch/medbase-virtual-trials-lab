import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { fmtNum } from "@/lib/trials/format";
import type { DoseResult } from "@/lib/trials/types";
import { niceTicks } from "./ticks";
import { useElementWidth } from "./useElementWidth";

export interface DosePoint extends DoseResult {
    step: number;
}

interface Props {
    points: DosePoint[];
    target: number;
    unit: string;
    activeStep: number | null;
    onActive: (step: number | null) => void;
    /** Marks the dose the search settled on, if it settled on one. */
    chosenMg: number | null;
}

const HEIGHT = 300;
const PAD = { top: 20, right: 16, bottom: 44, left: 60 };

/**
 * Where the search went: each numbered dot is a dose it tried. The faint path is the order it tried
 * them in, so a reader can watch it close in on the target line. Dose is on a log axis, as the
 * search's own bisection is.
 */
const DoseSearchChart = ({ points, target, unit, activeStep, onActive, chosenMg }: Props) => {
    const reduce = useReducedMotion();
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const plotW = Math.max(40, width - PAD.left - PAD.right);
    const plotH = HEIGHT - PAD.top - PAD.bottom;

    if (points.length === 0) return <div ref={ref} />;

    const doses = points.map((p) => p.mg);
    const logLo = Math.log(Math.min(...doses));
    const logHi = Math.log(Math.max(...doses));
    const x = (mg: number) => PAD.left + ((Math.log(mg) - logLo) / (logHi - logLo || 1)) * plotW;
    const effects = points.flatMap((p) => [p.effect, p.interval95[0], p.interval95[1]]);
    const lo = Math.min(...effects, -target);
    const hi = Math.max(...effects, -target);
    const margin = (hi - lo) * 0.12 || 0.25;
    const min = lo - margin;
    const max = hi + margin;
    const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;
    const ends = [Math.min(...doses), Math.max(...doses)];

    return (
        <div ref={ref}>
            <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} className="max-w-full touch-pan-y" role="img" aria-label={`Doses tried by the search and the simulated HbA1c effect at each, against a target of ${fmtNum(-target)} points. The same numbers are listed in the chain of steps.`} onPointerLeave={() => onActive(null)}>
                {niceTicks(min, max, 5).map((t) => (
                    <g key={t}>
                        <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="hsl(var(--rule))" />
                        <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="tnum fill-muted-foreground text-[11px]">{fmtNum(t, 1)}</text>
                    </g>
                ))}
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(-target)} y2={y(-target)} stroke="hsl(var(--foreground))" strokeDasharray="4 4" opacity={0.8} />
                <text x={PAD.left + plotW} y={y(-target) - 6} textAnchor="end" className="tnum fill-foreground text-[11px] font-medium">Target {fmtNum(-target)}</text>
                {ends.map((mg) => (
                    <text key={mg} x={x(mg)} y={HEIGHT - PAD.bottom + 18} textAnchor={mg === ends[0] ? "start" : "end"} className="tnum fill-muted-foreground text-[11px]">{mg} {unit}</text>
                ))}
                <text x={PAD.left + plotW / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase" style={{ letterSpacing: "0.08em" }}>
                    Dose tried (log scale)
                </text>
                <text transform={`translate(11 ${PAD.top + plotH / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase" style={{ letterSpacing: "0.08em" }}>
                    Simulated HbA1c effect
                </text>
                <path d={points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.mg)},${y(p.effect)}`).join(" ")} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1} opacity={0.2} />
                <AnimatePresence>
                    {points.map((p) => {
                        const on = p.step === activeStep;
                        const met = p.effect <= -target;
                        const chosen = p.mg === chosenMg;
                        return (
                            <motion.g
                                key={p.step}
                                initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                style={{ transformOrigin: `${x(p.mg)}px ${y(p.effect)}px`, cursor: "pointer" }}
                                onPointerEnter={() => onActive(p.step)}
                            >
                                <line x1={x(p.mg)} x2={x(p.mg)} y1={y(p.interval95[0])} y2={y(p.interval95[1])} stroke="hsl(var(--foreground))" strokeWidth={1} opacity={0.5} />
                                {chosen && <circle cx={x(p.mg)} cy={y(p.effect)} r={15} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5} />}
                                <circle
                                    cx={x(p.mg)}
                                    cy={y(p.effect)}
                                    r={on ? 12 : 10}
                                    fill={met ? "hsl(var(--foreground))" : "hsl(var(--background))"}
                                    stroke="hsl(var(--foreground))"
                                    strokeWidth={1.5}
                                />
                                <text x={x(p.mg)} y={y(p.effect) + 3.5} textAnchor="middle" className="tnum text-[10px] font-semibold" fill={met ? "hsl(var(--background))" : "hsl(var(--foreground))"}>{p.step}</text>
                            </motion.g>
                        );
                    })}
                </AnimatePresence>
            </svg>
            <p className="mt-1 text-xs text-muted-foreground">
                Filled dots met the target, open dots did not. The ring marks the dose in the simulated study design.
            </p>
        </div>
    );
};

export default DoseSearchChart;
