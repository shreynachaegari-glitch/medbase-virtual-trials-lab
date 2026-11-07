import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CircleCheck, FlaskConical, MessageSquareText, Sparkles, Target } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { AiStack } from "@/components/trials/AiStack";
import { startEngine } from "@/lib/trials/transport";

const EASE = [0.23, 1, 0.32, 1] as const;
const FLOW_STEP_MS = 1400;
const ENGINE_WARMUP_DELAY_MS = 1500;

const ACTIONS = [
    { icon: MessageSquareText, title: "Ask the AI copilot", body: "Ask in plain English. It plans the experiment, runs the simulator and explains the result, or answers from its notes.", to: "/trials", cta: "Ask a question" },
    { icon: FlaskConical, title: "Run a virtual trial", body: "Pick drugs, doses, duration and study population, then see the simulated HbA1c and weight effects with their uncertainty.", to: "/trials?tab=trial", cta: "Build a trial" },
    { icon: Target, title: "Design a study with AI", body: "Set a goal, such as a 0.5 point HbA1c effect. A neural network proposes a study, and the simulator checks it.", to: "/trials#designer", cta: "Set a goal" },
    { icon: CircleCheck, title: "Check the proof", body: "See every prediction the lab froze before real results were opened, including the ones it got wrong.", to: "/trials?tab=proof", cta: "See the results" },
];

const STEPS = [
    { title: "Real survey labs", body: "De-identified lab results from adults with diabetes in the US NHANES health survey." },
    { title: "Virtual patients", body: "Each person's labs become the settings of a glucose and insulin model. Nobody's values are invented." },
    { title: "Calibrated on real trials", body: "Bayesian MCMC fits drug effects to published trials and keeps the uncertainty." },
    { title: "Simulated trial", body: "Virtual patients are enrolled and randomised, and the results are analysed the way many real trials are." },
    { title: "Tested blind", body: "Predictions were frozen, then compared with real trials the model had never seen." },
];

const FLOW = [
    { stage: "Your question", detail: "In plain English" },
    { stage: "Safety guard", detail: "Personal and urgent messages stop here" },
    { stage: "AI copilot", detail: "Plans an experiment, or searches its notes" },
    { stage: "Simulator", detail: "Computes every number, on your device" },
    { stage: "Checks", detail: "Code compares the reply with what really ran" },
    { stage: "Answer", detail: "With the lab's track record beside it" },
];

const MORE = [
    { to: "/anatomy", title: "Anatomy", body: "A 3D body to explore, with related conditions." },
    { to: "/lab", title: "Lab", body: "Disease progression and live research databases." },
    { to: "/evidence", title: "Evidence", body: "The papers behind the models." },
    { to: "/methods", title: "Methods", body: "The whole model, and what it leaves out." },
];

