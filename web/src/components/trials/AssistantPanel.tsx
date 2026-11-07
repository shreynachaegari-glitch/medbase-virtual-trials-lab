import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, CircleDot, Copy, LoaderCircle, RotateCcw, Send, ShieldAlert, Siren, Sparkles, X } from "lucide-react";
import { useElapsed } from "@/hooks/useSimRun";
import { useTransport } from "@/hooks/useTransport";
import { ApiError, guards, loadSnapshot, postTagged } from "@/lib/trials/api";
import { describeToolArgs } from "@/lib/trials/format";
import { LLM_PROXY, type EngineEvent } from "@/lib/trials/transport";
import type { AssistantReply, Health, Provenance } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { Disclosure } from "@/components/lab/primitives";
import { ErrorCallout, ProvenanceTag } from "./bits";
import { RichText } from "./RichText";
import { EngineWaitNote } from "./EngineStatus";

const STARTERS = [
    "What is the applied AI in this lab?",
    "Compare semaglutide 1 mg and empagliflozin 25 mg over 30 weeks",
    "Does empagliflozin weaken in kidney disease?",
    "What sample size would a sitagliptin trial need?",
    "How accurate is this lab?",
    "Who responds to empagliflozin?",
    "What is semaglutide?",
    "What side effects were reported for semaglutide?",
    "Should I stop taking my metformin?",
] as const;

const NIM_LABEL = "AI model (NVIDIA NIM), figures checked against the simulator";
const NIM_NOTES_LABEL = "AI model (NVIDIA NIM), answering only from the notes below";
const MAX_HISTORY_TURNS = 4;
const PROMPT_HINTS = [
    "Ask anything about diabetes, drug trials or this lab",
    "Try: How does a clinical trial actually work?",
    "Try: Simulate sitagliptin 100 mg against placebo for 26 weeks",
    "Try: What is the applied AI in this lab?",
    "Try: What is an SGLT2 inhibitor?",
    "Try: Who responds to empagliflozin?",
];
const HINT_MS = 3500;
const FOLLOW_UP_SOURCES = new Set<AssistantReply["source"]>(["claude", "nim", "assistant", "planner", "reference", "verified"]);
const BROWSER_PLANNER = "Offline planner: runs in your browser, nothing is sent anywhere";

