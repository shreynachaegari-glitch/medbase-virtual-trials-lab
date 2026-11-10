import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronRight, LoaderCircle, X } from "lucide-react";
import { useElapsed } from "@/hooks/useSimRun";
import { describeToolArgs } from "@/lib/trials/format";
import type { AssistantReply } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { TOOL_NAMES, TOOL_RUNNING, type Turn } from "./turn";

const EASE = [0.23, 1, 0.32, 1] as const;
const FIXED_SOURCES = new Set<AssistantReply["source"]>(["refusal", "scope", "language", "unsupported", "intent-model"]);
const RETRIEVAL_LABEL: Record<string, string> = {
    pgvector: "Vector database: pgvector, running in your browser",
    neural: "Notes found by meaning, with neural embeddings",
    keyword: "Notes found by wording, with keyword vectors",
};
const VECTOR_QUERY = "SELECT title, 1 - (embedding <=> $1) AS score FROM notes ORDER BY embedding <=> $1";

export interface SourceInfo {
    label: string;
    note: string;
}

const Elapsed = ({ since }: { since: number }) => {
    const seconds = useElapsed(since);
    return <span className="tnum text-muted-foreground" aria-hidden="true">{seconds} s</span>;
};

/** What the AI is doing right now, in the words a person would use. */
const activity = (turn: Turn): string => {
    const running = turn.steps.find((s) => s.status === "running");
    if (running) return TOOL_RUNNING[running.name] ?? running.name;
    if (turn.deciding !== null) return turn.steps.length === 0 ? "Planning its experiments" : "Reading the results";
    return "Thinking";
};

const seconds = (turn: Turn): string => (((turn.finishedAt ?? Date.now()) - turn.startedAt) / 1000).toFixed(1);

/** A one-line account of the finished turn, built only from what really happened. */
const summary = (turn: Turn, reply: AssistantReply): string => {
    if (FIXED_SOURCES.has(reply.source)) return `Checked in ${seconds(turn)} s`;
    const ran = reply.tool_calls.filter((c) => c.ok && c.tool !== "search_knowledge").length;
    const notes = reply.sources?.length ?? 0;
    const parts = [`Thought for ${seconds(turn)} s`];
    if (ran > 0) parts.push(`${ran} experiment${ran === 1 ? "" : "s"}`);
    if (notes > 0) parts.push(`${notes} note${notes === 1 ? "" : "s"}`);
    if (reply.guard_note) parts.push("a check stepped in");
    return parts.join(" · ");
};

const LiveSteps = ({ turn }: { turn: Turn }) => {
    const reduce = useReducedMotion();
    const working = !turn.reply && !turn.error;
    if (turn.steps.length === 0 && turn.deciding === null) return null;
    return (
        <ol className="space-y-1.5" data-testid="copilot-steps" aria-label="What the AI did">
            {turn.steps.map((step) => {
                const args = describeToolArgs(step.name, step.args);
                return (
                    <motion.li key={step.index} data-testid="copilot-step" data-status={step.status} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, ease: EASE }} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 shrink-0">
                            {step.status === "running" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[hsl(var(--primary))] motion-reduce:animate-none" aria-hidden="true" />
                                : step.status === "ok" ? <Check className="h-3.5 w-3.5 text-[hsl(var(--pass))]" aria-hidden="true" />
                                : <X className="h-3.5 w-3.5 text-[hsl(var(--fail))]" aria-hidden="true" />}
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
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[hsl(var(--primary))] motion-reduce:animate-none" aria-hidden="true" />
                    {turn.steps.length === 0 ? "The AI is planning its experiments" : "The AI is reading the results and deciding what next"}
                </li>
            )}
        </ol>
    );
};

/** Each stage the question really went through, as a timeline. Nothing here plays unless it happened. */
const Trace = ({ steps }: { steps: NonNullable<AssistantReply["trace"]> }) => (
    <ol className="reasoning-timeline space-y-2" aria-label="What happened to this question" data-testid="assistant-trace">
        {steps.map((step) => (
            <li key={step.stage} className="relative pl-4 text-xs leading-relaxed">
                <span className="absolute left-0 top-[0.45rem] h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
                <span className="font-medium">{step.stage}</span>
                <span className="text-muted-foreground">: {step.detail}</span>
            </li>
        ))}
    </ol>
);

