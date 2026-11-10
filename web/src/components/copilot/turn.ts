import type { ApiError } from "@/lib/trials/api";
import type { EngineEvent } from "@/lib/trials/transport";
import type { AssistantReply, Provenance } from "@/lib/trials/types";

export interface LiveStep {
    index: number;
    name: string;
    args: string;
    status: "running" | "ok" | "failed";
    startedAt: number;
}

export interface Turn {
    id: number;
    question: string;
    startedAt: number;
    /** When the reply or error arrived, so the page can say how long the AI took. */
    finishedAt?: number;
    /** What the AI did, recorded as it happened. */
    steps: LiveStep[];
    deciding: number | null;
    reply?: AssistantReply;
    provenance?: Provenance;
    error?: ApiError;
}

export const TOOL_NAMES: Record<string, string> = {
    run_virtual_trial: "Ran a virtual trial",
    power_analysis: "Estimated power",
    who_responds: "Ran who-responds",
    drug_safety: "Read reported side effects",
    validation_report: "Read the validation report",
    model_assumptions: "Read the model's parameters",
    search_registry: "Searched ClinicalTrials.gov",
    search_literature: "Searched PubMed",
    design_study: "Designed a study",
    simulate_progression: "Ran the disease progression model",
    lab_status: "Read the lab's status",
};

export const TOOL_RUNNING: Record<string, string> = {
    run_virtual_trial: "Running a virtual trial",
    power_analysis: "Estimating power",
    who_responds: "Running who-responds",
    drug_safety: "Reading reported side effects",
    validation_report: "Reading the validation report",
    model_assumptions: "Reading the model's parameters",
    search_registry: "Searching ClinicalTrials.gov",
    search_literature: "Searching PubMed",
    design_study: "Designing a study",
    simulate_progression: "Running the disease progression model",
    lab_status: "Reading the lab's status",
};

export const applyEvent = (turn: Turn, event: EngineEvent): Turn => {
    if (event.kind === "thinking") return { ...turn, deciding: event.turn };
    const existing = turn.steps.find((s) => s.index === event.index);
    if (existing) return { ...turn, steps: turn.steps.map((s) => (s.index === event.index ? { ...s, status: event.status } : s)) };
    return { ...turn, steps: [...turn.steps, { index: event.index, name: event.name, args: event.args, status: event.status, startedAt: Date.now() }] };
};
