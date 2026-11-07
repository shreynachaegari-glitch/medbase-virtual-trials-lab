import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { Brain, FlaskConical, Gauge, Search, ShieldCheck, Target, type LucideIcon } from "lucide-react";
import { loadSnapshot } from "@/lib/trials/api";

interface AiStats {
    guard?: { personal_reached: number; personal_total: number };
    copilot?: { right_tool: number; questions: number };
    retrieval?: { notes: number; hit_at_3: number; questions: number };
    surrogate?: { r2: number; runs: number };
    designer?: { fewer_runs_pct: number };
    calibration?: { steps: number; trials: number };
    blind?: { within: number; total: number };
}

interface Metric {
    value: number;
    decimals?: number;
    suffix?: string;
    caption: string;
}

interface Layer {
    icon: LucideIcon;
    name: string;
    role: string;
    metric: Metric | null;
}

const layersFrom = (s: AiStats | null): Layer[] => [
    {
        icon: ShieldCheck,
        name: "Safety guard",
        role: "Rules run first. Personal and urgent messages stop here.",
        metric: s?.guard ? { value: s.guard.personal_reached, suffix: ` of ${s.guard.personal_total.toLocaleString("en-IN")}`, caption: "personal messages reached a simulation, on lists it was tuned on" } : null,
    },
    {
        icon: Search,
        name: "Copilot and vector search",
        role: "A language model plans experiments, or answers from notes found by neural search.",
        metric: s?.retrieval
            ? { value: s.retrieval.hit_at_3 * 100, suffix: "%", caption: `of ${s.retrieval.questions} held-out questions found the right note in the top 3` }
            : s?.copilot ? { value: s.copilot.right_tool, suffix: ` of ${s.copilot.questions}`, caption: "live questions chose the right tool" } : null,
    },
    {
        icon: Gauge,
        name: "Neural surrogate",
        role: "A small network that learned the simulator, for instant answers.",
        metric: s?.surrogate ? { value: s.surrogate.r2, decimals: 3, caption: `R² on simulator runs it never trained on, after ${s.surrogate.runs.toLocaleString("en-IN")} training runs` } : null,
    },
    {
        icon: Target,
        name: "AI Trial Designer",
        role: "The network proposes a study and the simulator checks it.",
        metric: s?.designer ? { value: s.designer.fewer_runs_pct, suffix: "%", caption: "fewer simulator runs than a plain search" } : null,
    },
    {
        icon: Brain,
        name: "Bayesian calibration",
        role: "MCMC fits drug effects to real trials and keeps the uncertainty.",
        metric: s?.calibration ? { value: s.calibration.steps, caption: `MCMC steps across ${s.calibration.trials} real trials` } : null,
    },
    {
        icon: FlaskConical,
        name: "Blind test",
        role: "Predictions frozen first, then compared with real trials it never saw.",
        metric: s?.blind ? { value: s.blind.within, suffix: ` of ${s.blind.total}`, caption: "predictions within 0.30 HbA1c points. The rest are shown as misses" } : null,
    },
];

const CountUp = ({ metric }: { metric: Metric }) => {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, amount: 0.6 });
    const decimals = metric.decimals ?? 0;
    const format = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const [counted, setCounted] = useState(0);
    const shown = reduce ? metric.value : counted;
    useEffect(() => {
        if (!inView || reduce) return;
        const controls = animate(0, metric.value, { duration: 1.1, ease: [0.23, 1, 0.32, 1], onUpdate: setCounted });
        return () => controls.stop();
    }, [inView, reduce, metric.value]);
    return <span ref={ref} className="tnum text-lg font-semibold tracking-tight">{format(shown)}{metric.suffix}</span>;
};

/** What the AI in this lab actually is, in the order a question meets it. Every figure comes from a saved evaluation file. */
export const AiStack = () => {
    const reduce = useReducedMotion();
    const [stats, setStats] = useState<AiStats | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        loadSnapshot<AiStats>("ai-stats.json", (v) => typeof v === "object" && v !== null, controller.signal).then(setStats).catch(() => setStats(null));
        return () => controller.abort();
    }, []);
    return (
        <section aria-labelledby="ai-stack-heading" data-testid="ai-stack" className="rounded-lg border border-border bg-card/50 p-4 sm:p-5">
            <p className="label-caps">Applied AI</p>
            <h2 id="ai-stack-heading" className="mt-1 text-base font-semibold tracking-tight">Six layers between your question and the answer</h2>
            <ol className="ai-flow mt-4 space-y-3">
                {layersFrom(stats).map((layer, i) => (
                    <motion.li
                        key={layer.name}
                        data-testid="ai-layer"
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.4 }}
                        transition={{ duration: 0.35, delay: i * 0.06, ease: [0.23, 1, 0.32, 1] }}
                        className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[1.75rem_minmax(0,1fr)_10.5rem]"
                    >
                        <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--primary))]/50 bg-background text-[hsl(217_91%_72%)]">
                            <layer.icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-medium">{layer.name}</p>
                            <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{layer.role}</p>
                        </div>
                        {layer.metric && (
                            <div className="col-start-2 mt-1 sm:col-start-3 sm:mt-0 sm:text-right">
                                <CountUp metric={layer.metric} />
                                <p className="text-pretty text-[11px] leading-snug text-muted-foreground">{layer.metric.caption}</p>
                            </div>
                        )}
                    </motion.li>
                ))}
            </ol>
        </section>
    );
};
