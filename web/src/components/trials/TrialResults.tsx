import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { RotateCw } from "lucide-react";
import type { SimOutcome } from "@/hooks/useSimRun";
import { armStyles, BACKGROUNDS, ENDPOINTS, endpointInfo, fmtNum, fmtShare } from "@/lib/trials/format";
import type { TrialBody } from "@/lib/trials/form";
import type { ArmResult, TrialResponse, ValidationStatus } from "@/lib/trials/types";
import { Segmented } from "@/components/lab/primitives";
import ArmTimeChart, { type ArmSeries } from "@/components/charts/ArmTimeChart";
import ForestChart, { type ForestPanel } from "@/components/charts/ForestChart";
import { BodyResponse } from "./BodyResponse";
import { CheckBadge, ProvenanceTag, SimulatedTag } from "./bits";
import { CaveatsPanel } from "./CaveatsPanel";
import { EnrolmentPanel, ThinPoolCaution } from "./EnrolmentPanel";
import { ValidationPanel, ValidationStrip } from "./ValidationPanel";

const seriesFrom = (res: TrialResponse): ArmSeries[] => {
    const names = Object.keys(res.arms);
    const styles = armStyles(names, res.arm_kinds);
    return names.map((name) => ({
        id: name,
        label: name,
        color: styles[name].color,
        dash: styles[name].dash,
        values: res.arms[name].a1c_by_week,
        lo: res.arms[name].a1c_low,
        hi: res.arms[name].a1c_high,
    }));
};

const panelsFrom = (res: TrialResponse): ForestPanel[] => {
    const arms = Object.keys(res.contrasts);
    const styles = armStyles(arms, res.arm_kinds);
    const endpoints = [...new Set(arms.flatMap((arm) => Object.keys(res.contrasts[arm])))].sort(
        (a, b) => Object.keys(ENDPOINTS).indexOf(a) - Object.keys(ENDPOINTS).indexOf(b),
    );
    return endpoints.map((endpoint) => {
        const info = endpointInfo(endpoint);
        return {
            id: endpoint,
            title: info.label,
            unit: info.unit,
            digits: info.digits,
            rows: arms.flatMap((arm) => {
                const c = res.contrasts[arm][endpoint];
                return c
                    ? [{ id: arm, label: arm, color: styles[arm].color, dashed: Boolean(styles[arm].dash), hypothetical: res.arm_kinds[arm] === "hypothetical", effect: c.effect, lo: c.interval95[0], hi: c.interval95[1], probability: c.probability_significant_benefit }]
                    : [];
            }),
        };
    });
};

