import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Activity, ArrowUp, BookOpen, Check, Copy, FlaskConical, Maximize2, RotateCcw, ShieldAlert, Siren, Sparkles, Square, Users } from "lucide-react";
import { useTransport } from "@/hooks/useTransport";
import { ApiError, guards, loadSnapshot, postTagged } from "@/lib/trials/api";
import { LLM_PROXY } from "@/lib/trials/transport";
import type { AssistantReply, Health, Provenance } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { Disclosure } from "@/components/lab/primitives";
import { Reasoning, type SourceInfo } from "@/components/copilot/Reasoning";
import { ResultCards } from "@/components/copilot/ResultCards";
import { applyEvent, type Turn } from "@/components/copilot/turn";
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

const CAPABILITIES: { icon: ReactNode; title: string; prompt: string }[] = [
    { icon: <FlaskConical className="h-4 w-4" aria-hidden="true" />, title: "Run a virtual trial", prompt: "Compare semaglutide 1 mg and empagliflozin 25 mg over 30 weeks" },
    { icon: <Activity className="h-4 w-4" aria-hidden="true" />, title: "Plan a study", prompt: "What sample size would a sitagliptin trial need?" },
    { icon: <Users className="h-4 w-4" aria-hidden="true" />, title: "Find who responds", prompt: "Who responds to empagliflozin?" },
    { icon: <BookOpen className="h-4 w-4" aria-hidden="true" />, title: "Explain a concept", prompt: "What is an SGLT2 inhibitor?" },
];
const PAGE_EXTRAS = ["How accurate is this lab?", "What is the applied AI in this lab?", "Should I stop taking my metformin?"] as const;

const NIM_LABEL = "AI model (NVIDIA NIM), figures checked against the simulator";
const NIM_NOTES_LABEL = "AI model (NVIDIA NIM), answering only from the lab's notes";
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
const NOTICE_CHIP = "border-foreground/30 text-muted-foreground";
const AI_CHIP = "border-[hsl(var(--primary))]/60 text-[hsl(217_91%_72%)]";

/** Who wrote a reply, in full. Shown inside the reasoning panel. */
const SOURCE: Record<AssistantReply["source"], SourceInfo> = {
    claude: { label: "Claude", note: "A language model wrote this, using simulator tools" },
    nim: { label: NIM_LABEL, note: "" },
    assistant: { label: "AI model, general knowledge", note: "Not checked by the simulator. Code removes any dose or drug effect it can't source" },
    verified: { label: "Written by code", note: "Code wrote this text, so it can't be misquoted" },
    reference: { label: "Reference note", note: "A note from the lab’s own library, written for this project. No simulation ran" },
    scope: { label: "Not a simulation", note: "This is a fixed message, and no model or simulation ran" },
    planner: { label: "Offline planner", note: "No language model: fixed rules ran the tools and filled in the numbers" },
    "intent-model": { label: "Small trained model", note: "No language model: it only chooses a fixed or computed reply, so it can't write a number or a claim" },
    refusal: { label: "Refusal", note: "Personal medical questions are refused" },
    emergency: { label: "Emergency", note: "This is a fixed message, and no model or simulation ran" },
    language: { label: "English only", note: "This is a fixed message, and no model or simulation ran" },
    unsupported: { label: "Not modelled", note: "This is a fixed message, and no model or simulation ran" },
};

/** The one short label that stays on screen. Null means the answer reads like any assistant's, with no badge. */
const chipFor = (reply: AssistantReply, inBrowser: boolean): { text: string; className: string } | null => {
    const ran = reply.tool_calls.some((c) => c.ok && c.tool !== "search_knowledge");
    switch (reply.source) {
        case "assistant": return null;
        case "nim":
        case "claude": return { text: ran ? "Simulator-checked" : (reply.sources?.length ?? 0) > 0 ? "From the lab's notes" : "AI model", className: AI_CHIP };
        case "planner": return { text: inBrowser ? "Offline planner, on this device" : "Offline planner", className: NOTICE_CHIP };
        case "refusal": return { text: "Refusal", className: "border-[hsl(var(--prov-extrapolated))] text-[hsl(var(--prov-extrapolated))]" };
        case "reference": return { text: "Lab note", className: NOTICE_CHIP };
        default: return { text: SOURCE[reply.source]?.label ?? "Offline planner", className: NOTICE_CHIP };
    }
};

