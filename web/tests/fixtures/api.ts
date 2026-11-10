/**
 * DEV ONLY. INVENTED VALUES FOR UI TESTS. These are not results from any model or trial.
 * They exist only to intercept /api in Playwright. They are outside src/, so they cannot reach the
 * production bundle, and a test checks the built bundle for the marker below.
 */
import type {
    AssistantReply,
    DesignResponse,
    DrugsResponse,
    Health,
    ParametersResponse,
    PowerResponse,
    ProgressionRun,
    ProgressionScenariosResponse,
    RespondersResponse,
    ResultCaveats,
    SafetyResponse,
    TrialResponse,
    ValidationReport,
    OrganSignals,
    ValidationStatus,
} from "../../src/lib/trials/types";

export const FIXTURE_MARKER = "DEV_FIXTURE_NOT_A_RESULT";

const NOT_MODELLED = [
    "FIXTURE copy of: Hypoglycaemia is not modelled. Risk rises with sulfonylureas or insulin.",
    "FIXTURE: Serious adverse events are not simulated.",
];

const row = (trial: string, arm: string, reference: string, predicted: number, observed: number, group = "efficacy") => {
    const error = Number((predicted - observed).toFixed(3));
    return {
        trial, arm, reference, group, predicted, predicted_sd_model: 0.1,
        pi95: [Number((predicted - 0.45).toFixed(3)), Number((predicted + 0.45).toFixed(3))] as [number, number],
        observed, observed_se: 0.12, error,
        covered: Math.abs(error) <= 0.45,
        within_0_30: Math.abs(error) <= 0.3,
        sd: 0.23,
        null_predicted: Number((observed + 0.4).toFixed(3)),
        null_error: 0.4,
        thin_pool: group === "renal",
    };
};

const score = {
    n_contrasts: 6, mae: 0.31, bias: -0.05, within_0_30: 0.667,
    coverage_95pi: 0.9, coverage_80pi: 0.7, coverage_50pi: 0.4, interval_score_95: 1.1, mean_pi95_width: 0.9,
    // V3 fails on purpose: the page must show a failure as loudly as a pass.
    V3_pass: false, V4_pass: true, V5_pass: true, V5_order_correct: true, V5_each_within: true,
    null_mae: 0.4, model_minus_null_mae: -0.09, model_minus_null_ci95: [-0.2, -0.01] as [number, number], beats_null: true,
};

export const validation: ValidationReport = {
    blind: true,
    openings: 1,
    posterior_sha256: "abc123def4567890abc123def4567890",
    code_hash: "fixture",
    frozen_at: "fixture",
    converged: true,
    max_split_rhat: 1.02,
    length_over_tau: 61.5,
    pass_marks: { mae_max: 0.25, within_0_30_min: 0.7, coverage_95_min: 0.85, renal_tolerance: 0.3 },
    score,
    by_trial: {
        "Fixture trial A": { contrasts: 2, mae: 0.37, null_mae: 0.41, thin_pool: false },
        "Fixture RENAL moderate": { contrasts: 1, mae: 0.03, null_mae: 0.4, thin_pool: true },
    },
    contrasts: [
        row("Fixture trial A", "Fixture drug 1 mg", "Placebo", -1.2, -1.15),
        row("Fixture trial A", "Fixture drug 2 mg", "Placebo", -1.5, -0.8),
        row("Fixture trial B", "Fixture drug 3 mg", "Placebo", -0.7, -0.62),
        row("Fixture trial C", "Fixture drug 4 mg", "Placebo", -0.3, -0.95),
        row("Fixture RENAL mild", "Empa 25mg", "Placebo", -0.65, -0.6, "renal"),
        row("Fixture RENAL moderate", "Empa 25mg", "Placebo", -0.4, -0.37, "renal"),
    ],
    populations: {},
    assumption_sensitivity: { "rtg0=200": { largest_shift: 0.08 }, "sita_ed50=50": { largest_shift: 0.12 } },
    renal_precheck: { model_ratio_mild: 0.8, model_ratio_moderate: 0.6, reference: "FIXTURE reference for the kidney comparison." },
    structural_sd: 0.15,
    n_draws: 120,
    prediction_n: 300,
    reading_note: "FIXTURE reading note: V5's ordering is largely built into the structure.",
};

export const calibration = { summary: {}, steps: 3000, walkers: 44, burn: 1000, acceptance: 0.25, converged: true, max_split_rhat: 1.02, length_over_tau: 61.5 };

const trialStatus: ValidationStatus = { available: true, blind: true, ...score };