/** How a question travels through the lab, one stage at a time. It shows the route only, so it contains no results. */
const QuestionFlow = () => {
    const reduce = useReducedMotion();
    const [active, setActive] = useState(FLOW.length - 1);
    useEffect(() => {
        if (reduce) return;
        const timer = setInterval(() => setActive((i) => (i + 1) % FLOW.length), FLOW_STEP_MS);
        return () => clearInterval(timer);
    }, [reduce]);
    return (
        <div data-testid="home-flow" className="rounded-lg border border-foreground/20 bg-card/70 p-5 shadow-[0_24px_60px_-40px_hsl(217_91%_60%/0.6)] backdrop-blur">
            <p className="label-caps">How a question travels</p>
            <ol className="ai-flow mt-4 space-y-3">
                {FLOW.map((item, i) => {
                    const lit = reduce || i <= active;
                    return (
                        <li key={item.stage} className="relative flex items-start gap-3">
                            <span
                                className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-[11px] font-semibold tabular-nums transition-[border-color,color,box-shadow] duration-300 ease-out"
                                style={{
                                    borderColor: lit ? "hsl(var(--primary))" : "hsl(var(--border))",
                                    color: lit ? "hsl(217 91% 72%)" : "hsl(var(--muted-foreground))",
                                    boxShadow: !reduce && i === active ? "0 0 0 4px hsl(217 91% 60% / 0.18)" : "none",
                                }}
                            >
                                {i + 1}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-medium transition-colors duration-300" style={{ color: lit ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>{item.stage}</span>
                                <span className="block text-xs leading-relaxed text-muted-foreground">{item.detail}</span>
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
};

/** What the site is, for someone who has just arrived. */
const Index = () => {
    const reduce = useReducedMotion();
    // The simulator takes a while to load, so a static build starts it quietly here. Nobody waits after clicking through.
    useEffect(() => {
        const saving = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
        if (!import.meta.env.VITE_LANDING || saving) return;
        const timer = setTimeout(() => void startEngine().catch(() => undefined), ENGINE_WARMUP_DELAY_MS);
        return () => clearTimeout(timer);
    }, []);
    const enter = (delay: number) => ({ initial: reduce ? false : { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: EASE, delay } });

    return (
        <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">
                <section className="relative overflow-hidden border-b border-border">
                    <div className="aurora pointer-events-none absolute inset-0" aria-hidden="true" />
                    <div className="grid-field grid-fade pointer-events-none absolute inset-0" aria-hidden="true" />
                    <div className="relative mx-auto grid max-w-[1400px] items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:py-20">
                        <div className="min-w-0">
                            <motion.p {...enter(0)} className="label-caps inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[hsl(217_91%_72%)]" aria-hidden="true" />MedBase Virtual Trials Lab</motion.p>
                            <motion.h1 {...enter(0.06)} className="text-balance mt-4 text-[2rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                                Try a diabetes drug trial on virtual patients, and <span className="text-ai">see how far to trust the result.</span>
                            </motion.h1>
                            <motion.p {...enter(0.12)} className="text-pretty mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                                An applied AI lab that simulates type 2 diabetes drug trials in your browser, on virtual patients built from real health survey data. An AI copilot plans the experiment from plain English, and a simulator computes every number.
                            </motion.p>
                            <motion.div {...enter(0.18)} className="mt-7 flex flex-wrap items-center gap-3">
                                <Link to="/trials" className="btn-solid gap-2" data-testid="home-start">Run a virtual trial<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                                <Link to="/trials?tab=proof" className="btn-outline">See how it was tested</Link>
                            </motion.div>
                            <motion.p {...enter(0.24)} className="mt-5 text-xs text-muted-foreground">Free to use, with no account.</motion.p>
                        </div>
                        <motion.div {...enter(0.2)} className="min-w-0"><QuestionFlow /></motion.div>
                    </div>
                </section>

                <section aria-labelledby="home-why" className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-6 lg:py-16">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                        <h2 id="home-why" className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Why this exists</h2>
                        <div className="text-pretty space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                            <p>Real drug trials take years and large sums, so students and researchers rarely get to see how a study design behaves before it runs.</p>
                            <p>Many health AI tools also give confident answers with no way to check them. This lab lets you rehearse a study, and it shows its own track record beside every result, including where it was wrong.</p>
                        </div>
                    </div>
                </section>

                <section aria-labelledby="home-actions" className="border-t border-border bg-card/30">
                    <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:py-16">
                        <h2 id="home-actions" className="text-2xl font-semibold tracking-tight sm:text-3xl">What you can do here</h2>
                        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {ACTIONS.map((action) => (
                                <li key={action.title}>
                                    <Link to={action.to} data-testid="home-action" className="group flex h-full flex-col rounded-lg border border-border bg-background/60 p-5 transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-[hsl(var(--primary))]/60 active:scale-[0.99]">
                                        <action.icon className="h-5 w-5 text-[hsl(217_91%_72%)]" aria-hidden="true" />
                                        <span className="mt-3 text-sm font-semibold">{action.title}</span>
                                        <span className="text-pretty mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{action.body}</span>
                                        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium">{action.cta}<ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden="true" /></span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section aria-labelledby="home-how" className="border-t border-border">
                    <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:py-16">
                        <h2 id="home-how" className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
                        <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
                            {STEPS.map((step, i) => (
                                <li key={step.title}>
                                    <p className="tnum text-xs font-semibold text-[hsl(217_91%_72%)]">0{i + 1}</p>
                                    <p className="mt-1.5 text-sm font-semibold">{step.title}</p>
                                    <p className="text-pretty mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section aria-label="The AI in this lab" className="border-t border-border bg-card/30">
                    <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:py-16">
                        <AiStack />
                    </div>
                </section>

                <section aria-labelledby="home-more" className="border-t border-border">
                    <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6">
                        <h2 id="home-more" className="label-caps">Also in MedBase</h2>
                        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {MORE.map((item) => (
                                <li key={item.to}>
                                    <Link to={item.to} className="block rounded-md py-1 text-sm font-medium hover:underline">{item.title}</Link>
                                    <p className="text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
};

export default Index;
