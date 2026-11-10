import { motion, useReducedMotion } from "motion/react";
import { Activity, FlaskConical, Users } from "lucide-react";
import type { ReactNode } from "react";
import { armStyles, fmtInterval, fmtNum, fmtShare } from "@/lib/trials/format";
import type { PowerCardData, RespondersCardData, ResultCard, TrialCardData } from "@/lib/trials/types";
import { useElementWidth } from "@/components/charts/useElementWidth";

const EASE = [0.23, 1, 0.32, 1] as const;
const CURVE_HEIGHT = 150;
const PAD = { top: 10, right: 12, bottom: 22, left: 34 };

type CardShellProps = { icon: ReactNode; title: string; meta: string; children: ReactNode; testId: string };

/** The frame every result card shares: what ran, on what, then the chart. */
const CardShell = ({ icon, title, meta, children, testId }: CardShellProps) => {
    const reduce = useReducedMotion();
    return (
        <motion.figure
            data-testid={testId}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="result-card min-w-0 rounded-xl border border-border bg-background/60 p-3.5"
        >
            <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-[hsl(var(--primary))]/15 text-[hsl(217_91%_72%)]">{icon}</span>
                <span className="text-sm font-semibold tracking-tight">{title}</span>
                <span className="text-[11px] text-muted-foreground">{meta}</span>
            </figcaption>
            <div className="mt-3">{children}</div>
        </motion.figure>
    );
};

/** HbA1c by week for every arm, with its 95% band. One SVG unit is one CSS pixel. */
const HbA1cCurves = ({ card, colours }: { card: TrialCardData; colours: Record<string, { color: string; dash?: string }> }) => {
    const reduce = useReducedMotion();
    const { ref, width } = useElementWidth<HTMLDivElement>(420);
    const entries = Object.entries(card.curves);
    if (entries.length === 0) return null;
    const all = entries.flatMap(([, c]) => [...c.low, ...c.high]);
    const min = Math.floor(Math.min(...all) * 2) / 2;
    const max = Math.ceil(Math.max(...all) * 2) / 2;
    const points = entries[0][1].mean.length;
    const plotW = Math.max(40, width - PAD.left - PAD.right);
    const plotH = CURVE_HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (i / Math.max(1, points - 1)) * plotW;
    const y = (v: number) => PAD.top + ((max - v) / (max - min || 1)) * plotH;
    const line = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const band = (lo: number[], hi: number[]) => `${line(hi)}${lo.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")}Z`;
    const ticks = [min, (min + max) / 2, max];
    return (
        <div ref={ref} className="min-w-0">
            <svg viewBox={`0 0 ${width} ${CURVE_HEIGHT}`} width={width} height={CURVE_HEIGHT} className="max-w-full" role="img" aria-label={`Simulated HbA1c by week for ${entries.map(([n]) => n).join(", ")}`}>
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="hsl(var(--rule))" />
                        <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" className="tnum fill-muted-foreground text-[10px]">{fmtNum(t, 1)}</text>
                    </g>
                ))}
                <text x={PAD.left} y={CURVE_HEIGHT - 4} className="fill-muted-foreground text-[10px]">Week 0</text>
                <text x={PAD.left + plotW} y={CURVE_HEIGHT - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">Week {card.weeks}</text>
                {entries.map(([name, c]) => (
                    <path key={`${name}-band`} d={band(c.low, c.high)} fill={colours[name]?.color} opacity={0.12} />
                ))}
                {entries.map(([name, c], i) => (
                    <motion.path
                        key={name}
                        d={line(c.mean)}
                        fill="none"
                        stroke={colours[name]?.color}
                        strokeWidth={2}
                        strokeDasharray={colours[name]?.dash}
                        strokeLinecap="round"
                        initial={reduce ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.9, delay: 0.1 + i * 0.12, ease: EASE }}
                    />
                ))}
            </svg>
        </div>
    );
};

/** Effect versus placebo with its 95% interval, on one shared scale that always includes zero. */
const EffectRows = ({ card, colours }: { card: TrialCardData; colours: Record<string, { color: string }> }) => {
    const reduce = useReducedMotion();
    const values = card.arms.flatMap((a) => [a.low, a.high, 0]);
    const lo = Math.min(...values) * 1.1;
    const hi = Math.max(...values, 0.1);
    const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
    return (
        <ul className="space-y-2.5" aria-label={`HbA1c change versus ${card.control}`}>
            {card.arms.map((arm, i) => (
                <li key={arm.name} className="text-xs">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                            <span className="h-2 w-2 rounded-full" style={{ background: colours[arm.name]?.color }} aria-hidden="true" />
                            {arm.name}
                        </span>
                        <span className="tnum">
                            <span className="text-sm font-semibold">{fmtNum(arm.effect)}</span>
                            <span className="text-muted-foreground"> HbA1c points ({fmtInterval([arm.low, arm.high])})</span>
                        </span>
                    </div>
                    <div className="relative mt-1.5 h-2.5 rounded-full bg-border/60" aria-hidden="true">
                        <span className="absolute inset-y-[-3px] w-px bg-foreground/50" style={{ left: `${pct(0)}%` }} />
                        <motion.span
                            className="absolute inset-y-0 rounded-full opacity-40"
                            style={{ left: `${pct(arm.low)}%`, width: `${pct(arm.high) - pct(arm.low)}%`, background: colours[arm.name]?.color, transformOrigin: "right" }}
                            initial={reduce ? false : { scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.6, delay: 0.2 + i * 0.1, ease: EASE }}
                        />
                        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background" style={{ left: `${pct(arm.effect)}%`, background: colours[arm.name]?.color }} />
                    </div>
                    <p className="tnum mt-1 text-[11px] text-muted-foreground">
                        {arm.share_below_7 !== null && <span className="whitespace-nowrap">{fmtShare(arm.share_below_7)} reached HbA1c below 7%</span>}
                        {arm.share_below_7 !== null && arm.weight !== null && " · "}
                        {arm.weight !== null && <span className="whitespace-nowrap">weight {fmtNum(arm.weight, 1)} kg</span>}
                    </p>
                </li>
            ))}
        </ul>
    );
};