const sourceFor = (reply: AssistantReply, inBrowser: boolean): SourceInfo => {
    if (reply.source === "nim" && (reply.sources?.length ?? 0) > 0) return { ...SOURCE.nim, label: NIM_NOTES_LABEL };
    if (inBrowser) return { label: BROWSER_PLANNER, note: "" };
    if (reply.source === "planner" && reply.sent_to_provider) return { label: "Offline planner, in place of the AI's reply", note: "" };
    return SOURCE[reply.source] ?? SOURCE.planner;
};

const SAVED_FILE = "assistant-starters.json";
const isStarterFile = (v: unknown) => Array.isArray(v);

const URGENT_LINE = /If this is urgent, call 112 now\. If you are thinking of harming yourself, call Tele-MANAS on 14416, free and open all day and night\.\s*/;

/** The helpline stays on every reply that needs it, set apart so the answer reads as an answer. */
const splitUrgentLine = (text: string) => {
    const match = text.match(URGENT_LINE);
    return match ? { answer: text.replace(URGENT_LINE, "").trim(), urgent: match[0].trim() } : { answer: text, urgent: null };
};

/** The copilot's mark: a lit orb that turns while it works. */
const AiAvatar = ({ working }: { working: boolean }) => (
    <span className={cn("ai-avatar grid h-7 w-7 shrink-0 place-items-center rounded-full", working && "ai-avatar-live")} aria-hidden="true">
        <Sparkles className="h-3.5 w-3.5 text-white" />
    </span>
);