export const health: Health = { ok: true, calibrated: true, validated: true, assistant_mode: "offline" };

export const drugs: DrugsResponse = {
    drugs: [
        { drug: "semaglutide", min_mg: 0.1, max_mg: 2.0, unit: "mg/week" },
        { drug: "empagliflozin", min_mg: 1.0, max_mg: 25.0, unit: "mg/day" },
        { drug: "sitagliptin", min_mg: 12.5, max_mg: 100.0, unit: "mg/day" },
        { drug: "metformin", min_mg: 250.0, max_mg: 2550.0, unit: "mg/day" },
    ],
    candidate_mechanisms: ["hgp", "secretion", "sensitizer", "renal"],
};

export const parameters: ParametersResponse = {
    parameters: [
        { name: "fixture_published", value: 1.44, unit: "1/day", kind: "published", source: "Fixture citation, not real", prior_sd: null },
        { name: "fixture_calibrated", value: 45, unit: "days", kind: "calibrated", source: "Fixture fit, not real", prior_sd: 0.25 },
        { name: "fixture_assumed", value: 240, unit: "mg/dL", kind: "assumed", source: "Fixture assumption, not real", prior_sd: null },
    ],
};

const curve = (start: number, end: number, weeks: number) =>
    Array.from({ length: weeks + 1 }, (_, i) => Number((start + (end - start) * (1 - Math.exp(-i / 8))).toFixed(3)));

const armOf = (end: number, weeks: number, uge: number, below7: number, organ: Partial<OrganSignals> = {}) => {
    const values = curve(8.1, end, weeks);
    return {
        a1c_by_week: values,
        a1c_low: values.map((v) => Number((v - 0.12).toFixed(3))),
        a1c_high: values.map((v) => Number((v + 0.12).toFixed(3))),
        share_below_7: below7,
        urinary_glucose_g_day: uge,
        organ_signals: {
            liver_glucose_output_change_pct: -2,
            insulin_secretion_capacity_change_pct: -1,
            urinary_glucose_change_g_day: 0.5,
            fasting_glucose_change_mg_dl: -3,
            weight_change_kg: -0.4,
            ...organ,
        },
    };
};

const contrastOf = (a1c: number): TrialResponse["contrasts"][string] => ({
    hba1c: { effect: a1c, interval95: [Number((a1c - 0.25).toFixed(3)), Number((a1c + 0.25).toFixed(3))], typical_trial_se: 0.1, probability_significant_benefit: 0.92 },
    fpg: { effect: a1c * 22, interval95: [a1c * 22 - 6, a1c * 22 + 6], typical_trial_se: 3, probability_significant_benefit: 0.88 },
    weight: { effect: a1c * 2, interval95: [a1c * 2 - 0.7, a1c * 2 + 0.7], typical_trial_se: 0.3, probability_significant_benefit: 0.71 },
});

const enrolmentOf = (eligible: number, ess: number) => ({
    eligible_real_participants: eligible,
    effective_sample_size: ess,
    thin_pool: eligible < 40,
    matched: { a1c: 8.1, fpg: 168.2, weight: 91.4, age: 58.3, egfr: 84.1 },
    targets: { a1c: null, fpg: null, weight: null, age: null },
});

const NOTICE = "FIXTURE notice. Research simulation. Not medical advice and not evidence that a treatment works in any person.";

export interface TrialRequestBody {
    arms: ({ drug?: string; mg?: number; candidate?: { name: string; mg_per_day: number } })[];
    weeks: number;
    n_per_arm: number;
    egfr_min: number;
    egfr_max: number;
}

const armName = (arm: TrialRequestBody["arms"][number]) => {
    if (arm.candidate) return `${arm.candidate.name} ${arm.candidate.mg_per_day} mg/day (hypothetical)`;
    const name = `${arm.drug!.charAt(0).toUpperCase()}${arm.drug!.slice(1)}`;
    return `${name} ${arm.mg} ${arm.drug === "semaglutide" ? "mg/week" : "mg/day"}`;
};

/** Effect shrinks in the low eGFR range and the pool is thin there, as the real pool is. */
export const caveatsFor = (body: Pick<TrialRequestBody, "arms" | "egfr_min">, names: string[]): ResultCaveats => ({
    label_flags: body.egfr_min < 45 && body.arms.some((a) => a.drug === "sitagliptin") ? ["FIXTURE flag: Sitagliptin label says the dose is reduced in part of this eGFR range."] : [],
    validation_scope: names.some((n) => /hypothetical/.test(n)) ? ["FIXTURE scope: A hypothetical molecule has no real data. Validation does not apply to it."] : [],
    not_modelled: NOT_MODELLED,
    arm_kinds: { Placebo: "control", ...Object.fromEntries(names.map((n) => [n, /hypothetical/.test(n) ? "hypothetical" : "real drug"] as const)) },
});