const TrialCard = ({ card }: { card: TrialCardData }) => {
    const colours = armStyles([card.control, ...card.arms.map((a) => a.name)]);
    return (
        <CardShell testId="result-card-trial" icon={<FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />} title="Virtual trial" meta={`${card.weeks} weeks · ${card.n_per_arm} virtual patients per arm · vs ${card.control.toLowerCase()}`}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                <HbA1cCurves card={card} colours={colours} />
                <EffectRows card={card} colours={colours} />
            </div>
        </CardShell>
    );
};

const PowerCard = ({ card }: { card: PowerCardData }) => {
    const reduce = useReducedMotion();
    const target = card.target / 100;
    return (
        <CardShell testId="result-card-power" icon={<Activity className="h-3.5 w-3.5" aria-hidden="true" />} title="Power by arm size" meta={`${card.arm} vs placebo · ${card.weeks} weeks`}>
            <div className="flex h-28 items-end gap-1.5" role="img" aria-label={`Simulated power: ${card.curve.map((p) => `${p.n} per arm ${fmtShare(p.power)}`).join(", ")}`}>
                {card.curve.map((p, i) => {
                    const hit = card.smallest === p.n;
                    return (
                        <div key={p.n} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                            <span className="tnum text-[10px] text-muted-foreground">{fmtShare(p.power)}</span>
                            <motion.span
                                className={hit ? "w-full rounded-t-sm bg-[hsl(var(--primary))]" : p.power >= target ? "w-full rounded-t-sm bg-[hsl(var(--primary))]/45" : "w-full rounded-t-sm bg-foreground/20"}
                                style={{ height: `${Math.max(4, p.power * 100)}%`, transformOrigin: "bottom" }}
                                initial={reduce ? false : { scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
                            />
                            <span className={hit ? "tnum text-[10px] font-semibold" : "tnum text-[10px] text-muted-foreground"}>{p.n}</span>
                        </div>
                    );
                })}
            </div>
            <p className="mt-2 text-xs">
                {card.smallest !== null
                    ? <>Smallest arm reaching {card.target}% power: <span className="tnum font-semibold">{card.smallest} per arm</span></>
                    : <>No arm size tried reached {card.target}% power.</>}
            </p>
        </CardShell>
    );
};

const RespondersCard = ({ card }: { card: RespondersCardData }) => {
    const reduce = useReducedMotion();
    const top = Math.max(...card.drivers.map((d) => d.importance), 0.01);
    return (
        <CardShell testId="result-card-responders" icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />} title="Who responds" meta={`${card.arm} · ${card.weeks} weeks`}>
            <p className="tnum text-xs">
                Average individual effect <span className="text-sm font-semibold">{fmtNum(card.mean_effect)}</span>
                <span className="text-muted-foreground"> HbA1c points, spread ±{fmtNum(card.spread_sd)}</span>
            </p>
            <p className="label-caps mt-3">What drives benefit in the model</p>
            <ul className="mt-1.5 space-y-1">
                {card.drivers.map((d, i) => (
                    <li key={d.feature} className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-2 text-xs">
                        <span className="truncate">{d.feature}</span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
                            <motion.span className="block h-full origin-left rounded-full bg-[hsl(var(--primary))]" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: d.importance / top }} transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }} />
                        </span>
                        <span className="tnum text-right text-muted-foreground">{fmtShare(d.importance)}</span>
                    </li>
                ))}
            </ul>
            {card.subgroups.length > 0 && (
                <>
                    <p className="label-caps mt-3">Strongest simulated subgroups</p>
                    <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                        {card.subgroups.map((s) => (
                            <li key={s.rule}><span className="tnum font-medium text-foreground">{fmtNum(s.mean_effect)}</span> in {s.patients} patients with {s.rule}</li>
                        ))}
                    </ul>
                </>
            )}
        </CardShell>
    );
};

/** What the simulator returned this turn, drawn from the tools' own output and nothing the model wrote. */
export const ResultCards = ({ cards, footnote = true }: { cards: ResultCard[]; footnote?: boolean }) => {
    if (cards.length === 0) return null;
    return (
        <div className="mt-3 space-y-3" data-testid="result-cards">
            {cards.map((card, i) => {
                if (card.kind === "trial") return <TrialCard key={i} card={card} />;
                if (card.kind === "power") return <PowerCard key={i} card={card} />;
                return <RespondersCard key={i} card={card} />;
            })}
            {footnote && <p className="text-[11px] text-muted-foreground">Simulated in virtual patients. Not medical advice.</p>}
        </div>
    );
};