const ReplyBody = ({ reply, provenance, onAsk, busy }: { reply: AssistantReply; provenance?: Provenance; onAsk: (text: string) => void; busy: boolean }) => {
    const [copied, setCopied] = useState(false);
    if (reply.source === "emergency") {
        return (
            <div role="alert" data-testid="assistant-emergency" className="rounded-md border-2 border-[hsl(var(--fail))] bg-[hsl(var(--fail))]/10 p-4">
                <p className="flex items-start gap-2.5 text-lg font-semibold leading-snug tracking-tight">
                    <Siren className="mt-1 h-5 w-5 shrink-0 text-[hsl(var(--fail))]" aria-hidden="true" />
                    <span className="whitespace-pre-wrap">{reply.text}</span>
                </p>
                <p className="mt-2 pl-[1.875rem] text-xs text-muted-foreground" data-testid="assistant-source">{SOURCE.emergency.label}. {SOURCE.emergency.note}.</p>
            </div>
        );
    }
    const { answer, urgent } = splitUrgentLine(reply.text);
    return (
        <div className="min-w-0" data-testid="assistant-reply">
            <div className="text-[0.938rem] leading-relaxed"><RichText text={answer} reveal /></div>
            <ResultCards cards={reply.cards ?? []} />
            {reply.guard_note && (
                <p data-testid="assistant-guard" className="mt-3 flex items-start gap-2 rounded-md border border-[hsl(var(--prov-extrapolated))]/50 bg-[hsl(var(--prov-extrapolated))]/10 p-2.5 text-xs leading-relaxed">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
                    {reply.guard_note}
                </p>
            )}
            {urgent && <p data-testid="assistant-urgent" className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{urgent}</p>}
            <div className="mt-2 flex items-center gap-3">
                <button
                    type="button"
                    data-testid="assistant-copy"
                    onClick={() => void navigator.clipboard?.writeText(answer).then(() => setCopied(true)).catch(() => undefined)}
                    className="inline-flex min-h-7 items-center gap-1 rounded text-[11px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                    {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                    {copied ? "Copied" : "Copy"}
                </button>
                {provenance === "saved" && <ProvenanceTag provenance={provenance} />}
            </div>
            {(reply.suggestions?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="assistant-suggestions" aria-label="Ask next">
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

/** One assistant message: who it is, what it did (folded), the answer, and the charts of what ran. */
const AssistantMessage = ({ turn, onAsk, onRetry, busy }: { turn: Turn; onAsk: (text: string) => void; onRetry: () => void; busy: boolean }) => {
    const reply = turn.reply;
    const working = !reply && !turn.error;
    // Only true when the question really stayed here. A fallback from the AI model has already been sent.
    const inBrowser = turn.provenance === "browser" && reply?.source === "planner" && !reply.sent_to_provider;
    const chip = reply ? chipFor(reply, inBrowser) : null;
    const source = reply ? sourceFor(reply, inBrowser) : undefined;
    return (
        <div className="flex gap-3">
            <AiAvatar working={working} />
            <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tracking-tight">MedBase AI</span>
                    {reply && reply.source !== "emergency" && (chip
                        ? <span data-testid="assistant-source" className={cn("rounded-full border px-2 py-px text-[10.5px] font-medium", chip.className)}>{chip.text}</span>
                        : <span data-testid="assistant-source" className="sr-only">{source?.label}</span>)}
                </div>
                <div className="mt-1">
                    {reply?.source !== "emergency" && <Reasoning turn={turn} source={source} inBrowser={inBrowser} />}
                    {reply && <ReplyBody reply={reply} provenance={turn.provenance} onAsk={onAsk} busy={busy} />}
                    {turn.error && <ErrorCallout error={turn.error} onRetry={onRetry} />}
                    {working && turn.steps.length === 0 && turn.deciding === null && <EngineWaitNote />}
                </div>
            </div>
        </div>
    );
};

type Variant = "panel" | "page";

const newTurn = (id: number, question: string): Turn => ({ id, question, startedAt: Date.now(), steps: [], deciding: null });

const StarterChips = ({ items, busy, onAsk }: { items: readonly string[]; busy: boolean; onAsk: (text: string) => void }) => (
    <ul className="flex flex-wrap gap-1.5" aria-label="Questions to try">
        {items.map((text) => (
            <li key={text}>
                <button type="button" disabled={busy} onClick={() => onAsk(text)} className="rounded-full border border-input px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50">
                    {text}
                </button>
            </li>
        ))}
    </ul>
);

/** The full-page greeting: what the copilot can really do, each card a real question. */
const EmptyState = ({ busy, onAsk }: { busy: boolean; onAsk: (text: string) => void }) => {
    const reduce = useReducedMotion();
    return (
        <div className="py-6 sm:py-10" data-testid="copilot-empty">
            <div className="flex flex-col items-center text-center">
                <span className="ai-avatar ai-avatar-hero grid h-14 w-14 place-items-center rounded-full" aria-hidden="true"><Sparkles className="h-6 w-6 text-white" /></span>
                <h1 className="text-balance mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">What should we test today?</h1>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                    I run simulated type 2 diabetes trials in virtual patients, plan studies and explain the science. Every figure I quote comes from the simulator, and checks outside the model stop personal medical advice.
                </p>
            </div>
            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2" aria-label="What the copilot can do">
                {CAPABILITIES.map((c, i) => (
                    <motion.li key={c.title} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 * i, ease: [0.23, 1, 0.32, 1] }}>
                        <button type="button" disabled={busy} onClick={() => onAsk(c.prompt)} className="capability-card group flex h-full w-full items-start gap-3 rounded-xl border border-border bg-card/60 p-3.5 text-left transition-[border-color,background-color,transform] duration-150 ease-out hover:border-[hsl(var(--primary))]/60 hover:bg-card active:scale-[0.99] disabled:opacity-50">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--primary))]/15 text-[hsl(217_91%_72%)]">{c.icon}</span>
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold">{c.title}</span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{c.prompt}</span>
                            </span>
                        </button>
                    </motion.li>
                ))}
            </ul>
            <div className="mt-4 flex justify-center"><StarterChips items={PAGE_EXTRAS} busy={busy} onAsk={onAsk} /></div>
        </div>
    );
};

