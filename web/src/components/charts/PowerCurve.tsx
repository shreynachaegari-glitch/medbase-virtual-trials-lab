import { motion, useReducedMotion } from "motion/react";
import { fmtShare } from "@/lib/trials/format";
import { useElementWidth } from "./useElementWidth";

const HEIGHT = 280;
const PAD = { top: 22, right: 22, bottom: 42, left: 44 };
const REFERENCE = 0.8; // named in the API's own field, smallest_size_reaching_80pct

interface Props {
    curve: { n_per_arm: number; power: number }[];
    highlight: number | null;
}

/** Simulated power by arm size. Arm sizes double, so the x axis is logarithmic. */
const PowerCurve = ({ curve, highlight }: Props) => {
    const reduce = useReducedMotion();
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const plotW = Math.max(40, width - PAD.left - PAD.right);
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const logs = curve.map((c) => Math.log(c.n_per_arm));
    const lo = Math.min(...logs);
    const hi = Math.max(...logs);
    const x = (n: number) => PAD.left + ((Math.log(n) - lo) / (hi - lo || 1)) * plotW;
    const y = (p: number) => PAD.top + plotH * (1 - p);

    return (
        <div ref={ref}>
            <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} className="max-w-full" aria-hidden="true">
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <g key={t}>
                        <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="hsl(var(--rule))" />
                        <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="tnum fill-muted-foreground text-[11px]">{fmtShare(t)}</text>
                    </g>
                ))}
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(REFERENCE)} y2={y(REFERENCE)} stroke="hsl(var(--foreground))" strokeDasharray="4 4" opacity={0.7} />
                <text x={PAD.left + plotW} y={y(REFERENCE) - 6} textAnchor="end" className="tnum fill-foreground text-[11px]">{fmtShare(REFERENCE)} power, a reference line</text>
                {curve.map((c) => (
                    <text key={c.n_per_arm} x={x(c.n_per_arm)} y={HEIGHT - PAD.bottom + 18} textAnchor="middle" className="tnum fill-muted-foreground text-[11px]">{c.n_per_arm}</text>
                ))}
                <text x={PAD.left + plotW / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase" style={{ letterSpacing: "0.08em" }}>
                    Patients per arm
                </text>
                <motion.path
                    d={curve.map((c, i) => `${i === 0 ? "M" : "L"}${x(c.n_per_arm)},${y(c.power)}`).join(" ")}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                />
                {curve.map((c) => {
                    const on = c.n_per_arm === highlight;
                    return (
                        <g key={c.n_per_arm}>
                            <circle cx={x(c.n_per_arm)} cy={y(c.power)} r={on ? 6 : 4} fill={on ? "hsl(var(--foreground))" : "hsl(var(--primary))"} stroke="hsl(var(--background))" strokeWidth={2} />
                            <text x={x(c.n_per_arm)} y={y(c.power) - 10} textAnchor="middle" className="tnum fill-foreground text-[11px] font-medium">{fmtShare(c.power)}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

export default PowerCurve;