const Sources = ({ reply }: { reply: AssistantReply }) => {
    const reduce = useReducedMotion();
    const sources = reply.sources ?? [];
    return (
        <div data-testid="assistant-sources">
            <p className="label-caps">{RETRIEVAL_LABEL[reply.retrieval ?? "keyword"]}{typeof reply.query_ms === "number" && <span className="tnum"> &middot; {reply.query_ms.toFixed(1)} ms</span>}</p>
            {reply.retrieval === "pgvector" && <code data-testid="vector-query" className="mt-1 block overflow-x-auto whitespace-nowrap font-mono text-[10px] text-muted-foreground">{VECTOR_QUERY}</code>}
            <ul className="mt-1.5 space-y-1">
                {sources.map((source) => (
                    <li key={source.title} className="grid grid-cols-[minmax(0,1fr)_4.5rem_2.25rem] items-center gap-2 text-xs">
                        <span className="truncate">{source.title}</span>
                        <span className="block h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
                            <motion.span className="block h-full origin-left rounded-full bg-[hsl(var(--primary))]" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: source.score }} transition={{ duration: 0.6, ease: EASE }} />
                        </span>
                        <span className="tnum text-right text-muted-foreground">{source.score.toFixed(2)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const FinishedDetail = ({ turn, reply, source, inBrowser }: { turn: Turn; reply: AssistantReply; source: SourceInfo; inBrowser: boolean }) => {
    const toolsRun = reply.tool_calls.filter((call) => call.tool !== "search_knowledge");
    const showTools = turn.steps.length === 0 || reply.source === "planner";
    return (
        <>
            {reply.interpreted_as && <p data-testid="assistant-interpreted" className="text-xs text-muted-foreground">Understood as: <span className="text-foreground">{reply.interpreted_as}</span></p>}
            {reply.trace && reply.trace.length > 0 && <Trace steps={reply.trace} />}
            {(reply.sources?.length ?? 0) > 0 && <Sources reply={reply} />}
            {showTools && toolsRun.length > 0 && (
                <div>
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
            {showTools && toolsRun.length === 0 && !["refusal", "assistant", "intent-model"].includes(reply.source) && (reply.sources?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground">No tools ran for this reply, so it contains no simulator results.</p>
            )}
            <p className="text-xs text-muted-foreground" data-testid="assistant-writer">
                Written by: <span className="text-foreground">{source.label}</span>{source.note && <>. {source.note}</>}.
            </p>
            {!inBrowser && (
                <p className="text-xs text-muted-foreground" data-testid="assistant-sent">
                    {reply.sent_to_provider ? "This question was sent to an AI provider." : "This question was not sent to an AI provider."}
                </p>
            )}
        </>
    );
};

type ReasoningProps = { turn: Turn; source?: SourceInfo; inBrowser?: boolean };

/**
 * The AI's working, the way assistants show it: open while it works, folded to one line once it answers.
 * Everything that says where the answer came from lives here, so the answer itself reads cleanly.
 */
export const Reasoning = ({ turn, source, inBrowser = false }: ReasoningProps) => {
    const bodyId = useId();
    const [chosen, setChosen] = useState<boolean | null>(null);
    const working = !turn.reply && !turn.error;
    const open = chosen ?? working;
    const label = turn.reply ? summary(turn, turn.reply) : turn.error ? `Stopped after ${seconds(turn)} s` : activity(turn);
    return (
        <div className="reasoning mb-2.5" data-testid="assistant-reasoning" data-open={open}>
            <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setChosen(!open)} className="group inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground">
                <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out", open && "rotate-90")} aria-hidden="true" />
                <span className={cn("truncate", working && "shimmer-text font-medium")} data-testid="reasoning-label" role={working ? "status" : undefined}>{label}</span>
                {working && <Elapsed since={turn.startedAt} />}
            </button>
            <div id={bodyId} className={cn("grid transition-[grid-template-rows,visibility] duration-300 ease-out motion-reduce:transition-none", open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]")} inert={!open}>
                <div className="min-h-0 overflow-hidden">
                    <div className="ml-[0.4rem] mt-1.5 space-y-3 border-l border-border pb-1 pl-4">
                        <LiveSteps turn={turn} />
                        {turn.reply && source && <FinishedDetail turn={turn} reply={turn.reply} source={source} inBrowser={inBrowser} />}
                        {working && turn.steps.length === 0 && turn.deciding === null && <p className="text-xs text-muted-foreground">Checking the question, then choosing what to run.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};