/** The way into the lab: a question in, real experiments out, every number checked. */
export const AssistantPanel = ({ health, className, variant = "panel" }: { health: Health | null; className?: string; variant?: Variant }) => {
    const reduce = useReducedMotion();
    const { mode } = useTransport();
    const page = variant === "page";
    const [question, setQuestion] = useState("");
    const [turns, setTurns] = useState<Turn[]>([]);
    const [busy, setBusy] = useState(false);
    const nextId = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const usesModel = mode === "server" || (mode === "browser" && LLM_PROXY !== null);
    const lastQuestion = useRef<string | null>(null);
    const history = useRef<{ question: string; answer: string }[]>([]);
    const [hint, setHint] = useState(0);

    useEffect(() => {
        if (reduce || question) return;
        const timer = setInterval(() => setHint((i) => (i + 1) % PROMPT_HINTS.length), HINT_MS);
        return () => clearInterval(timer);
    }, [reduce, question]);

    // On the full page the newest message stays in view as it grows, the way chat assistants behave.
    const latest = turns[0];
    const progress = latest ? `${latest.id}:${latest.steps.length}:${latest.reply ? "r" : ""}${latest.error ? "e" : ""}` : "";
    useEffect(() => {
        if (!page || !progress) return;
        endRef.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
    }, [page, reduce, progress]);

    const update = (id: number, change: (turn: Turn) => Turn) => setTurns((all) => all.map((t) => (t.id === id ? change(t) : t)));
    const finish = (id: number, patch: Partial<Turn>) => update(id, (t) => ({ ...t, ...patch, finishedAt: Date.now() }));

    const newChat = () => {
        controller.current?.abort();
        setTurns([]);
        setBusy(false);
        lastQuestion.current = null;
        history.current = [];
    };

    /** Stops waiting for this answer. The engine finishes the request it started, but nothing is shown from it. */
    const stop = () => {
        const running = turns.find((t) => !t.reply && !t.error);
        controller.current?.abort();
        setBusy(false);
        if (running) finish(running.id, { error: new ApiError("server", "Stopped. Ask again whenever you like.") });
    };

    const ask = async (text: string, retryOf?: number) => {
        const trimmed = text.trim();
        if (!trimmed || busy) return;
        controller.current?.abort();
        const current = new AbortController();
        controller.current = current;
        const id = retryOf ?? ++nextId.current;
        const fresh = newTurn(id, trimmed);
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
            if (controller.current === current) setBusy(false);
        }
    };

    const log = turns.length > 0 && (
        <ol
            className={cn("copilot-log flex gap-6", page ? "flex-col" : "mt-4 max-h-[34rem] flex-col-reverse gap-5 overflow-y-auto pr-1")}
            aria-live="polite"
            tabIndex={0}
            aria-label="Conversation"
            data-testid="assistant-log"
        >
            {(page ? [...turns].reverse() : turns).map((turn) => (
                <motion.li key={turn.id} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }} className="min-w-0 shrink-0">
                    <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[hsl(var(--primary))]/15 px-3.5 py-2 text-sm"><span className="sr-only">You asked: </span>{turn.question}</p>
                    <div className="mt-3">
                        <AssistantMessage turn={turn} busy={busy} onAsk={(text) => void ask(text)} onRetry={() => void ask(turn.question, turn.id)} />
                    </div>
                </motion.li>
            ))}
        </ol>
    );

    const composer = (
        <form
            className={cn("copilot-composer relative rounded-2xl border border-input bg-background transition-[border-color,box-shadow] duration-150 focus-within:border-[hsl(var(--primary))]/70 focus-within:shadow-[0_0_0_3px_hsl(217_91%_60%/0.15)]", page ? "mt-0" : "mt-3")}
            onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
            }}
        >
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
                className="block w-full resize-none rounded-2xl bg-transparent py-3 pl-3.5 pr-14 text-sm placeholder:text-muted-foreground focus:outline-none"
            />
            {busy ? (
                <button type="button" onClick={stop} aria-label="Stop" data-testid="assistant-stop" className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition-transform duration-150 active:scale-95">
                    <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                </button>
            ) : (
                <button type="submit" disabled={!question.trim()} aria-label="Send question" className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--primary))] text-white transition-[opacity,transform] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
        </form>
    );

    const footnote = (
        <Disclosure summary="How this answers">
            <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                <p data-testid="assistant-mode">
                    {mode === "browser" && LLM_PROXY === null
                        ? "Answers come from the offline planner, on this device. There is no language model and nothing is sent anywhere."
                        : mode === "browser"
                          ? "An AI model plans, through a proxy that holds its key. The simulator runs on this device, and the offline planner answers if the AI service is unavailable."
                          : health ? `Answers come from ${health.assistant_mode === "claude" ? "Claude" : health.assistant_mode === "nim" ? "NVIDIA NIM" : "the offline planner, because no language model is configured"}${health.assistant_mode === "offline" ? "" : ", with the offline planner as fallback"}.` : "The assistant mode is not known, because the server has not answered."}
                </p>
                <p>Open &ldquo;Thought for&rdquo; above any answer to see what ran, which notes were found, which checks applied and whether the question left this device.</p>
                <p>General answers come from the AI model&rsquo;s own knowledge. They are not checked by the simulator and can be wrong. Code removes any dose or drug effect it can&rsquo;t source. Charts under an answer are drawn from the simulator&rsquo;s own output.</p>
                <p>It refuses questions about your own or someone else&rsquo;s treatment. Please talk to a doctor or pharmacist.</p>
            </div>
        </Disclosure>
    );

    const privacy = usesModel && (
        <p data-testid="assistant-privacy" className={cn("text-xs text-muted-foreground", page ? "mt-2 text-center" : "mt-2 font-medium text-foreground")}>
            Questions may be sent to an AI provider. Don&rsquo;t enter personal or health details.
        </p>
    );

    if (page) {
        return (
            <section aria-label="AI copilot" data-testid="assistant-panel" data-busy={busy} className={cn("flex min-h-[calc(100dvh-4rem)] flex-col", className)}>
                <div className="flex-1">
                    {turns.length === 0 ? <EmptyState busy={busy} onAsk={(text) => void ask(text)} /> : <div className="pb-6 pt-6">{log}</div>}
                    <div ref={endRef} />
                </div>
                <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-background via-background to-background/0 px-4 pb-4 pt-6 sm:-mx-6 sm:px-6">
                    {composer}
                    <div className="mt-2 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">{privacy}</div>
                        {turns.length > 0 && (
                            <button type="button" onClick={newChat} data-testid="assistant-new-chat" className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground">
                                <RotateCcw className="h-3 w-3" aria-hidden="true" />New chat
                            </button>
                        )}
                    </div>
                    <div className="mt-1">{footnote}</div>
                </div>
            </section>
        );
    }

    return (
        <section aria-labelledby="copilot-heading" data-testid="assistant-panel" data-busy={busy} className={cn("copilot-shell rounded-lg border border-foreground/25 bg-card/70 p-4 shadow-[0_24px_60px_-40px_hsl(217_91%_60%/0.6)] sm:p-5", busy && "copilot-live", className)}>
            <div className="flex flex-wrap items-center gap-2">
                <AiAvatar working={busy} />
                <h2 id="copilot-heading" className="text-base font-semibold tracking-tight">Ask the AI copilot</h2>
                <Link to="/copilot" data-testid="copilot-fullscreen" className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground">
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />Full screen
                </Link>
            </div>
            <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                {usesModel
                    ? "Ask it anything, the way you would any AI assistant. It explains ideas, follows the conversation, and runs real simulations when you ask about a drug’s effect. Checks outside the model block medical advice and any drug figure no tool produced."
                    : "It runs the simulator's tools and reports what they return. A check outside any language model blocks a number no tool produced."}
            </p>
            {privacy}
            {log}
            {composer}
            {turns.length > 0 && (
                <div className="mt-2 flex justify-end">
                    <button type="button" onClick={newChat} data-testid="assistant-new-chat" className="inline-flex min-h-8 items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />New chat
                    </button>
                </div>
            )}
            {turns.length === 0
                ? <div className="mt-2.5"><StarterChips items={STARTERS} busy={busy} onAsk={(text) => void ask(text)} /></div>
                : <div className="mt-2"><Disclosure summary="More questions to try"><StarterChips items={STARTERS} busy={busy} onAsk={(text) => void ask(text)} /></Disclosure></div>}
            <div className="mt-3">{footnote}</div>
        </section>
    );
};
