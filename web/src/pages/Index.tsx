import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroSimulation from "@/components/HeroSimulation";
import Reveal from "@/components/motion/Reveal";
import { literature, openQuestions } from "@/data/evidence";
import { diseases, modelledConditions } from "@/data/knowledge";
import { databases } from "@/data/sources/registry";

const flow = [
    { step: "01", title: "Evidence", body: "Published effect sizes, attached to the paper they came from." },
    { step: "02", title: "Model", body: "Four equations turning those effect sizes into a trajectory." },
    { step: "03", title: "Experiment", body: "A virtual patient and the arms you want to compare." },
    { step: "04", title: "Simulation", body: "One patient, or a seeded Monte Carlo cohort." },
    { step: "05", title: "Results", body: "Outcomes, spread, and the assumption carrying the result." },
];

const Index = () => {
    const reduce = useReducedMotion();
    const modelFeeding = literature.filter((l) => l.feedsModel);

    const stats = [
        { value: String(diseases.length), label: "Condition records" },
        { value: String(modelFeeding.length), label: "Cited parameters" },
        { value: String(databases.length), label: "Live research databases" },
        { value: "4", label: "Interface languages", accent: true },
    ];

    return (
        <div className="flex min-h-screen flex-col">
            <Header />

            <main className="flex-1">
                {/* Hero */}
                <section className="relative overflow-hidden border-b border-border">
                    <div className="grid-field grid-fade pointer-events-none absolute inset-0" />

                    <div className="relative mx-auto max-w-[1400px] px-4 py-16 sm:px-6 lg:py-24">
                        <motion.div
                            initial={{ opacity: 0, transform: reduce ? "none" : "translateY(8px)" }}
                            animate={{ opacity: 1, transform: "translateY(0px)" }}
                            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                        >
                            <Link
                                to="/methods"
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                            >
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--prov-extrapolated))]" />
                                Evidence-based learning and research lab
                                <span aria-hidden="true">→</span>
                            </Link>
                        </motion.div>

                        <div className="mt-8 grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
                            <div>
                                <motion.h1
                                    className="text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-balance sm:text-5xl lg:text-6xl"
                                    initial={{
                                        opacity: 0,
                                        transform: reduce ? "none" : "translateY(14px)",
                                    }}
                                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                                    transition={{
                                        duration: 0.55,
                                        ease: [0.23, 1, 0.32, 1],
                                        delay: 0.05,
                                    }}
                                >
                                    Learn the condition.
                                    <br />
                                    Then run the experiment.
                                </motion.h1>

                                <motion.p
                                    className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground"
                                    initial={{
                                        opacity: 0,
                                        transform: reduce ? "none" : "translateY(14px)",
                                    }}
                                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                                    transition={{
                                        duration: 0.55,
                                        ease: [0.23, 1, 0.32, 1],
                                        delay: 0.12,
                                    }}
                                >
                                    A reference library for students, and a simulation lab for
                                    researchers that pulls its conditions straight out of it. Build
                                    virtual patients, compare arms, and see which assumption your
                                    answer actually rests on.
                                </motion.p>

                                <motion.div
                                    className="mt-9 flex flex-wrap items-center gap-3"
                                    initial={{
                                        opacity: 0,
                                        transform: reduce ? "none" : "translateY(14px)",
                                    }}
                                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                                    transition={{
                                        duration: 0.55,
                                        ease: [0.23, 1, 0.32, 1],
                                        delay: 0.19,
                                    }}
                                >
                                    <Link to="/lab" className="btn-solid">
                                        Run a simulation
                                    </Link>
                                    <Link to="/learn" className="btn-outline">
                                        Browse {diseases.length} conditions
                                    </Link>
                                </motion.div>
                            </div>

                            <motion.div
                                className="rounded-lg border border-border bg-card/60 p-4 backdrop-blur sm:p-6"
                                initial={{
                                    opacity: 0,
                                    transform: reduce ? "none" : "translateY(18px)",
                                }}
                                animate={{ opacity: 1, transform: "translateY(0px)" }}
                                transition={{
                                    duration: 0.6,
                                    ease: [0.23, 1, 0.32, 1],
                                    delay: 0.22,
                                }}
                            >
                                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <span className="label-caps">Live model output</span>
                                    <span className="tnum text-[11px] text-muted-foreground">
                                        HbA1c 8.0% · drift 0.35%/yr
                                    </span>
                                </div>
                                <HeroSimulation />
                                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                                    Not a picture of a chart — this is the same simulation code the
                                    Lab runs, executing in your browser.
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Stats */}
                <section className="border-b border-border">
                    <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
                        <dl className="grid grid-cols-2 gap-px bg-border lg:grid-cols-5">
                            {stats.map((s, i) => (
                                <Reveal
                                    key={s.label}
                                    index={i}
                                    // An odd count leaves a hole in the two-column grid; the last cell spans it.
                                    className={`bg-background p-6 ${i === stats.length - 1 ? "col-span-2 lg:col-span-1" : ""}`}
                                >
                                    <dt className="label-caps">{s.label}</dt>
                                    <dd
                                        className={`tnum mt-2 text-3xl ${
                                            s.accent
                                                ? "text-[hsl(var(--prov-extrapolated))]"
                                                : "text-foreground"
                                        }`}
                                    >
                                        {s.value}
                                    </dd>
                                </Reveal>
                            ))}
                        </dl>
                    </div>
                </section>

                {/* Two halves */}
                <section className="border-b border-border">
                    <div className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
                        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
                            <Reveal>
                                <div className="flex items-baseline gap-3">
                                    <span className="tnum text-xs text-muted-foreground">01</span>
                                    <h2 className="text-2xl font-semibold tracking-tight">
                                        MedBase — the knowledge base
                                    </h2>
                                </div>
                                <p className="label-caps mt-3">For students and learners</p>
                                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                                    Plain-language records on {diseases.length} conditions — causes,
                                    risk factors, prevention and treatment, each citing the public
                                    health sources it draws on. Read it to understand a disease, not
                                    to diagnose one.
                                </p>
                                <Link
                                    to="/learn"
                                    className="mt-5 inline-block text-sm text-primary hover:underline"
                                >
                                    Browse the library →
                                </Link>
                            </Reveal>

                            <Reveal index={1} className="lg:border-l lg:border-border lg:pl-20">
                                <div className="flex items-baseline gap-3">
                                    <span className="tnum text-xs text-muted-foreground">02</span>
                                    <h2 className="text-2xl font-semibold tracking-tight">
                                        The Lab — virtual experiments
                                    </h2>
                                </div>
                                <p className="label-caps mt-3">For researchers</p>
                                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                                    The Lab keeps no condition list of its own. It loads a MedBase
                                    record and runs its model where one exists — virtual patients,
                                    comparison arms, seeded cohorts, and a sensitivity pass that
                                    names the assumption driving the result. For every record it
                                    also queries {databases.length} live research databases:
                                    literature, trials, drug labels and gene–disease evidence.
                                </p>
                                <Link
                                    to="/lab"
                                    className="mt-5 inline-block text-sm text-primary hover:underline"
                                >
                                    Open the lab →
                                </Link>
                            </Reveal>
                        </div>

                        <Reveal index={2}>
                            <p className="mt-14 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
                                <span className="tnum">{modelledConditions.length}</span> of{" "}
                                <span className="tnum">{diseases.length}</span> records
                                {modelledConditions.length === 1 ? " carries" : " carry"} a model
                                binding. A binding needs published parameters for a progression
                                pathway, not just a description of the disease — so most records are
                                reference-only, and each one says so on its own page.
                            </p>
                        </Reveal>
                    </div>
                </section>

                {/* Flow */}
                <section className="border-b border-border">
                    <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
                        <Reveal>
                            <h2 className="text-sm font-semibold">
                                Evidence → model → experiment → results
                            </h2>
                        </Reveal>
                        <div className="mt-8 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
                            {flow.map((f, i) => (
                                <Reveal key={f.step} index={i} className="bg-background p-5">
                                    <span className="tnum text-xs text-muted-foreground">
                                        {f.step}
                                    </span>
                                    <h3 className="mt-2 text-sm font-medium">{f.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                        {f.body}
                                    </p>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Parameters + questions */}
                <section className="border-b border-border">
                    <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-20">
                        <Reveal>
                            <h2 className="text-xl font-semibold tracking-tight">
                                Every parameter is wired to a paper
                            </h2>
                            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                                And the ones that are not say so. The interface marks each value
                                derived, extrapolated or illustrative — an assumption is never
                                allowed to look like a citation.
                            </p>
                            <ul className="mt-6 divide-y divide-border border-y border-border">
                                {modelFeeding.map((l) => (
                                    <li key={l.pmid} className="py-3.5">
                                        <p className="text-sm">{l.feedsModel}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {l.authors.split(",")[0]} et al., {l.journal} {l.year} ·{" "}
                                            <span className="tnum">PMID {l.pmid}</span>
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </Reveal>

                        <Reveal index={1}>
                            <h2 className="text-xl font-semibold tracking-tight">
                                Questions it cannot settle
                            </h2>
                            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                                Published alongside the model rather than buried under it.
                            </p>
                            <div className="mt-6 space-y-6">
                                {openQuestions.slice(0, 3).map((q) => (
                                    <div key={q.question} className="border-t border-border pt-4">
                                        <h3 className="text-sm font-medium text-balance">
                                            {q.question}
                                        </h3>
                                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                            {q.why}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            <Link
                                to="/evidence"
                                className="mt-6 inline-block text-sm text-primary hover:underline"
                            >
                                All evidence and open questions →
                            </Link>
                        </Reveal>
                    </div>
                </section>

                {/* Close */}
                <section className="relative overflow-hidden">
                    <div className="grid-field pointer-events-none absolute inset-0 opacity-60" />
                    <div className="relative mx-auto max-w-[1400px] px-4 py-24 text-center sm:px-6">
                        <Reveal>
                            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                                Change the variables. Run the experiment.
                            </h2>
                            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                                No sign-up, no backend — the model runs in your browser, and the
                                methods page shows you all of it.
                            </p>
                            <div className="mt-8 flex flex-wrap justify-center gap-3">
                                <Link to="/lab" className="btn-solid">
                                    Open the lab
                                </Link>
                                <Link to="/methods" className="btn-outline">
                                    Read the methods
                                </Link>
                            </div>
                        </Reveal>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default Index;
