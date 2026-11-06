import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RotateCw } from "lucide-react";
import type { ContrastRow } from "@/lib/trials/types";

const SIZE = 340;
const PAD = 38;
const LOW = -2.4;
const HIGH = 0.2;
const TOLERANCE = 0.3;
const TICKS = [-2, -1.5, -1, -0.5, 0];
const scale = (value: number) => PAD + ((value - LOW) / (HIGH - LOW)) * (SIZE - 2 * PAD);
const flip = (value: number) => SIZE - scale(value);

/**
 * Every held-out prediction starts on the "perfect" line, where the lab said it would be, then moves to the
 * result the real trial reported. All values come from the validation report; misses stay red.
 */
export const BlindReveal = ({ contrasts }: { contrasts: ContrastRow[] }) => {
    const reduce = useReducedMotion();
    const [play, setPlay] = useState(0);
    const within = contrasts.filter((row) => row.within_0_30).length;
    const missed = contrasts.length - within;
    const band = `M${scale(LOW)},${flip(LOW + TOLERANCE)} L${scale(HIGH - TOLERANCE)},${flip(HIGH)} L${scale(HIGH)},${flip(HIGH)} L${scale(HIGH)},${flip(HIGH - TOLERANCE)} L${scale(LOW + TOLERANCE)},${flip(LOW)} L${scale(LOW)},${flip(LOW)} Z`;
    return (
        <section aria-label="Predictions moving to real trial results" data-testid="blind-reveal" className="grid gap-5 border-t border-border p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
                <p className="label-caps">Prediction meets reality</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{contrasts.length} predictions, frozen first. Then the real trials were opened.</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Each dot starts where the lab predicted and moves to what the real trial reported, in HbA1c points against the comparator. Inside the band means within 0.30 points. Misses stay on screen.
                </p>
                <dl className="mt-4 flex gap-8">
                    <div><dt className="label-caps">Within 0.30</dt><dd className="tnum mt-1 text-3xl font-semibold" data-testid="blind-within">{within}</dd></div>
                    <div><dt className="label-caps">Missed</dt><dd className="tnum mt-1 text-3xl font-semibold text-[hsl(var(--fail))]" data-testid="blind-missed">{missed}</dd></div>
                </dl>
                <button type="button" onClick={() => setPlay((n) => n + 1)} className="btn-outline mt-4 gap-1.5 !px-3 !py-1.5 text-xs" data-testid="blind-replay">
                    <RotateCw className="h-3 w-3" aria-hidden="true" />Replay
                </button>
            </div>
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-[340px]" role="img" aria-label={`${within} of ${contrasts.length} held-out predictions landed within 0.30 points of the real result, and ${missed} missed`}>
                <path d={band} fill="hsl(var(--foreground) / 0.08)" />
                <line x1={scale(LOW)} y1={flip(LOW)} x2={scale(HIGH)} y2={flip(HIGH)} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                {TICKS.map((tick) => (
                    <g key={tick} fill="hsl(var(--muted-foreground))" fontSize="10">
                        <text x={scale(tick)} y={SIZE - PAD + 14} textAnchor="middle">{tick}</text>
                        <text x={PAD - 6} y={flip(tick) + 3} textAnchor="end">{tick}</text>
                    </g>
                ))}
                <text x={SIZE / 2} y={SIZE - 6} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">Predicted</text>
                <text x={10} y={SIZE / 2} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))" transform={`rotate(-90 10 ${SIZE / 2})`}>Real trial</text>
                {contrasts.map((row, i) => (
                    <motion.circle
                        key={`${play}-${row.trial}-${row.arm}`}
                        cx={scale(row.predicted)}
                        r={5}
                        fill={row.within_0_30 ? "hsl(var(--foreground))" : "hsl(var(--fail))"}
                        fillOpacity={0.9}
                        initial={reduce ? { cy: flip(row.observed) } : { cy: flip(row.predicted) }}
                        whileInView={{ cy: flip(row.observed) }}
                        viewport={{ once: true }}
                        transition={reduce ? { duration: 0 } : { delay: 0.3 + i * 0.09, duration: 0.8, ease: "easeInOut" }}
                    >
                        <title>{`${row.trial}, ${row.arm}: predicted ${row.predicted}, real ${row.observed}`}</title>
                    </motion.circle>
                ))}
            </svg>
        </section>
    );
};
