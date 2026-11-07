/** Response shapes from ../medlab/api.py. Keep in step with web/SNAPSHOTS.md. */

/** Where an answer came from: a server, the simulator on this device, or a saved file. */
export type Provenance = "live" | "browser" | "saved";

export interface Loaded<T> {
    data: T;
    provenance: Provenance;
}

export interface Health {
    ok: boolean;
    engine?: "browser";
    calibrated: boolean;
    validated: boolean;
    assistant_mode: "claude" | "nim" | "offline";
}

export interface ValidationScore {
    n_contrasts: number;
    mae: number;
    bias: number;
    within_0_30: number;
    coverage_95pi: number;
    coverage_80pi: number;
    coverage_50pi: number;
    interval_score_95: number;
    mean_pi95_width: number;
    V3_pass: boolean;
    V4_pass: boolean;
    V5_pass: boolean;
    V5_order_correct: boolean;
    V5_each_within: boolean;
    null_mae: number;
    model_minus_null_mae: number;
    model_minus_null_ci95: [number, number];
    /** Check V6: the whole 95% interval for model minus rival mean error lies below zero. */
    beats_null: boolean;
}

/** The pre-registered marks, read from the report so the page can never disagree with the test. */
export interface PassMarks {
    mae_max: number;
    within_0_30_min: number;
    coverage_95_min: number;
    renal_tolerance: number;
}

/** Attached to every simulated result, so a result cannot be separated from its checks. */
export type ValidationStatus =
    | { available: false; note: string }
    | ({ available: true; blind: boolean } & ValidationScore);

export interface ContrastRow {
    trial: string;
    arm: string;
    reference: string;
    group: string;
    predicted: number;
    predicted_sd_model: number;
    pi95: [number, number];
    observed: number;
    observed_se: number;
    error: number;
    covered: boolean;
    within_0_30: boolean;
    null_predicted: number;
    null_error: number;
    thin_pool: boolean;
}

export interface Enrolment {
    eligible_real_participants: number;
    effective_sample_size: number;
    thin_pool: boolean;
    matched: Record<string, number>;
    targets: Record<string, number | null>;
}

export interface ByTrial {
    contrasts: number;
    mae: number;
    null_mae: number;
    thin_pool: boolean;
}

export interface ValidationReport {
    blind: boolean;
    openings: number;
    posterior_sha256: string;
    code_hash: string;
    frozen_at: string;
    converged: boolean | null;
    max_split_rhat: number | null;
    length_over_tau: number | null;
    pass_marks: PassMarks;
    score: ValidationScore;
    by_trial: Record<string, ByTrial>;
    contrasts: ContrastRow[];
    populations: Record<string, Enrolment>;
    assumption_sensitivity: Record<string, { largest_shift: number }>;
    renal_precheck: { model_ratio_mild: number; model_ratio_moderate: number; reference: string };
    structural_sd: number;
    n_draws: number;
    prediction_n: number;
    reading_note: string;
}

/** GET /api/calibration, or the same keys read from the bundled posterior. */
export interface CalibrationStatus {
    converged: boolean | null;
    max_split_rhat: number | null;
    length_over_tau: number | null;
}

export interface Parameter {
    name: string;
    value: number;
    unit: string;
    kind: "published" | "calibrated" | "assumed";
    source: string;
    prior_sd: number | null;
}

export interface ParametersResponse {
    parameters: Parameter[];
}

export interface Drug {
    drug: string;
    min_mg: number;
    max_mg: number;
    unit: string;
}

export interface DrugsResponse {
    drugs: Drug[];
    candidate_mechanisms: string[];
}

export type ArmKind = "control" | "real drug" | "hypothetical";

/** Warnings that travel with every simulated result, so they cannot be separated from it. */
export interface ResultCaveats {
    label_flags: string[];
    validation_scope: string[];
    not_modelled: string[];
    arm_kinds: Record<string, ArmKind>;
}

export interface EndpointContrast {
    effect: number;
    interval95: [number, number];
    typical_trial_se: number;
    probability_significant_benefit: number;
}

export interface OrganSignals {
    liver_glucose_output_change_pct: number;
    insulin_secretion_capacity_change_pct: number;
    urinary_glucose_change_g_day: number;
    fasting_glucose_change_mg_dl: number;
    weight_change_kg: number;
}

export interface ArmResult {
    a1c_by_week: number[];
    a1c_low: number[];
    a1c_high: number[];
    share_below_7: number;
    urinary_glucose_g_day: number;
    /** Change over the run, as simulated for this arm. Older saved runs don't have it. */
    organ_signals?: OrganSignals;
}

export interface TrialResponse extends ResultCaveats {
    control: string;
    weeks: number;
    n_per_arm: number;
    contrasts: Record<string, Record<string, EndpointContrast>>;
    arms: Record<string, ArmResult>;
    enrolment: Enrolment;
    uncertainty: { posterior_draws: number; replicates_per_draw: number };
    validation: ValidationStatus;
    /** The blind-test record per active arm, looked up after the result. It does not change the result. */
    track_record?: Record<string, TrackRecord>;
    notice: string;
}