const EndOfTrial = ({ arms, kinds }: { arms: Record<string, ArmResult>; kinds: TrialResponse["arm_kinds"] }) => {
    const names = Object.keys(arms);
    const styles = armStyles(names, kinds);
    const top = Math.max(...names.map((n) => arms[n].urinary_glucose_g_day), 1);
    return (
        <table className="stack-table w-full text-sm">
            <thead>
                <tr className="border-b border-border text-left">
                    <th className="label-caps py-2 pr-3 font-medium">Arm</th>
                    <th className="label-caps w-[46%] py-2 pr-3 font-medium">Urinary glucose, g/day</th>
                    <th className="label-caps py-2 text-right font-medium">HbA1c below 7%</th>
                </tr>
            </thead>
            <tbody>
                {names.map((name) => (
                    <tr key={name} className="border-b border-[hsl(var(--rule))] transition-colors hover:bg-card/70">
                        <td data-label="" className="py-2 pr-3 font-medium md:font-normal">
                            {name}
                            {kinds[name] === "hypothetical" && <span className="label-caps ml-1.5 whitespace-nowrap rounded-sm border border-dashed border-foreground/60 px-1 py-px text-foreground">Hypothetical</span>}
                        </td>
                        <td data-label="Urinary glucose, g/day" className="py-2 pr-3">
                            <span className="flex min-w-0 flex-1 items-center justify-end gap-2 md:justify-start">
                                <span className="tnum w-10 shrink-0 text-right md:order-2 md:text-left">{fmtNum(arms[name].urinary_glucose_g_day, 1)}</span>
                                <span className="hidden h-1.5 min-w-0 flex-1 md:block" aria-hidden="true">
                                    <span className="block h-full origin-left rounded-full transition-transform duration-500" style={{ background: styles[name].color, transform: `scaleX(${arms[name].urinary_glucose_g_day / top})` }} />
                                </span>
                            </span>
                        </td>
                        <td data-label="HbA1c below 7%" className="tnum py-2 md:text-right">{fmtShare(arms[name].share_below_7)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const Section = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
    <section className="border-t border-border pt-5">
        <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium tracking-tight">{title}</h3>
            <SimulatedTag />
        </div>
        {note && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{note}</p>}
        <div className="mt-4">{children}</div>
    </section>
);

const SingleResult = ({ data }: { data: TrialResponse }) => {
    const series = seriesFrom(data);
    return (
        <div className="space-y-7">
            <BodyResponse data={data} />
            <Section title="HbA1c over time" note={`Lines are the mean across ${data.uncertainty.posterior_draws} calibrated parameter draws. Bands are the 95% interval across those draws.`}>
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground lg:hidden">
                    {series.map((s) => (
                        <span key={s.id} className="inline-flex items-center gap-1.5">
                            <svg width="18" height="6" aria-hidden="true"><line x1="0" x2="18" y1="3" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} /></svg>
                            {s.label}
                        </span>
                    ))}
                </div>
                <ArmTimeChart series={series} />
            </Section>
            <Section
                title={`Effect against ${data.control.toLowerCase()}, adjusted for baseline`}
                note={`Diamonds are mean adjusted effects. Lines are 95% intervals across ${data.uncertainty.posterior_draws} parameter draws with ${data.uncertainty.replicates_per_draw} simulated trials each. P(benefit) is the share of those simulated trials with a statistically significant benefit.`}
            >
                <ForestChart panels={panelsFrom(data)} />
            </Section>
            <Section title="At the end of the trial" note="Urinary glucose is a mean at the final week. Shares are of virtual patients.">
                <EndOfTrial arms={data.arms} kinds={data.arm_kinds} />
            </Section>
        </div>
    );
};

const hba1cOf = (res: TrialResponse, arm: string) => res.contrasts[arm]?.hba1c;

/** Two eGFR ranges, same design. What changed in the simulated effect, in one reading. */
const StrataSummary = ({ outcome, validation }: { outcome: SimOutcome<TrialResponse>; validation: ValidationStatus }) => {
    const [first, second] = outcome.outputs;
    const arms = Object.keys(first.data.contrasts).filter((arm) => hba1cOf(second.data, arm));
    const v5 = validation.available ? validation.V5_pass : null;
    return (
        <section data-testid="strata-summary" className="rounded-md border border-border bg-card/40 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-medium tracking-tight">Effect on HbA1c at each eGFR range</h3>
                <SimulatedTag />
            </div>
            <ul className="mt-3 space-y-3">
                {arms.map((arm) => {
                    const a = hba1cOf(first.data, arm);
                    const b = hba1cOf(second.data, arm);
                    const gap = Math.abs(a.effect - b.effect);
                    const firstWeaker = Math.abs(a.effect) < Math.abs(b.effect);
                    return (
                        <li key={arm}>
                            <p className="text-sm font-medium">{arm}</p>
                            <p className="tnum mt-1 text-2xl font-medium tracking-tight">
                                {fmtNum(a.effect)} <span className="font-sans text-sm font-normal text-muted-foreground">at {first.label}</span>
                                <span className="mx-2 text-muted-foreground">·</span>
                                {fmtNum(b.effect)} <span className="font-sans text-sm font-normal text-muted-foreground">at {second.label}</span>
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {gap === 0
                                    ? "No difference between the two ranges in this run."
                                    : `The simulated effect is ${fmtNum(gap)} points weaker at ${firstWeaker ? first.label : second.label}.`}
                            </p>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-3 space-y-2">
                <ThinPoolCaution enrolment={first.data.enrolment} label={first.label} />
                <ThinPoolCaution enrolment={second.data.enrolment} label={second.label} />
            </div>
            {v5 !== null && (
                <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                    <CheckBadge passed={v5} />
                    Check V5 tested this kidney-function effect against real held-out trials, without fitting to them.
                </p>
            )}
        </section>
    );
};

interface Props {
    outcome: SimOutcome<TrialResponse>;
    bodies: TrialBody[];
    stale: boolean;
    busy: boolean;
    onRerun: () => void;
    /** Off when the reader asked from somewhere else on the page and should stay there. */
    autoReveal?: boolean;
}

const designLine = (data: TrialResponse, body: TrialBody | undefined) => {
    const parts = [`${data.weeks} weeks`, `${data.n_per_arm} per arm`];
    if (body) {
        if (body.dropout > 0) parts.push(`${Math.round(body.dropout * 100)}% dropout what-if`);
        parts.push(BACKGROUNDS.find((b) => b.id === body.background)?.inSentence ?? body.background);
    }
    return parts.join(" · ");
};

/** Everything a finished run produced, kept beside the status that qualifies it. */
export const TrialResults = ({ outcome, bodies, stale, busy, onRerun, autoReveal = true }: Props) => {
    const reduce = useReducedMotion();
    const heading = useRef<HTMLHeadingElement>(null);
    const [picked, setPicked] = useState(0);
    const index = Math.min(picked, outcome.outputs.length - 1);
    const current = outcome.outputs[index];
    const { data, provenance } = current;

    // Bring a new result into view, unless the reader has since moved into a field to keep editing.
    useEffect(() => {
        const inField = document.activeElement instanceof HTMLElement && document.activeElement.matches("input, select, textarea");
        if (inField || !autoReveal) return;
        heading.current?.focus({ preventScroll: true });
        heading.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, [outcome.id, reduce, autoReveal]);

    return (
        <section aria-labelledby="results-heading" data-testid="trial-results" className="mt-10">
            <ValidationStrip status={data.validation} />
            <div className="mt-4 flex flex-wrap items-center gap-2 lg:mt-0">
                <h2 id="results-heading" ref={heading} tabIndex={-1} className="scroll-mt-44 text-lg font-semibold tracking-tight outline-none">Simulated trial result</h2>
                <SimulatedTag />
                <ProvenanceTag provenance={provenance} />
                <span className="sr-only" role="status">Simulated trial result ready.</span>
            </div>
            <p className="tnum mt-1 text-xs text-muted-foreground">
                {designLine(data, bodies[index])}
                {provenance === "live" && outcome.elapsedSeconds > 0 ? ` · ran in ${outcome.elapsedSeconds} s` : ""}
            </p>

            {stale && (
                <div data-testid="stale-note" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card/60 px-3 py-2 text-xs">
                    <span>You have changed the design since this run. These results still show the earlier design.</span>
                    <button type="button" onClick={onRerun} disabled={busy} className="btn-outline gap-1.5 !px-3 !py-1 text-xs disabled:opacity-50">
                        <RotateCw className="h-3 w-3" aria-hidden="true" />
                        Run with my changes
                    </button>
                </div>
            )}

            <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="order-2 min-w-0 space-y-7 lg:order-none">
                    {outcome.outputs.length > 1 && (
                        <>
                            <StrataSummary outcome={outcome} validation={data.validation} />
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground">Showing detail for</span>
                                <Segmented
                                    value={String(index)}
                                    options={outcome.outputs.map((o, i) => ({ id: String(i), label: o.label }))}
                                    onChange={(v) => setPicked(Number(v))}
                                    label="eGFR range to show"
                                />
                            </div>
                        </>
                    )}
                    <SingleResult data={data} />
                </div>
                {/* On a phone the status and notice come before the charts and enrolment after them. */}
                <aside className="contents min-w-0 lg:sticky lg:top-40 lg:block lg:space-y-4 lg:self-start" aria-label="Status of this result">
                    <div className="order-1 space-y-4 lg:order-none">
                        <CaveatsPanel caveats={data} />
                        <ValidationPanel status={data.validation} notice={data.notice} provenance={provenance} />
                    </div>
                    <div className="order-3 lg:order-none">
                        <EnrolmentPanel enrolment={data.enrolment} nPerArm={data.n_per_arm} />
                    </div>
                </aside>
            </div>
        </section>
    );
};