export const trialFor = (body: TrialRequestBody): TrialResponse => {
    const low = body.egfr_max <= 60;
    const names = body.arms.map(armName);
    const effects = names.map((_, i) => (low ? -0.3 : -0.9) - i * 0.25);
    return {
        control: "Placebo",
        weeks: body.weeks,
        n_per_arm: body.n_per_arm,
        contrasts: Object.fromEntries(names.map((n, i) => [n, contrastOf(effects[i])])),
        arms: {
            Placebo: armOf(8.0, body.weeks, 10.9, 0.08),
            // Fixture signals differ by arm on purpose, so a test can tell which arm is on screen.
            ...Object.fromEntries(names.map((n, i) => [n, armOf(8.0 + effects[i], body.weeks, 12 + i * 30, 0.4 + i * 0.1, i === 0
                ? { liver_glucose_output_change_pct: -12.5, insulin_secretion_capacity_change_pct: 18, urinary_glucose_change_g_day: 1, fasting_glucose_change_mg_dl: -30, weight_change_kg: -4 }
                : { liver_glucose_output_change_pct: -5, insulin_secretion_capacity_change_pct: 2, urinary_glucose_change_g_day: 60, fasting_glucose_change_mg_dl: -20, weight_change_kg: -2 })])),
        },
        enrolment: low ? enrolmentOf(17, 9.4) : enrolmentOf(195, 72.3),
        uncertainty: { posterior_draws: 16, replicates_per_draw: 40 },
        validation: trialStatus,
        ...caveatsFor(body, names),
        notice: NOTICE,
    };
};

export const powerFor = (body: TrialRequestBody): PowerResponse => ({
    arm: armName(body.arms[0]),
    control: "Placebo",
    endpoint: "hba1c",
    curve: [
        { n_per_arm: 25, power: 0.34 }, { n_per_arm: 50, power: 0.56 }, { n_per_arm: 100, power: 0.78 },
        { n_per_arm: 200, power: 0.93 }, { n_per_arm: 400, power: 0.99 }, { n_per_arm: 500, power: 1 },
    ],
    smallest_size_reaching_80pct: 200,
    enrolment: enrolmentOf(195, 72.3),
    validation: trialStatus,
    ...caveatsFor(body, [armName(body.arms[0])]),
    notice: "FIXTURE notice. Planning aid only. Real trials need a biostatistician and a real effect estimate.",
});

export const respondersFor = (body: TrialRequestBody): RespondersResponse => ({
    arm: armName(body.arms[0]),
    control: "Placebo",
    endpoint: "hba1c",
    mean_individual_effect: -0.986,
    spread_sd: 0.33,
    drivers: [
        { feature: "baseline fasting glucose", importance: 0.885 },
        { feature: "weight", importance: 0.067 },
        { feature: "baseline HbA1c", importance: 0.048 },
    ],
    subgroups: [
        { rule: "baseline fasting glucose <= 259.2 and baseline fasting glucose > 177.1 and weight <= 103.6", patients: 197, mean_effect: -1.239 },
        { rule: "baseline fasting glucose <= 259.2 and baseline fasting glucose <= 177.1", patients: 314, mean_effect: -0.883 },
        { rule: "baseline fasting glucose > 259.2", patients: 41, mean_effect: -0.311 },
    ],
    fit_r2: 0.529,
    enrolment: enrolmentOf(195, 72.3),
    validation: trialStatus,
    ...caveatsFor(body, [armName(body.arms[0])]),
    notice: "FIXTURE notice. Hypothesis only. This describes the simulator's structure, so it cannot discover biology the model does not contain.",
});

const eventOf = (term: string, percent: number, at_risk: number, serious = false) => ({
    term, serious, affected: Math.round((percent / 100) * at_risk), at_risk, percent, assessment: "SYSTEMATIC_ASSESSMENT",
});

