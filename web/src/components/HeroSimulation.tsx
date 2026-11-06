import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { simulatePatient } from "@/sim/model";
import { treatmentArms } from "@/sim/params";

const W = 620;
const H = 300;
const PAD = { top: 20, right: 16, bottom: 40, left: 40 };

const HORIZON = 10;
const constants = {
    baselineMicroHazard: 0.025,
    baselineMiHazard: 0.012,
    durationHazardPerYear: 0.04,
};
const patient = { baselineHbA1c: 8.0, driftRate: 0.35, diabetesDuration: 5 };

/**
 * The hero graphic is the actual model — `simulatePatient` from src/sim, same code the Lab
 * runs — drawing itself once on load. A decorative chart would have been a lie about what
 * the product does.
 */
const HeroSimulation = () => {
    const reduce = useReducedMotion();

    const series = useMemo(
        () =>
            ["none", "metformin"].map((id, i) => {
                const arm = treatmentArms.find((a) => a.id === id)!;
                const points = simulatePatient(patient, arm, constants, HORIZON);
                return {
                    id,
                    label: arm.shortLabel,
                    color: `var(--series-${i === 0 ? 1 : 2})`,
                    values: points.map((p) => p.cumulativeMicro),
                };
            }),
        [],
    );

    const all = series.flatMap((s) => s.values);
    const max = Math.max(...all) * 1.12;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const xFor = (i: number) => PAD.left + (i / HORIZON) * plotW;
    const yFor = (v: number) => PAD.top + plotH - (v / max) * plotH;

    return (
        <div className="relative">
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                role="img"
                aria-label="Modelled cumulative microvascular incidence over ten years, untreated versus metformin"
            >
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                    <line
                        key={f}
                        x1={PAD.left}
                        x2={PAD.left + plotW}
                        y1={PAD.top + plotH * f}
                        y2={PAD.top + plotH * f}
                        stroke="hsl(var(--rule))"
                        strokeWidth={1}
                    />
                ))}
                {[0, 0.5, 1].map((f) => (
                    <text
                        key={f}
                        x={PAD.left - 10}
                        y={PAD.top + plotH * (1 - f) + 4}
                        textAnchor="end"
                        className="tnum fill-muted-foreground text-[10px]"
                    >
                        {Math.round(max * f * 100)}%
                    </text>
                ))}

                {series.map((s, i) => {
                    const d = s.values
                        .map((v, idx) => `${idx === 0 ? "M" : "L"}${xFor(idx)},${yFor(v)}`)
                        .join(" ");
                    return (
                        <g key={s.id}>
                            <motion.path
                                d={d}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={reduce ? { opacity: 0 } : { pathLength: 0 }}
                                animate={reduce ? { opacity: 1 } : { pathLength: 1 }}
                                transition={{
                                    duration: reduce ? 0.3 : 1.2,
                                    ease: [0.23, 1, 0.32, 1],
                                    delay: reduce ? 0 : i * 0.12,
                                }}
                            />
                            <motion.circle
                                cx={xFor(HORIZON)}
                                cy={yFor(s.values[HORIZON])}
                                r={4}
                                fill={s.color}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{
                                    duration: 0.25,
                                    delay: reduce ? 0 : 1.1 + i * 0.12,
                                }}
                            />
                            <motion.text
                                x={xFor(HORIZON) - 8}
                                y={yFor(s.values[HORIZON]) - 12}
                                textAnchor="end"
                                className="text-[11px] font-medium"
                                fill={s.color}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{
                                    duration: 0.3,
                                    delay: reduce ? 0 : 1.2 + i * 0.12,
                                }}
                            >
                                {s.label} {(s.values[HORIZON] * 100).toFixed(0)}%
                            </motion.text>
                        </g>
                    );
                })}

                <text
                    x={PAD.left}
                    y={H - 8}
                    className="fill-muted-foreground text-[10px] uppercase"
                    style={{ letterSpacing: "0.08em" }}
                >
                    Cumulative microvascular incidence · 10 years
                </text>
            </svg>
        </div>
    );
};

export default HeroSimulation;
