import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, CircleDot, LoaderCircle, Send, ShieldAlert, Siren, Sparkles, X } from "lucide-react";
import { useElapsed } from "@/hooks/useSimRun";
import { useTransport } from "@/hooks/useTransport";
import { ApiError, guards, loadSnapshot, postTagged } from "@/lib/trials/api";
import { describeToolArgs } from "@/lib/trials/format";
import { LLM_PROXY, type EngineEvent } from "@/lib/trials/transport";
import type { AssistantReply, Health, Provenance } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { Disclosure } from "@/components/lab/primitives";
import { ErrorCallout, ProvenanceTag } from "./bits";
import { EngineWaitNote } from "./EngineStatus";

const STARTERS = [
    "Compare semaglutide 1 mg and empagliflozin 25 mg over 30 weeks",
    "Does empagliflozin weaken in kidney disease?",
    "What sample size would a sitagliptin trial need?",
    "How accurate is this lab?",
    "Who responds to empagliflozin?",
    "What side effects were reported for semaglutide?",
    "Should I stop taking my metformin?",
] as const;

const NIM_LABEL = "AI model (NVIDIA NIM), figures checked against the simulator";
const BROWSER_PLANNER = "Offline planner: runs in your browser, nothing is sent anywhere";

const SOURCE: Record<AssistantReply["source"], { label: string; note: string; className: string }> = {
    claude: { label: "Claude", note: "A language model wrote this, using simulator tools", className: "border-[hsl(var(--primary))] text-[hsl(217_91%_72%)]" },
    nim: { label: NIM_LABEL, note: "", className: "border-[hsl(var(--primary))] text-[hsl(217_91%_72%)]" },
    verified: { label: "Written by code", note: "Code wrote this text, so it can't be misquoted", className: "border-foreground/50 text-foreground" },
    scope: { label: "Not a simulation", note: "This is a fixed message, and no model or simulation ran", className: "border-foreground/50 text-foreground" },
    planner: { label: "Offline planner", note: "No language model: fixed rules ran the tools and filled in the numbers", className: "border-foreground/50 text-foreground" },
    "intent-model": { label: "Small trained model", note: "No language model: it only chooses a fixed or computed reply, so it can't write a number or a claim", className: "border-foreground/50 text-foreground" },
    refusal: { label: "Refusal", note: "Personal medical questions are refused", className: "border-[hsl(var(--prov-extrapolated))] text-[hsl(var(--prov-extrapolated))]" },
    emergency: { label: "Emergency", note: "This is a fixed message, and no model or simulation ran", className: "border-[hsl(var(--fail))] text-[hsl(var(--fail))]" },
    language: { label: "English only", note: "This is a fixed message, and no model or simulation ran", className: "border-foreground/50 text-foreground" },
    unsupported: { label: "Not modelled", note: "This is a fixed message, and no model or simulation ran", className: "border-foreground/50 text-foreground" },
};

const TOOL_NAMES: Record<string, string> = {
    run_virtual_trial: "Ran a virtual trial",
    power_analysis: "Estimated power",
    who_responds: "Ran who-responds",
    drug_safety: "Read reported side effects",
    validation_report: "Read the validation report",
    model_assumptions: "Read the model's parameters",
    search_registry: "Searched ClinicalTrials.gov",
    search_literature: "Searched PubMed",
};

const TOOL_RUNNING: Record<string, string> = {
    run_virtual_trial: "Running a virtual trial",
    power_analysis: "Estimating power",
    who_responds: "Running who-responds",
    drug_safety: "Reading reported side effects",
    validation_report: "Reading the validation report",
    model_assumptions: "Reading the model's parameters",
    search_registry: "Searching ClinicalTrials.gov",
    search_literature: "Searching PubMed",
};

const MODE: Record<Health["assistant_mode"], string> = {
    claude: "Claude, with the offline planner as fallback",
    nim: "NVIDIA NIM, with the offline planner as fallback",
    offline: "the offline planner, because no language model is configured",
};

interface LiveStep {
    index: number;
    name: string;
    args: string;
    status: "running" | "ok" | "failed";
    startedAt: number;
}