export const safetyFor = (drug: string): SafetyResponse => {
    // Metformin's fixture has a boxed warning and no placebo arm, as that drug's real record has.
    const noPlacebo = drug === "metformin";
    return {
        drug,
        trial: "NCT00000000",
        kind: "empirical",
        label_warnings: [
            { term: "fixture warning", kind: "warning", text: "FIXTURE text of an ordinary label warning." },
            ...(drug === "empagliflozin" ? [] : [{ term: "fixture boxed risk", kind: "boxed warning", text: "FIXTURE text of a boxed warning." }]),
        ],
        label_source: "FIXTURE label source, not real",
        arms: [
            {
                arm: `Fixture ${drug} arm`, role: "drug", participants: 130, serious_affected: 7,
                events: [eventOf("Nausea", 23.8, 130), eventOf("Headache", 6.9, 130), ...Array.from({ length: 14 }, (_, i) => eventOf(`Fixture event ${i + 1}`, 5 - i * 0.1, 130)), eventOf("Fixture serious event", 0.8, 130, true)],
            },
            {
                arm: noPlacebo ? "Fixture comparator arm" : "Placebo", role: noPlacebo ? "comparator" : "placebo", participants: 129, serious_affected: 5,
                events: [eventOf("Nausea", 7.8, 129)],
            },
        ],
        has_placebo_arm: !noPlacebo,
        notice: `FIXTURE notice. An event missing from the table means it was not reported at that threshold. These rates are not simulated.${noPlacebo ? " FIXTURE: no placebo arm." : ""}`,
    };
};

export const assistantFor = (question: string): AssistantReply => {
    const base = { tool_calls: [] as AssistantReply["tool_calls"], guard_note: null, sent_to_provider: false };
    if (/chest|overdose/i.test(question)) return { ...base, text: "FIXTURE emergency message. Contact local emergency services now.", source: "emergency" };
    if (/glipizide/i.test(question)) return { ...base, text: "FIXTURE: that medicine isn't modelled here.", source: "unsupported" };
    if (/[^\p{ASCII}]/u.test(question)) return { ...base, text: "FIXTURE: English research questions only.", source: "language" };
    if (/should i/i.test(question)) return { ...base, text: "FIXTURE refusal. Please talk to a doctor or pharmacist.", source: "refusal" };
    if (/accurate/i.test(question)) {
        return {
            ...base,
            text: "FIXTURE planner answer about validation.",
            source: "planner",
            tool_calls: [{ tool: "validation_report", ok: true }],
            guard_note: "The model's reply included numbers no tool produced, so it was replaced with computed text.",
        };
    }
    return {
        ...base,
        text: "FIXTURE simulated answer.",
        source: "claude",
        tool_calls: [{ tool: "run_virtual_trial", ok: true }, { tool: "search_registry", ok: false }],
        sent_to_provider: true,
        // Invented values for tests only: never use a screenshot of this card anywhere public.
        cards: [{
            kind: "trial", control: "Placebo", weeks: 26, n_per_arm: 200,
            arms: [{ name: "Semaglutide 1 mg/week", effect: -1.5, low: -1.7, high: -1.3, weight: -3.5, share_below_7: 0.8 }],
            curves: {
                Placebo: { mean: [7.8, 7.8, 7.8], low: [7.8, 7.6, 7.5], high: [7.8, 8.0, 8.1] },
                "Semaglutide 1 mg/week": { mean: [7.8, 6.9, 6.3], low: [7.8, 6.7, 6.1], high: [7.8, 7.1, 6.5] },
            },
        }],
    };
};

export const designFor = (body: { drug: string; target_effect: number; weeks: number; background: string; target_power?: number }): DesignResponse => {
    const unit = body.drug === "semaglutide" ? "mg/week" : "mg/day";
    const met = (mg: number, effect: number) => ({ mg, effect, interval95: [Number((effect - 0.08).toFixed(3)), Number((effect + 0.08).toFixed(3))] as [number, number] });
    const target = -Math.abs(body.target_effect);
    const goal = { drug: body.drug, target_effect: body.target_effect, weeks: body.weeks, background: body.background, target_power: body.target_power ?? 0.8 };
    const validationBlock = trialStatus;
    const notice = "FIXTURE notice. A simulated study design for research and learning. It is not a dosing recommendation for anyone.";
    if (body.target_effect >= 2.5) {
        return {
            goal,
            steps: [{ step: 1, action: `Try the highest modelled dose, 2 ${unit}`, result: met(2, -1.6), finding: "Simulated effect -1.6 points against placebo." }],
            simulated_design: null,
            reason: `No dose in the modelled range reached ${body.target_effect} points in this population. The simulated maximum was -1.6.`,
            validation: validationBlock,
            not_modelled: NOT_MODELLED,
            notice,
        };
    }
    const chosen = met(0.5, target - 0.03);
    return {
        goal,
        steps: [
            { step: 1, action: `Try the highest modelled dose, 2 ${unit}`, result: met(2, target - 0.6), finding: "Simulated effect against placebo at the top dose." },
            { step: 2, action: `Try the lowest modelled dose, 0.1 ${unit}`, result: met(0.1, target + 0.5), finding: "Simulated effect against placebo at the bottom dose." },
            { step: 3, action: `Bisect: try 0.447 ${unit}`, result: met(0.447, target + 0.05), finding: "Target not met: search higher." },
            { step: 4, action: `Bisect: try 0.5 ${unit}`, result: chosen, finding: "Target met: search lower." },
            {
                step: 5,
                action: `Estimate power at 0.5 ${unit} across arm sizes`,
                result: { curve: [{ n_per_arm: 25, power: 0.42 }, { n_per_arm: 50, power: 0.71 }, { n_per_arm: 100, power: 0.93 }] },
                finding: "80% power is first reached at 100 per arm.",
            },
        ],
        simulated_design: { drug: body.drug, dose_mg: 0.5, unit, n_per_arm: 100, power: 0.93, weeks: body.weeks, expected_effect: chosen.effect, effect_interval95: chosen.interval95 },
        reason: "Lowest simulated dose meeting the target, and the smallest tested arm size with the target power.",
        validation: validationBlock,
        not_modelled: NOT_MODELLED,
        notice,
    };
};