export interface TrackRecordTrial {
    trial: string;
    weeks: number;
    results: number;
    mae: number;
    mean_error: number;
    held_up: boolean;
}

export interface TrackRecord {
    available: boolean;
    sentence: string;
    note?: string;
    drug?: string;
    closest?: TrackRecordTrial;
    by_trial?: TrackRecordTrial[];
}

export interface PowerResponse extends ResultCaveats {
    arm: string;
    control: string;
    endpoint: string;
    curve: { n_per_arm: number; power: number }[];
    smallest_size_reaching_80pct: number | null;
    enrolment: Enrolment;
    validation: ValidationStatus;
    notice: string;
}

export interface RespondersResponse extends ResultCaveats {
    arm: string;
    control: string;
    endpoint: string;
    mean_individual_effect: number;
    spread_sd: number;
    drivers: { feature: string; importance: number }[];
    subgroups: { rule: string; patients: number; mean_effect: number }[];
    fit_r2: number;
    enrolment: Enrolment;
    validation: ValidationStatus;
    notice: string;
}

export interface LabelWarning {
    term: string;
    kind: string;
    text: string;
}

export interface SafetyEvent {
    term: string;
    serious: boolean;
    affected: number;
    at_risk: number;
    percent: number;
    assessment: string | null;
}

export interface SafetyArm {
    arm: string;
    role: "drug" | "placebo" | "comparator";
    participants: number | null;
    serious_affected: number | null;
    events: SafetyEvent[];
}

export interface SafetyResponse {
    drug: string;
    trial: string;
    kind: string;
    label_warnings: LabelWarning[];
    label_source: string;
    arms: SafetyArm[];
    has_placebo_arm: boolean;
    notice: string;
}

export interface AssistantReply {
    text: string;
    source: "claude" | "nim" | "verified" | "reference" | "scope" | "planner" | "intent-model" | "refusal" | "emergency" | "language" | "unsupported";
    tool_calls: { tool: string; ok: boolean }[];
    guard_note: string | null;
    sent_to_provider: boolean;
    /** The full question, when this one was a follow-up such as "what about 2 mg?". */
    interpreted_as?: string | null;
    /** The notes vector search found, best first. */
    sources?: { title: string; score: number }[];
    /** How the notes were found: by meaning with neural embeddings, or by wording with keyword vectors. */
    retrieval?: "neural" | "keyword" | null;
    /** What really happened to this question, step by step. */
    trace?: { stage: string; detail: string }[];
    /** Next questions the copilot can really do. */
    suggestions?: string[];
}

export interface DoseResult {
    mg: number;
    effect: number;
    interval95: [number, number];
}

export interface PowerStepResult {
    curve: { n_per_arm: number; power: number }[];
}

export interface DesignStep {
    step: number;
    action: string;
    result: DoseResult | PowerStepResult;
    finding: string;
}

export interface SimulatedDesign {
    drug: string;
    dose_mg: number;
    unit: string;
    n_per_arm: number;
    power: number;
    weeks: number;
    expected_effect: number;
    effect_interval95: [number, number];
}

export interface SurrogateGuide {
    used: boolean;
    reachable?: boolean;
    proposed_mg?: number;
    predicted_effect?: number;
    screened?: number;
    milliseconds?: number;
    test_mae_vs_simulator?: number;
    test_r2_vs_simulator?: number;
}

export interface DesignResponse {
    goal: { drug: string; target_effect: number; weeks: number; background: string; target_power: number };
    steps: DesignStep[];
    simulated_design: SimulatedDesign | null;
    reason: string;
    surrogate?: SurrogateGuide;
    simulator_runs?: number;
    track_record?: TrackRecord;
    dose_evidence?: { tested: boolean; sentence: string } | null;
    label_flags?: string[];
    validation_scope?: string[];
    validation: ValidationStatus;
    not_modelled: string[];
    notice: string;
}

export interface ProgressionScenario {
    id: string;
    title: string;
    description: string;
    evidence_class: string;
}

export interface ProgressionReference {
    authors: string;
    title: string;
    journal: string;
    year: number;
    volume: string;
    pages: string;
    doi: string;
    pmid: string;
}

export interface ProgressionScenariosResponse {
    scenarios: ProgressionScenario[];
    model: string;
    reference: ProgressionReference;
}

export interface ProgressionRow {
    day: number;
    glucose_mg_dl: number;
    beta_cell_state: number;
    insulin_sensitivity: number;
}

export interface ProgressionRun {
    reference: ProgressionReference;
    config: { horizon_days: number; intervention_day: number; target_si_after: number };
    summary: {
        initial_glucose_mg_dl: number;
        glucose_at_intervention_mg_dl: number;
        final_glucose_mg_dl: number;
        max_glucose_mg_dl: number;
        final_insulin_sensitivity: number;
        final_beta_cell_state: number;
        horizon_days: number;
    };
    trajectory: ProgressionRow[];
    events: { crossed_threshold_day: number | null; returned_below_day: number | null };
    limitations: string[];
    state_unit_notes?: Record<string, string>;
}
