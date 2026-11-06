import { useMemo, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { contrastKey, fmtInterval, fmtNum } from "@/lib/trials/format";
import type { ContrastRow } from "@/lib/trials/types";
import { niceTicks } from "./ticks";
import { useElementWidth } from "./useElementWidth";

const BAND = 0.3; // the pre-registered +/-0.30 tolerance on an HbA1c contrast
const MAX_SIZE = 560;
const PAD = { top: 12, right: 12, bottom: 42, left: 58 };

interface Props {
    contrasts: ContrastRow[];
    activeKey: string | null;
    onActive: (key: string | null) => void;
}

/** A hit is a filled circle; a miss is an open diamond. The pair survives without colour. */
const Marker = ({ x, y, hit, active }: { x: number; y: number; hit: boolean; active: boolean }) =>
    hit ? (
        <circle cx={x} cy={y} r={active ? 7 : 5} fill="hsl(var(--pass))" stroke="hsl(var(--background))" strokeWidth={1.5} />
    ) : (
        <rect
            x={x - (active ? 7 : 5.5)}
            y={y - (active ? 7 : 5.5)}
            width={active ? 14 : 11}
            height={active ? 14 : 11}
            transform={`rotate(45 ${x} ${y})`}
            fill="hsl(var(--background))"
            stroke="hsl(var(--fail))"
            strokeWidth={2}
        />
    );

/** Predicted against observed on equal axes: on the identity line means the prediction was exact. */
const ValidationScatter = ({ contrasts, activeKey, onActive }: Props) => {
    const reduce = useReducedMotion();
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const [showIntervals, setShowIntervals] = useState(false);

    const size = Math.min(width, MAX_SIZE);
    const plot = size - PAD.left - PAD.right;
    const plotH = size - PAD.top - PAD.bottom;

    const { min, max } = useMemo(() => {
        const all = contrasts.flatMap((c) => [c.predicted, c.observed]);
        const lo = Math.min(...all, 0);
        const hi = Math.max(...all, 0);
        const margin = (hi - lo) * 0.08 || 0.5;
        return { min: lo - margin, max: hi + margin };
    }, [contrasts]);

    const x = (v: number) => PAD.left + ((v - min) / (max - min)) * plot;
    const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;
    const ticks = niceTicks(min, max, size < 420 ? 3 : 5);
    const clampHigh = (v: number) => Math.min(v, max);
    const clampLow = (v: number) => Math.max(v, min);

    // The band runs along the identity line and stops at the plot edges.
    const band = [
        [min, clampHigh(min + BAND)],
        [clampLow(max - BAND), max],
        [max, max],
        [max, clampLow(max - BAND)],
        [clampHigh(min + BAND), min],
        [min, min],
    ]
        .map(([observed, predicted]) => `${x(observed)},${y(predicted)}`)
        .join(" ");

    const ordered = useMemo(() => [...contrasts].sort((a, b) => a.observed - b.observed), [contrasts]);
    const activeIndex = ordered.findIndex((c) => contrastKey(c) === activeKey);
    const active = activeIndex >= 0 ? ordered[activeIndex] : null;
    const hits = contrasts.filter((c) => c.within_0_30).length;

    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        const last = ordered.length - 1;
        const to =
            e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(last, activeIndex + 1)
            : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(0, activeIndex < 0 ? 0 : activeIndex - 1)
            : e.key === "Home" ? 0
            : e.key === "End" ? last
            : null;
        if (to === null) return;
        e.preventDefault();
        onActive(contrastKey(ordered[to]));
    };

    return (
        <div ref={ref} className="min-w-0">
            <div
                className="rounded-sm"
                tabIndex={0}
                role="group"
                aria-label={`Predicted against observed HbA1c contrast. ${hits} of ${contrasts.length} are within the band. Use the arrow keys to read each contrast.`}
                onKeyDown={onKey}
                onFocus={() => {
                    if (!activeKey && ordered[0]) onActive(contrastKey(ordered[0]));
                }}
            >
                <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="max-w-full touch-pan-y" aria-hidden="true" onPointerLeave={() => onActive(null)}>
                    <polygon points={band} fill="hsl(var(--pass))" opacity={0.09} />
                    {ticks.map((t) => (
                        <g key={t}>
                            <line x1={PAD.left} x2={PAD.left + plot} y1={y(t)} y2={y(t)} stroke="hsl(var(--rule))" />
                            <line x1={x(t)} x2={x(t)} y1={PAD.top} y2={PAD.top + plotH} stroke="hsl(var(--rule))" />
                            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="tnum fill-muted-foreground text-[11px]">{fmtNum(t, 1)}</text>
                            <text x={x(t)} y={PAD.top + plotH + 17} textAnchor="middle" className="tnum fill-muted-foreground text-[11px]">{fmtNum(t, 1)}</text>
                        </g>
                    ))}
                    <line x1={x(min)} y1={y(min)} x2={x(max)} y2={y(max)} stroke="hsl(var(--foreground))" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
                    <text x={PAD.left + plot / 2} y={size - 4} textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase" style={{ letterSpacing: "0.08em" }}>
                        Observed in the real trial
                    </text>
                    <text transform={`translate(11 ${PAD.top + plotH / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase" style={{ letterSpacing: "0.08em" }}>
                        Simulated prediction
                    </text>

                    {showIntervals &&
                        contrasts.map((c) => (
                            <line
                                key={`pi-${contrastKey(c)}`}
                                x1={x(c.observed)}
                                x2={x(c.observed)}
                                y1={y(clampHigh(c.pi95[1]))}
                                y2={y(clampLow(c.pi95[0]))}
                                stroke={c.within_0_30 ? "hsl(var(--pass))" : "hsl(var(--fail))"}
                                strokeWidth={1}
                                opacity={0.5}
                            />
                        ))}

                    {ordered.map((c, i) => {
                        const key = contrastKey(c);
                        return (
                            <motion.g
                                key={key}
                                onPointerEnter={() => onActive(key)}
                                onPointerDown={() => onActive(key)}
                                initial={reduce ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3, delay: reduce ? 0 : i * 0.02 }}
                                style={{ cursor: "pointer" }}
                            >
                                <circle cx={x(c.observed)} cy={y(c.predicted)} r={11} fill="transparent" />
                                <Marker x={x(c.observed)} y={y(c.predicted)} hit={c.within_0_30} active={key === activeKey} />
                            </motion.g>
                        );
                    })}
                </svg>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="hsl(var(--pass))" /></svg>
                    Within &plusmn;0.30 ({hits})
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <svg width="12" height="12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)" fill="none" stroke="hsl(var(--fail))" strokeWidth="1.5" /></svg>
                    Missed ({contrasts.length - hits})
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <svg width="16" height="12" aria-hidden="true"><line x1="0" x2="16" y1="6" y2="6" stroke="hsl(var(--foreground))" strokeDasharray="3 3" /></svg>
                    Identity line
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-[hsl(var(--pass)/0.25)]" aria-hidden="true" />
                    &plusmn;0.30 band
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input type="checkbox" checked={showIntervals} onChange={(e) => setShowIntervals(e.target.checked)} className="accent-[hsl(var(--primary))]" />
                    95% predictive intervals
                </label>
            </div>

            <div className="mt-3 min-h-[5.25rem] rounded-md border border-border bg-card/50 p-3 text-xs" role="status">
                {active ? (
                    <>
                        <p className="font-medium text-foreground">{active.arm} vs {active.reference}</p>
                        <p className="text-muted-foreground">{active.trial}</p>
                        <p className="tnum mt-1.5 text-muted-foreground">
                            Predicted <span className="text-foreground">{fmtNum(active.predicted)}</span> · Observed <span className="text-foreground">{fmtNum(active.observed)}</span> · Error <span className="text-foreground">{fmtNum(active.error)}</span> · 95% PI {fmtInterval(active.pi95)}
                        </p>
                    </>
                ) : (
                    <p className="text-muted-foreground">Hover a point, or focus the chart and use the arrow keys, to read a contrast.</p>
                )}
            </div>
        </div>
    );
};

export default ValidationScatter;
