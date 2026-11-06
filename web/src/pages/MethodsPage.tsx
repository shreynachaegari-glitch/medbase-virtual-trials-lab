import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CitationLink } from "@/components/Provenance";
import { baseParams, spreadParams, treatmentArms, hbA1cLogHazard, referenceHbA1c } from "@/sim/params";
import { betaMicro, betaMi } from "@/sim/model";
import { citations } from "@/sim/citations";

const equations = [
    {
        label: "Glycaemic trajectory",
        body: "HbA1c(t) = clamp( HbA1c₀ + shift_arm + drift × mult_arm × t , 4 , 16 )",
        note: "A level shift at entry, then linear deterioration. The clamp keeps extreme drift inside a physiological window.",
    },
    {
        label: "Glycaemic exposure",
        body: "mean(t) = ( 1 / (t+1) ) × Σ HbA1c(k) , k = 0…t",
        note: "UKPDS 35 related complications to updated mean HbA1c rather than a spot value, so the hazard is a function of the running mean.",
    },
    {
        label: "Annual hazard",
        body: "h(t) = h₀ × exp( β × [ mean(t) − 7.0 ] ) × ( 1 + d × [ duration + t ] )",
        note: "A proportional-hazards form in glycaemic excess, multiplied by a linear duration term.",
    },
    {
        label: "Cumulative incidence",
        body: "F(T) = 1 − Π ( 1 − h(t) ) , t = 1…T",
        note: "Discrete-time survival. Events are treated as absorbing and independent between endpoints.",
    },
    {
        label: "Cohort sampling",
        body: "HbA1c₀ᵢ ~ N( HbA1c₀ , σ²ₐ ) , driftᵢ ~ max( 0 , N( drift , σ²_d ) ) , durationᵢ ~ max( 0 , N( duration , σ²ₜ ) )",
        note: "Cohort mode draws each virtual patient from these, seeded. Every arm is run on the same draws, so differences between arms are paired. Percentile bands describe spread across patients — they are not confidence intervals and carry no parameter uncertainty.",
    },
];

const notModelled = [
    "Blood pressure, lipids, smoking, BMI and weight change — none of them enter the model, so no control for them is offered. Sliders that change nothing would be worse than their absence.",
    "Adherence and treatment discontinuation, which in practice dominate long-run effect sizes.",
    "Treatment switching or intensification: an arm runs unchanged for the whole horizon, which ADOPT's failure rates suggest is unrealistic past a few years.",
    "Competing mortality. A patient who would have died of something else still accrues microvascular risk here, which biases long-horizon incidence upward.",
    "Early worsening of retinopathy after rapid glycaemic improvement — a documented effect that this model's monotonic structure cannot represent at all.",
    "Between-patient heterogeneity in treatment response: every virtual patient in an arm gets an identical effect size.",
    "Any absolute calibration to an observed cohort. The model has never been fitted to outcome data.",
    "Anything retrieved by the Lab's live database panels. Those results are shown for reading, never fed into a parameter — a search hit has not been appraised.",
];