interface Turn {
    id: number;
    question: string;
    startedAt: number;
    /** What the AI did, recorded as it happened. */
    steps: LiveStep[];
    deciding: number | null;
    reply?: AssistantReply;
    provenance?: Provenance;
    error?: ApiError;
}

const SAVED_FILE = "assistant-starters.json";
const isStarterFile = (v: unknown) => Array.isArray(v);

const Elapsed = ({ since }: { since: number }) => {
    const seconds = useElapsed(since);
    return <span className="tnum text-muted-foreground" aria-hidden="true">{seconds} s</span>;
};

/** The AI's work, as it happens: each decision and each experiment, with its real status. */
const LiveSteps = ({ turn }: { turn: Turn }) => {
    const reduce = useReducedMotion();
    if (turn.steps.length === 0 && turn.deciding === null) return null;
    const working = !turn.reply && !turn.error;
    return (
        <ol className="mb-3 space-y-1.5" data-testid="copilot-steps" aria-label="What the AI did">
            {turn.steps.map((step) => {
                const args = describeToolArgs(step.name, step.args);
                return (
                    <motion.li
                        key={step.index}
                        data-testid="copilot-step"
                        data-status={step.status}
                        initial={reduce ? false : { opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                        className="flex items-start gap-2 text-xs"
                    >
                        <span className="mt-0.5 shrink-0">
                            {step.status === "running" ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[hsl(var(--primary))] motion-reduce:animate-none" aria-hidden="true" />
                            ) : step.status === "ok" ? (
                                <Check className="h-3.5 w-3.5 text-[hsl(var(--pass))]" aria-hidden="true" />
                            ) : (
                                <X className="h-3.5 w-3.5 text-[hsl(var(--fail))]" aria-hidden="true" />
                            )}
                        </span>
                        <span className="min-w-0">
                            <span className="font-medium">{step.status === "running" ? (TOOL_RUNNING[step.name] ?? step.name) : (TOOL_NAMES[step.name] ?? step.name)}</span>
                            {step.status === "failed" && <span className="text-[hsl(var(--fail))]">, failed</span>}
                            {args && <span className="tnum block break-words text-muted-foreground">{args}</span>}
                        </span>
                        {step.status === "running" && <span className="ml-auto shrink-0"><Elapsed since={step.startedAt} /></span>}
                    </motion.li>
                );
            })}
            {working && turn.deciding !== null && turn.steps.every((s) => s.status !== "running") && (
                <li data-testid="copilot-deciding" className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CircleDot className="h-3.5 w-3.5 shrink-0 animate-pulse text-[hsl(var(--primary))] motion-reduce:animate-none" aria-hidden="true" />
                    {turn.steps.length === 0 ? "The AI is planning its experiments" : "The AI is reading the results and deciding what next"}
                    <span className="ml-auto"><Elapsed since={turn.startedAt} /></span>
                </li>
            )}
        </ol>
    );
};

const Reply = ({ turn, reply, provenance }: { turn: Turn; reply: AssistantReply; provenance?: Provenance }) => {
    const base = SOURCE[reply.source] ?? SOURCE.planner;
    // Only true when the question really stayed here. A fallback from the AI model has already been sent.
    const inBrowser = provenance === "browser" && reply.source === "planner" && !reply.sent_to_provider;
    const source = inBrowser ? { ...base, label: BROWSER_PLANNER, note: "" } : reply.source === "planner" && reply.sent_to_provider ? { ...base, label: "Offline planner, in place of the AI's reply", note: "" } : base;
    if (reply.source === "emergency") {
        return (
            <div role="alert" data-testid="assistant-emergency" className="rounded-md border-2 border-[hsl(var(--fail))] bg-[hsl(var(--fail))]/10 p-4">
                <p className="flex items-start gap-2.5 text-lg font-semibold leading-snug tracking-tight">
                    <Siren className="mt-1 h-5 w-5 shrink-0 text-[hsl(var(--fail))]" aria-hidden="true" />
                    <span className="whitespace-pre-wrap">{reply.text}</span>
                </p>
                <p className="mt-2 pl-[1.875rem] text-xs text-muted-foreground" data-testid="assistant-source">{source.label}. {source.note}.</p>
            </div>
        );
    }
    const showTools = turn.steps.length === 0 || reply.source === "planner";
    return (
        <div className="min-w-0" data-testid="assistant-reply">
            <div className="flex flex-wrap items-center gap-2">
                <span data-testid="assistant-source" className={cn("rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", source.className)}>{source.label}</span>
                {source.note && <span className="text-[11px] text-muted-foreground">{source.note}</span>}
                {provenance === "saved" && <ProvenanceTag provenance={provenance} />}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{reply.text}</p>
            {reply.guard_note && (
                <p data-testid="assistant-guard" className="mt-2 flex items-start gap-2 rounded-md border border-[hsl(var(--prov-extrapolated))]/50 bg-[hsl(var(--prov-extrapolated))]/10 p-2.5 text-xs leading-relaxed">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
                    {reply.guard_note}
                </p>
            )}
            {!inBrowser && (
                <p className="mt-2 text-[11px] text-muted-foreground" data-testid="assistant-sent">
                    {reply.sent_to_provider ? "This question was sent to an AI provider." : "This question was not sent to an AI provider."}
                </p>
            )}
            {showTools && reply.tool_calls.length > 0 && (
                <div className="mt-3">
                    <p className="label-caps">Tools that ran</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5" data-testid="assistant-tools">
                        {reply.tool_calls.map((call, i) => (
                            <li key={`${call.tool}-${i}`} className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-xs">
                                {call.ok ? <Check className="h-3 w-3 text-[hsl(var(--pass))]" aria-hidden="true" /> : <X className="h-3 w-3 text-[hsl(var(--fail))]" aria-hidden="true" />}
                                {TOOL_NAMES[call.tool] ?? call.tool}
                                {!call.ok && <span className="text-[hsl(var(--fail))]">, failed</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {showTools && reply.tool_calls.length === 0 && reply.source !== "refusal" && (
                <p className="mt-3 text-xs text-muted-foreground">No tools ran for this reply, so it contains no simulator results.</p>
            )}
        </div>
    );
};

const applyEvent = (turn: Turn, event: EngineEvent): Turn => {
    if (event.kind === "thinking") return { ...turn, deciding: event.turn };
    const existing = turn.steps.find((s) => s.index === event.index);
    if (existing) return { ...turn, steps: turn.steps.map((s) => (s.index === event.index ? { ...s, status: event.status } : s)) };
    return { ...turn, steps: [...turn.steps, { index: event.index, name: event.name, args: event.args, status: event.status, startedAt: Date.now() }] };
};

/** The way into the lab: a question in, real experiments out, every number checked. The site guide in the corner is separate. */
export const AssistantPanel = ({ health, className }: { health: Health | null; className?: string }) => {
    const reduce = useReducedMotion();
    const { mode } = useTransport();
    const [question, setQuestion] = useState("");
    const [turns, setTurns] = useState<Turn[]>([]);
    const [busy, setBusy] = useState(false);
    const nextId = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const usesModel = mode === "server" || (mode === "browser" && LLM_PROXY !== null);

    const update = (id: number, change: (turn: Turn) => Turn) => setTurns((all) => all.map((t) => (t.id === id ? change(t) : t)));
    const finish = (id: number, patch: Partial<Turn>) => update(id, (t) => ({ ...t, ...patch }));

    const ask = async (text: string, retryOf?: number) => {
        const trimmed = text.trim();
        if (!trimmed || busy) return;
        controller.current?.abort();
        const current = new AbortController();
        controller.current = current;
        const id = retryOf ?? ++nextId.current;
        const fresh: Turn = { id, question: trimmed, startedAt: Date.now(), steps: [], deciding: null };
        setBusy(true);
        setTurns((all) => (retryOf === undefined ? [fresh, ...all] : all.map((t) => (t.id === id ? fresh : t))));
        setQuestion("");
        try {
            const { data: reply, provenance } = await postTagged<AssistantReply>("/api/assistant", { question: trimmed }, guards.assistant, current.signal, (event) => update(id, (t) => applyEvent(t, event)));
            finish(id, { reply, provenance });
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            const failure = error instanceof ApiError ? error : new ApiError("server", "The assistant couldn't answer. Please try again.");
            if (failure.kind === "offline") {
                const saved = await loadSnapshot<{ question: string; reply: AssistantReply }[]>(SAVED_FILE, isStarterFile, current.signal).catch(() => null);
                const match = saved?.find((s) => s.question === trimmed);
                if (match) finish(id, { reply: match.reply, provenance: "saved" });
                else finish(id, { error: new ApiError("offline", "The Lab Assistant needs the simulator, which isn't available here, and there is no saved answer to this question.") });
            } else {
                finish(id, { error: failure });
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <section aria-labelledby="copilot-heading" data-testid="assistant-panel" className={cn("rounded-lg border border-foreground/25 bg-card/70 p-4 shadow-[0_24px_60px_-40px_hsl(217_91%_60%/0.6)] sm:p-5", className)}>
            <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <h2 id="copilot-heading" className="text-base font-semibold tracking-tight">Ask the Lab Assistant to run an experiment</h2>
            </div>
            <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                {usesModel
                    ? "An AI model plans the experiments and the simulator runs them. A check outside the model blocks any number no tool produced."
                    : "It runs the simulator's tools and reports what they return. A check outside any language model blocks a number no tool produced."}
            </p>
            {usesModel && (
                <p data-testid="assistant-privacy" className="mt-2 text-xs font-medium text-foreground">
                    Questions may be sent to an AI provider. Don&rsquo;t enter personal or health details.
                </p>
            )}

            <form
                className="mt-3 flex items-end gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void ask(question);
                }}
            >
                <div className="min-w-0 flex-1">
                    <label htmlFor="assistant-question" className="sr-only">Your question for the Lab Assistant</label>
                    <textarea
                        id="assistant-question"
                        rows={2}
                        maxLength={2000}
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void ask(question);
                            }
                        }}
                        placeholder="Ask about a drug, a trial design, or how accurate this lab is"
                        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
                    />
                </div>
                <button type="submit" disabled={busy || !question.trim()} aria-label="Send question" className="btn-solid h-10 w-10 !p-0 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                </button>
            </form>

            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Questions to try">
                {STARTERS.map((text) => (
                    <li key={text}>
                        <button type="button" disabled={busy} onClick={() => void ask(text)} className="rounded-full border border-input px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50">
                            {text}
                        </button>
                    </li>
                ))}
            </ul>

            {turns.length > 0 && (
                <ol className="mt-4 space-y-3" aria-live="polite" data-testid="assistant-log">
                    {turns.map((turn) => (
                        <motion.li
                            key={turn.id}
                            initial={reduce ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                            className="rounded-md border border-border bg-background/70 p-3"
                        >
                            <p className="text-sm font-medium"><span className="sr-only">You asked: </span>{turn.question}</p>
                            <div className="mt-2.5 border-t border-border pt-2.5">
                                <LiveSteps turn={turn} />
                                {turn.reply && <Reply turn={turn} reply={turn.reply} provenance={turn.provenance} />}
                                {turn.error && <ErrorCallout error={turn.error} onRetry={() => void ask(turn.question, turn.id)} />}
                                {!turn.reply && !turn.error && turn.steps.length === 0 && turn.deciding === null && (
                                    <div className="space-y-1">
                                        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                                            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                            Working. If this runs a simulation it can take a while.
                                        </p>
                                        <EngineWaitNote />
                                    </div>
                                )}
                            </div>
                        </motion.li>
                    ))}
                </ol>
            )}

            <div className="mt-3">
                <Disclosure summary="How this answers">
                    <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                        <p data-testid="assistant-mode">
                            {mode === "browser" && LLM_PROXY === null
                                ? "Answers come from the offline planner, on this device. There is no language model and nothing is sent anywhere."
                                : mode === "browser"
                                  ? "An AI model plans, through a proxy that holds its key. The simulator runs on this device, and the offline planner answers if the AI service is unavailable."
                                  : health ? `Answers come from ${MODE[health.assistant_mode]}.` : "The assistant mode is not known, because the server has not answered."}
                        </p>
                        <p>It refuses questions about your own or someone else&rsquo;s treatment. Please talk to a doctor or pharmacist.</p>
                        <p>The chat button in the corner is a separate scripted guide to MedBase. It is not an AI model and runs no simulations.</p>
                    </div>
                </Disclosure>
            </div>
        </section>
    );
};