const REFERENCE = {
    authors: "Fixture Author",
    title: "Fixture model paper",
    journal: "Fixture Journal",
    year: 2016,
    volume: "1",
    pages: "1-2",
    doi: "10.0000/fixture",
    pmid: "0",
};

export const scenarios: ProgressionScenariosResponse = {
    scenarios: [
        { id: "published-figure7-reference", title: "Fixture reference trajectory", description: "FIXTURE description of the reference.", evidence_class: "published_model_reference" },
        { id: "no-sensitivity-recovery-control", title: "Fixture no-recovery control", description: "FIXTURE description of the control.", evidence_class: "exploratory_model_control" },
        { id: "earlier-sensitivity-transition", title: "Fixture earlier transition", description: "FIXTURE earlier.", evidence_class: "exploratory_model_perturbation" },
    ],
    model: "Fixture model",
    reference: REFERENCE,
};

export const progressionFor = (body: { scenario: string; intervention_day?: number; horizon_days?: number; target_si_after?: number }): ProgressionRun => {
    const horizon = body.horizon_days ?? 1800;
    const recovers = body.scenario !== "no-sensitivity-recovery-control";
    const intervention = body.intervention_day ?? (body.scenario === "earlier-sensitivity-transition" ? 730 : 1100);
    const trajectory = Array.from({ length: Math.floor(horizon / 5) + 1 }, (_, i) => {
        const day = i * 5;
        const rise = 100 + 75 * (1 - Math.exp(-day / 500));
        const glucose = recovers && day > intervention ? 104 + (rise - 104) * Math.exp(-(day - intervention) / 200) : rise;
        return {
            day,
            year: day / 365.25,
            glucose_mg_dl: glucose,
            beta_cell_state: 1000 - day * 0.08,
            insulin_sensitivity: recovers && day > intervention ? 0.47 : 0.18 + 0.62 * Math.exp(-day / 150),
        };
    });
    const crossed = trajectory.find((r) => r.glucose_mg_dl >= 126)?.day ?? null;
    const returned = crossed === null ? null : (trajectory.find((r) => r.day > crossed && r.glucose_mg_dl < 126)?.day ?? null);
    const glucoses = trajectory.map((r) => r.glucose_mg_dl);
    return {
        reference: REFERENCE,
        config: { horizon_days: horizon, intervention_day: intervention, target_si_after: body.target_si_after ?? (recovers ? 0.468 : 0.18) },
        summary: {
            initial_glucose_mg_dl: glucoses[0],
            glucose_at_intervention_mg_dl: glucoses[Math.floor(intervention / 5)] ?? glucoses[0],
            final_glucose_mg_dl: glucoses[glucoses.length - 1],
            max_glucose_mg_dl: Math.max(...glucoses),
            final_insulin_sensitivity: trajectory[trajectory.length - 1].insulin_sensitivity,
            final_beta_cell_state: trajectory[trajectory.length - 1].beta_cell_state,
            horizon_days: horizon,
        },
        trajectory,
        events: { crossed_threshold_day: crossed, returned_below_day: returned },
        limitations: ["FIXTURE limitation: not a clinically validated individual digital twin.", "FIXTURE limitation: not a drug effect estimate."],
    };
};