const SOURCE: Record<AssistantReply["source"], { label: string; note: string; className: string }> = {
    claude: { label: "Claude", note: "A language model wrote this, using simulator tools", className: "border-[hsl(var(--primary))] text-[hsl(217_91%_72%)]" },
    nim: { label: NIM_LABEL, note: "", className: "border-[hsl(var(--primary))] text-[hsl(217_91%_72%)]" },
    assistant: { label: "AI model, general knowledge", note: "Not checked by the simulator. Code removes any dose or drug effect it can't source", className: "border-[hsl(var(--primary))] text-[hsl(217_91%_72%)]" },
    verified: { label: "Written by code", note: "Code wrote this text, so it can't be misquoted", className: "border-foreground/50 text-foreground" },
    reference: { label: "Reference note", note: "A note from the lab\u2019s own library, written for this project. No simulation ran", className: "border-foreground/50 text-foreground" },
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

/** Each stage this question really went through, lit in order. Nothing here plays unless it happened. */
const Trace = ({ steps }: { steps: NonNullable<AssistantReply["trace"]> }) => {
    const reduce = useReducedMotion();
    return (
        <ol className="mt-3 flex flex-wrap items-center gap-y-1.5" aria-label="What happened to this question" data-testid="assistant-trace">
            {steps.map((step, i) => (
                <motion.li
                    key={step.stage}
                    title={step.detail}
                    initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.16, duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    className="flex items-center"
                >
                    {i > 0 && <span className="trace-link" aria-hidden="true" />}
                    <span className="rounded-full border border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[11px] font-medium">
                        {step.stage}
                        <span className="sr-only">: {step.detail}</span>
                    </span>
                </motion.li>
            ))}
        </ol>
    );
};

/** The notes vector search found, with their real match scores. */
const RETRIEVAL_LABEL: Record<string, string> = {
    pgvector: "Vector database: pgvector, running in your browser",
    neural: "Notes found by meaning, with neural embeddings",
    keyword: "Notes found by wording, with keyword vectors",
};
const VECTOR_QUERY = "SELECT title, 1 - (embedding <=> $1) AS score FROM notes ORDER BY embedding <=> $1";

const Sources = ({ sources, retrieval, queryMs }: { sources: NonNullable<AssistantReply["sources"]>; retrieval: AssistantReply["retrieval"]; queryMs: AssistantReply["query_ms"] }) => {
    const reduce = useReducedMotion();
    return (
        <div className="mt-3" data-testid="assistant-sources">
            <p className="label-caps">{RETRIEVAL_LABEL[retrieval ?? "keyword"]}{typeof queryMs === "number" && <span className="tnum"> &middot; {queryMs.toFixed(1)} ms</span>}</p>
            {retrieval === "pgvector" && <code data-testid="vector-query" className="mt-1 block overflow-x-auto whitespace-nowrap font-mono text-[10px] text-muted-foreground">{VECTOR_QUERY}</code>}
            <ul className="mt-1.5 space-y-1">
                {sources.map((source) => (
                    <li key={source.title} className="grid grid-cols-[minmax(0,1fr)_4.5rem_2.25rem] items-center gap-2 text-xs">
                        <span className="truncate">{source.title}</span>
                        <span className="block h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
                            <motion.span
                                className="block h-full origin-left rounded-full bg-[hsl(var(--primary))]"
                                initial={reduce ? false : { scaleX: 0 }}
                                animate={{ scaleX: source.score }}
                                transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                            />
                        </span>
                        <span className="tnum text-right text-muted-foreground">{source.score.toFixed(2)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const URGENT_LINE = /If this is urgent, call 112 now\. If you are thinking of harming yourself, call Tele-MANAS on 14416, free and open all day and night\.\s*/;

/** The helpline stays on every reply that needs it, set apart so the answer reads as an answer. */
const splitUrgentLine = (text: string) => {
    const match = text.match(URGENT_LINE);
    return match ? { answer: text.replace(URGENT_LINE, "").trim(), urgent: match[0].trim() } : { answer: text, urgent: null };
};

const Reply = ({ turn, reply, provenance, onAsk, busy }: { turn: Turn; reply: AssistantReply; provenance?: Provenance; onAsk: (text: string) => void; busy: boolean }) => {
    const [copied, setCopied] = useState(false);
    const answeredFromNotes = reply.source === "nim" && (reply.sources?.length ?? 0) > 0;
    const base = answeredFromNotes ? { ...SOURCE.nim, label: NIM_NOTES_LABEL } : (SOURCE[reply.source] ?? SOURCE.planner);
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
    const { answer, urgent } = splitUrgentLine(reply.text);
    const showTools = turn.steps.length === 0 || reply.source === "planner";
    const toolsRun = reply.tool_calls.filter((call) => call.tool !== "search_knowledge"); // the notes it found are listed above
    return (
        <div className="min-w-0" data-testid="assistant-reply">
            <div className="flex flex-wrap items-center gap-2">
                {/* General answers read like any assistant's, so screen readers get the source and the page shows no badge. */}
                <span data-testid="assistant-source" className={reply.source === "assistant" ? "sr-only" : cn("rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", source.className)}>{source.label}</span>
                {source.note && reply.source !== "assistant" && <span className="text-[11px] text-muted-foreground">{source.note}</span>}
                {provenance === "saved" && <ProvenanceTag provenance={provenance} />}
            </div>
            <div className="mt-2"><RichText text={answer} reveal /></div>
            <button
                type="button"
                data-testid="assistant-copy"
                onClick={() => void navigator.clipboard?.writeText(answer).then(() => setCopied(true)).catch(() => undefined)}
                className="mt-1.5 inline-flex min-h-7 items-center gap-1 rounded text-[11px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
                {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                {copied ? "Copied" : "Copy answer"}
            </button>
            {reply.interpreted_as && (
                <p data-testid="assistant-interpreted" className="mt-2 text-xs text-muted-foreground">Understood as: <span className="text-foreground">{reply.interpreted_as}</span></p>
            )}
            {reply.trace && reply.trace.length > 0 && <Trace steps={reply.trace} />}
            {(reply.sources?.length ?? 0) > 0 && <Sources sources={reply.sources ?? []} retrieval={reply.retrieval} queryMs={reply.query_ms} />}
            {reply.guard_note && (
                <p data-testid="assistant-guard" className="mt-2 flex items-start gap-2 rounded-md border border-[hsl(var(--prov-extrapolated))]/50 bg-[hsl(var(--prov-extrapolated))]/10 p-2.5 text-xs leading-relaxed">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
                    {reply.guard_note}
                </p>
            )}
            {urgent && <p data-testid="assistant-urgent" className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{urgent}</p>}
            {!inBrowser && (
                <p className="mt-2 text-[11px] text-muted-foreground" data-testid="assistant-sent">
                    {reply.sent_to_provider ? "This question was sent to an AI provider." : "This question was not sent to an AI provider."}
                </p>
            )}
            {showTools && toolsRun.length > 0 && (
                <div className="mt-3">
                    <p className="label-caps">Tools that ran</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5" data-testid="assistant-tools">
                        {toolsRun.map((call, i) => (
                            <li key={`${call.tool}-${i}`} className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-xs">
                                {call.ok ? <Check className="h-3 w-3 text-[hsl(var(--pass))]" aria-hidden="true" /> : <X className="h-3 w-3 text-[hsl(var(--fail))]" aria-hidden="true" />}
                                {TOOL_NAMES[call.tool] ?? call.tool}
                                {!call.ok && <span className="text-[hsl(var(--fail))]">, failed</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {showTools && toolsRun.length === 0 && reply.source !== "refusal" && (reply.sources?.length ?? 0) === 0 && (
                <p className="mt-3 text-xs text-muted-foreground">No tools ran for this reply, so it contains no simulator results.</p>
            )}
            {(reply.suggestions?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5" data-testid="assistant-suggestions" aria-label="Ask next">
                    {reply.suggestions?.map((text) => (
                        <button key={text} type="button" disabled={busy} onClick={() => onAsk(text)} className="rounded-full border border-[hsl(var(--primary))]/40 px-2.5 py-1 text-left text-xs transition-[background-color,border-color] duration-150 ease-out hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 disabled:opacity-50">
                            {text}
                        </button>
                    ))}
                </div>
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

/** The way into the lab: a question in, real experiments out, every number checked. */
export const AssistantPanel = ({ health, className }: { health: Health | null; className?: string }) => {
    const reduce = useReducedMotion();
    const { mode } = useTransport();
    const [question, setQuestion] = useState("");
    const [turns, setTurns] = useState<Turn[]>([]);
    const [busy, setBusy] = useState(false);
    const nextId = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const usesModel = mode === "server" || (mode === "browser" && LLM_PROXY !== null);
    const lastQuestion = useRef<string | null>(null);
    const history = useRef<{ question: string; answer: string }[]>([]);
    const newChat = () => {
        controller.current?.abort();
        setTurns([]);
        setBusy(false);
        lastQuestion.current = null;
        history.current = [];
    };
    const [hint, setHint] = useState(0);
    useEffect(() => {
        if (reduce || question) return;
        const timer = setInterval(() => setHint((i) => (i + 1) % PROMPT_HINTS.length), HINT_MS);
        return () => clearInterval(timer);
    }, [reduce, question]);

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
            const { data: reply, provenance } = await postTagged<AssistantReply>("/api/assistant", { question: trimmed, previous: lastQuestion.current, history: history.current }, guards.assistant, current.signal, (event) => update(id, (t) => applyEvent(t, event)));
            finish(id, { reply, provenance });
            if (FOLLOW_UP_SOURCES.has(reply.source)) {
                lastQuestion.current = reply.interpreted_as ?? trimmed;
                history.current = [...history.current, { question: reply.interpreted_as ?? trimmed, answer: splitUrgentLine(reply.text).answer }].slice(-MAX_HISTORY_TURNS);
            }
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
        <section aria-labelledby="copilot-heading" data-testid="assistant-panel" data-busy={busy} className={cn("copilot-shell rounded-lg border border-foreground/25 bg-card/70 p-4 shadow-[0_24px_60px_-40px_hsl(217_91%_60%/0.6)] sm:p-5", busy && "copilot-live", className)}>
            <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <h2 id="copilot-heading" className="text-base font-semibold tracking-tight">Ask the AI copilot</h2>
            </div>
            <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                {usesModel
                    ? "Ask it anything, the way you would any AI assistant. It explains ideas, follows the conversation, and runs real simulations when you ask about a drug\u2019s effect. Checks outside the model block medical advice and any drug figure no tool produced."
                    : "It runs the simulator's tools and reports what they return. A check outside any language model blocks a number no tool produced."}
            </p>
            {usesModel && (
                <p data-testid="assistant-privacy" className="mt-2 text-xs font-medium text-foreground">
                    Questions may be sent to an AI provider. Don&rsquo;t enter personal or health details.
                </p>
            )}



            {turns.length > 0 && (
                <ol className="copilot-log mt-4 flex max-h-[34rem] flex-col-reverse gap-3 overflow-y-auto pr-1" aria-live="polite" tabIndex={0} aria-label="Conversation" data-testid="assistant-log">
                    {turns.map((turn) => (
                        <motion.li
                            key={turn.id}
                            initial={reduce ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                            className="min-w-0 shrink-0"
                        >
                            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[hsl(var(--primary))]/15 px-3 py-2 text-sm font-medium"><span className="sr-only">You asked: </span>{turn.question}</p>
                            <div className="mt-2.5">
                                <LiveSteps turn={turn} />
                                {turn.reply && <Reply turn={turn} reply={turn.reply} provenance={turn.provenance} onAsk={(text) => void ask(text)} busy={busy} />}
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
                        placeholder={PROMPT_HINTS[hint]}
                        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
                    />
                </div>
                <button type="submit" disabled={busy || !question.trim()} aria-label="Send question" className="btn-solid h-10 w-10 !p-0 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                </button>
            </form>
            {turns.length > 0 && (
                <div className="mt-2 flex justify-end">
                    <button type="button" onClick={newChat} data-testid="assistant-new-chat" className="inline-flex min-h-8 items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />New chat
                    </button>
                </div>
            )}
            {turns.length === 0 ? (
                <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Questions to try">
                {STARTERS.map((text) => (
                    <li key={text}>
                        <button type="button" disabled={busy} onClick={() => void ask(text)} className="rounded-full border border-input px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50">
                            {text}
                        </button>
                    </li>
                ))}
            </ul>
            ) : (
                <div className="mt-2"><Disclosure summary="More questions to try">            <ul className="flex flex-wrap gap-1.5" aria-label="Questions to try">
                {STARTERS.map((text) => (
                    <li key={text}>
                        <button type="button" disabled={busy} onClick={() => void ask(text)} className="rounded-full border border-input px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50">
                            {text}
                        </button>
                    </li>
                ))}
            </ul></Disclosure></div>
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
                        <p>General answers come from the AI model&rsquo;s own knowledge. They are not checked by the simulator and can be wrong. Code removes any dose or drug effect it can&rsquo;t source.</p>
                        <p>It refuses questions about your own or someone else&rsquo;s treatment. Please talk to a doctor or pharmacist.</p>
                    </div>
                </Disclosure>
            </div>
        </section>
    );
};