const MethodsPage = () => (
    <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6">
            <header className="max-w-3xl">
                <p className="label-caps">Methods</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                    The whole model, and what it leaves out
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    The model is small on purpose. Everything it computes is on this page, which
                    means a reader can decide for themselves whether an output is worth anything
                    rather than taking the interface's word for it.
                </p>
            </header>

            <section className="mt-12">
                <h2 className="text-base font-semibold">Structure</h2>
                <div className="mt-5 space-y-5">
                    {equations.map((e) => (
                        <div key={e.label} className="max-w-3xl border-t border-border pt-4">
                            <p className="label-caps">{e.label}</p>
                            <p className="tnum mt-2 overflow-x-auto rounded bg-secondary px-3 py-2.5 text-sm">
                                {e.body}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">{e.note}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mt-12">
                <h2 className="text-base font-semibold">Hazard coefficients</h2>
                <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
                    UKPDS 35 reports risk reduction per 1 percentage point lower updated mean
                    HbA1c. A reduction of one point multiplies risk by (1 − r), so the model uses
                    β = ln( 1 / (1 − r) ) as the log-hazard per point above the reference of{" "}
                    <span className="tnum">{referenceHbA1c.toFixed(1)}%</span>.
                </p>
                <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead>
                            <tr className="border-b border-border text-left">
                                <th className="label-caps py-2 font-medium">Endpoint</th>
                                <th className="label-caps py-2 text-right font-medium">
                                    Risk reduction per 1%
                                </th>
                                <th className="label-caps py-2 text-right font-medium">β</th>
                                <th className="label-caps py-2 text-right font-medium">
                                    Hazard ratio per +1%
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-border/60">
                                <td className="py-2.5">Microvascular complications</td>
                                <td className="tnum py-2.5 text-right">
                                    {(hbA1cLogHazard.microvascular.riskReductionPer1Pct * 100).toFixed(0)}%
                                </td>
                                <td className="tnum py-2.5 text-right">{betaMicro.toFixed(4)}</td>
                                <td className="tnum py-2.5 text-right">
                                    {Math.exp(betaMicro).toFixed(3)}
                                </td>
                            </tr>
                            <tr className="border-b border-border/60">
                                <td className="py-2.5">Myocardial infarction</td>
                                <td className="tnum py-2.5 text-right">
                                    {(hbA1cLogHazard.myocardialInfarction.riskReductionPer1Pct * 100).toFixed(0)}%
                                </td>
                                <td className="tnum py-2.5 text-right">{betaMi.toFixed(4)}</td>
                                <td className="tnum py-2.5 text-right">
                                    {Math.exp(betaMi).toFixed(3)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                    Both from <CitationLink citation={citations.ukpds35} />
                </p>
            </section>

            <section className="mt-12">
                <h2 className="text-base font-semibold">Parameter register</h2>
                <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="border-b border-border text-left">
                                <th className="label-caps py-2 font-medium">Parameter</th>
                                <th className="label-caps py-2 text-right font-medium">Default</th>
                                <th className="label-caps py-2 pr-8 text-right font-medium">
                                    Range
                                </th>
                                <th className="label-caps py-2 font-medium">Provenance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...baseParams, ...spreadParams].map((p) => (
                                <tr key={p.id} className="border-b border-border/60 align-top">
                                    <td className="py-3 pr-4">
                                        {p.label}
                                        {spreadParams.includes(p) && (
                                            <span className="label-caps ml-2 text-[10px]">cohort only</span>
                                        )}
                                    </td>
                                    <td className="tnum py-3 text-right">
                                        {p.value} {p.unit}
                                    </td>
                                    <td className="tnum py-3 pr-8 text-right text-muted-foreground">
                                        {p.min}–{p.max}
                                    </td>
                                    <td className="py-3">
                                        {p.provenance.kind === "illustrative" ? (
                                            <span className="text-[hsl(var(--prov-illustrative))]">
                                                Illustrative — no source
                                            </span>
                                        ) : (
                                            <span className="text-[hsl(var(--prov-derived))]">
                                                {p.provenance.citation.short}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {treatmentArms.map((a) => (
                                <tr key={a.id} className="border-b border-border/60 align-top">
                                    <td className="py-3 pr-4">Arm — {a.label}</td>
                                    <td className="tnum py-3 text-right">
                                        {a.hbA1cShift.toFixed(2)} %
                                    </td>
                                    <td className="tnum py-3 pr-8 text-right text-muted-foreground">
                                        ×{a.driftMultiplier} drift
                                    </td>
                                    <td className="py-3">
                                        {a.provenance.kind === "illustrative" ? (
                                            <span className="text-[hsl(var(--prov-illustrative))]">
                                                Illustrative — no source
                                            </span>
                                        ) : a.provenance.kind === "extrapolated" ? (
                                            <span className="text-[hsl(var(--prov-extrapolated))]">
                                                Extrapolated from {a.provenance.citation.short}
                                            </span>
                                        ) : (
                                            <span className="text-[hsl(var(--prov-derived))]">
                                                {a.provenance.citation.short}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="mt-12 max-w-3xl">
                <h2 className="text-base font-semibold">What the model does not represent</h2>
                <ul className="mt-5 space-y-3 border-t border-border pt-4">
                    {notModelled.map((n) => (
                        <li key={n} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                            <span className="text-border">—</span>
                            <span>{n}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mt-12 max-w-3xl">
                <h2 className="text-base font-semibold">Validation status</h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    Unvalidated. The simulation core carries unit tests, but those test internal
                    consistency — that the hazard coefficients reproduce the published risk
                    reductions, that cumulative incidence stays a probability and never decreases,
                    that a fixed seed reproduces a cohort exactly. None of that is evidence that
                    the predictions are right. No output has been compared against observed
                    outcomes in any cohort.
                </p>
                <p className="mt-4 text-sm leading-relaxed text-foreground">
                    Treat every number this tool produces as a statement about the model, not about
                    the world.
                </p>
            </section>
        </main>

        <Footer />
    </div>
);

export default MethodsPage;
