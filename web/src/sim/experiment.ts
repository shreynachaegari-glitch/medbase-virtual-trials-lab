import { runCohort, sensitivitySweep, type CohortSpread, type Endpoint } from "./cohort";
import { betaMi, betaMicro, simulatePatient, type ModelConstants, type PatientInput, type YearPoint } from "./model";
import {
    baseParams,
    hbA1cLogHazard,
    referenceHbA1c,
    spreadParams,
    treatmentArms,
    type ParamSpec,
    type Provenance,
    type TreatmentArm,
} from "./params";

/**
 * An experiment is everything needed to reproduce a run exactly: parameter values, arms,
 * horizon, cohort size and seed. It round-trips through a URL so a result can be cited by
 * link rather than by screenshot.
 */
export interface ExperimentConfig {
    values: Record<string, number>;
    arms: string[];
    horizon: number;
    cohort: boolean;
    n: number;
    seed: number;
}

export const MODEL_ID = "t2d-progression";
export const MODEL_VERSION = "1.1";

export const allParams: ParamSpec[] = [...baseParams, ...spreadParams];
export const patientParamIds = ["baselineHbA1c", "driftRate", "diabetesDuration"] as const;
export const constantParamIds = ["baselineMicroHazard", "baselineMiHazard", "durationHazardPerYear"] as const;

export const HORIZON = { min: 2, max: 25 } as const;
export const COHORT_N = { min: 100, max: 1000, step: 100 } as const;
export const SEED_MAX = 999_999;

export const defaultExperiment = (): ExperimentConfig => ({
    values: Object.fromEntries(allParams.map((p) => [p.id, p.value])),
    arms: ["none", "metformin"],
    horizon: 10,
    cohort: true,
    n: 500,
    seed: 42,
});

/* ------------------------------------ presets ------------------------------------ */

export interface Preset {
    id: string;
    label: string;
    blurb: string;
    values: Partial<Record<(typeof patientParamIds)[number], number>>;
}

/**
 * Starting points for the *patient* only — they never touch model constants. They are
 * illustrative archetypes, not published subtypes (see Mori et al. 2026 on how uncertain
 * subtype assignment is).
 */
export const presets: Preset[] = [
    {
        id: "reference",
        label: "Reference patient",
        blurb: "The defaults: HbA1c 8.0%, drift 0.35%/yr, 5 years since diagnosis.",
        values: { baselineHbA1c: 8.0, driftRate: 0.35, diabetesDuration: 5 },
    },
    {
        id: "new",
        label: "Newly diagnosed",
        blurb: "Near target at entry, slow drift, no accumulated duration.",
        values: { baselineHbA1c: 7.2, driftRate: 0.2, diabetesDuration: 0 },
    },
    {
        id: "longstanding",
        label: "Long-standing, poorly controlled",
        blurb: "High entry HbA1c after fifteen years of disease.",
        values: { baselineHbA1c: 9.8, driftRate: 0.45, diabetesDuration: 15 },
    },
    {
        id: "rapid",
        label: "Rapid β-cell decline",
        blurb: "Moderate entry HbA1c but a drift rate near the top of the observed spread.",
        values: { baselineHbA1c: 8.0, driftRate: 0.8, diabetesDuration: 3 },
    },
];

export const activePreset = (config: ExperimentConfig) =>
    presets.find((p) =>
        patientParamIds.every((id) => Math.abs((p.values[id] ?? NaN) - config.values[id]) < 1e-9),
    );

/* ------------------------------------ URL codec ------------------------------------ */

/** Short, readable query keys, so a shared link says what it sets. */
const PARAM_KEYS: Record<string, string> = {
    baselineHbA1c: "a1c",
    driftRate: "drift",
    diabetesDuration: "dur",
    baselineMicroHazard: "h_micro",
    baselineMiHazard: "h_mi",
    durationHazardPerYear: "h_dur",
    hbA1cSd: "sd_a1c",
    driftSd: "sd_drift",
    durationSd: "sd_dur",
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rounds to the slider's step so float noise never ends up in a link or a display. */
export const snap = (spec: ParamSpec, v: number) => {
    const decimals = (String(spec.step).split(".")[1] ?? "").length;
    // The epsilon absorbs float error, so a typed 9.35 on a 0.1 step rounds up as a person expects.
    const stepped = Math.round((v - spec.min) / spec.step + 1e-9) * spec.step + spec.min;
    return Number(clamp(stepped, spec.min, spec.max).toFixed(decimals));
};

export const encodeExperiment = (config: ExperimentConfig): URLSearchParams => {
    const d = defaultExperiment();
    const sp = new URLSearchParams();
    allParams.forEach((p) => {
        const v = config.values[p.id];
        if (v !== undefined && Math.abs(v - d.values[p.id]) > 1e-12) sp.set(PARAM_KEYS[p.id], String(v));
    });
    const armOrder = (ids: string[]) =>
        treatmentArms.map((a) => a.id).filter((id) => ids.includes(id)).join(",");
    if (armOrder(config.arms) !== armOrder(d.arms)) sp.set("arms", armOrder(config.arms) || "-");
    if (config.horizon !== d.horizon) sp.set("years", String(config.horizon));
    if (config.cohort !== d.cohort) sp.set("cohort", config.cohort ? "1" : "0");
    if (config.n !== d.n) sp.set("n", String(config.n));
    if (config.seed !== d.seed) sp.set("seed", String(config.seed));
    return sp;
};

const intIn = (raw: string | null, lo: number, hi: number) => {
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
};

/** Every value is range-checked: a hand-edited link can move a slider, never break the model. */
export const decodeExperiment = (sp: URLSearchParams): ExperimentConfig => {
    const d = defaultExperiment();
    const values = { ...d.values };
    allParams.forEach((p) => {
        const raw = sp.get(PARAM_KEYS[p.id]);
        if (raw === null || raw.trim() === "") return;
        const n = Number(raw);
        if (Number.isFinite(n)) values[p.id] = snap(p, n);
    });

    const rawArms = sp.get("arms");
    const known = new Set(treatmentArms.map((a) => a.id));
    const arms =
        rawArms === null
            ? d.arms
            : rawArms === "-"
              ? []
              : [...new Set(rawArms.split(",").filter((id) => known.has(id)))];

    const n = intIn(sp.get("n"), COHORT_N.min, COHORT_N.max);
    return {
        values,
        arms,
        horizon: intIn(sp.get("years"), HORIZON.min, HORIZON.max) ?? d.horizon,
        cohort: sp.has("cohort") ? sp.get("cohort") !== "0" : d.cohort,
        n: n !== undefined ? Math.round(n / COHORT_N.step) * COHORT_N.step : d.n,
        seed: intIn(sp.get("seed"), 0, SEED_MAX) ?? d.seed,
    };
};

/** Parameters that differ from their defaults. */
export const changedParams = (config: ExperimentConfig) =>
    allParams.filter((p) => Math.abs(config.values[p.id] - p.value) > 1e-12);

/* ------------------------------------- running ------------------------------------- */

export const patientFrom = (v: Record<string, number>): PatientInput => ({
    baselineHbA1c: v.baselineHbA1c,
    driftRate: v.driftRate,
    diabetesDuration: v.diabetesDuration,
});

export const constantsFrom = (v: Record<string, number>): ModelConstants => ({
    baselineMicroHazard: v.baselineMicroHazard,
    baselineMiHazard: v.baselineMiHazard,
    durationHazardPerYear: v.durationHazardPerYear,
});

export const spreadFrom = (v: Record<string, number>): CohortSpread => ({
    hbA1cSd: v.hbA1cSd,
    driftSd: v.driftSd,
    durationSd: v.durationSd,
});

export interface Band {
    mean: number[];
    lo?: number[];
    hi?: number[];
}

export interface ArmRun {
    arm: TreatmentArm;
    hbA1c: Band;
    micro: Band;
    mi: Band;
    /** Per-patient outcome at the horizon; cohort mode only. */
    final?: { micro: number[]; mi: number[] };
    /** The deterministic reference patient, always computed. */
    single: YearPoint[];
}

export interface ExperimentRun {
    years: number[];
    arms: ArmRun[];
}

export const selectedArms = (config: ExperimentConfig) =>
    treatmentArms.filter((a) => config.arms.includes(a.id));

export const runExperiment = (config: ExperimentConfig): ExperimentRun => {
    const patient = patientFrom(config.values);
    const constants = constantsFrom(config.values);
    const spread = spreadFrom(config.values);
    const years = Array.from({ length: config.horizon + 1 }, (_, i) => i);

    const arms = selectedArms(config).map((arm): ArmRun => {
        const single = simulatePatient(patient, arm, constants, config.horizon);
        if (!config.cohort) {
            return {
                arm,
                single,
                hbA1c: { mean: single.map((p) => p.hbA1c) },
                micro: { mean: single.map((p) => p.cumulativeMicro) },
                mi: { mean: single.map((p) => p.cumulativeMi) },
            };
        }
        // Every arm draws the same seeded patients, so arm differences are paired comparisons.
        const c = runCohort(patient, arm, constants, spread, config.horizon, config.n, config.seed);
        return {
            arm,
            single,
            hbA1c: { mean: c.hbA1cMean, lo: c.hbA1cP10, hi: c.hbA1cP90 },
            micro: { mean: c.microMean, lo: c.microP10, hi: c.microP90 },
            mi: { mean: c.miMean, lo: c.miP10, hi: c.miP90 },
            final: { micro: c.finalMicro, mi: c.finalMi },
        };
    });

    return { years, arms };
};

export const runSensitivity = (config: ExperimentConfig, armId: string, endpoint: Endpoint) => {
    const arm = treatmentArms.find((a) => a.id === armId) ?? treatmentArms[0];
    // Spread parameters are excluded: the sweep runs one deterministic patient, on whom they
    // have no effect by construction.
    return sensitivitySweep(
        patientFrom(config.values),
        arm,
        constantsFrom(config.values),
        config.horizon,
        baseParams.map((p) => ({ id: p.id, label: p.label, low: p.min, high: p.max })),
        endpoint,
    );
};

/* ------------------------------------- summary ------------------------------------- */

export interface Comparison {
    /** Reference minus arm; positive means the arm has fewer events. */
    absoluteReduction: number;
    relativeReduction: number;
    /** Number needed to treat (or harm, when negative) over the horizon. */
    nnt?: number;
}

export const compare = (reference: number, arm: number): Comparison => {
    const absoluteReduction = reference - arm;
    return {
        absoluteReduction,
        relativeReduction: reference > 0 ? absoluteReduction / reference : 0,
        // Below 0.01 percentage points the reciprocal is noise, not a count of patients.
        nnt: Math.abs(absoluteReduction) >= 1e-4 ? 1 / absoluteReduction : undefined,
    };
};

/** The arm every other arm is measured against: untreated when shown, otherwise the first. */
export const referenceArm = (run: ExperimentRun) =>
    run.arms.find((a) => a.arm.id === "none") ?? run.arms[0];

export const provenanceMix = (config: ExperimentConfig) => {
    const kinds: Provenance["kind"][] = [
        hbA1cLogHazard.microvascular.provenance.kind,
        hbA1cLogHazard.myocardialInfarction.provenance.kind,
        ...baseParams.map((p) => p.provenance.kind),
        ...selectedArms(config).map((a) => a.provenance.kind),
        ...(config.cohort ? spreadParams.map((p) => p.provenance.kind) : []),
    ];
    return {
        derived: kinds.filter((k) => k === "derived").length,
        extrapolated: kinds.filter((k) => k === "extrapolated").length,
        illustrative: kinds.filter((k) => k === "illustrative").length,
        total: kinds.length,
    };
};

/* ------------------------------------- export ------------------------------------- */

const r = (v: number | undefined, dp = 6) => (v === undefined ? "" : Number(v.toFixed(dp)).toString());

export const toCsv = (run: ExperimentRun, cohort: boolean) => {
    const header = cohort
        ? ["arm", "year", "hba1c_mean", "hba1c_p10", "hba1c_p90", "micro_mean", "micro_p10", "micro_p90", "mi_mean", "mi_p10", "mi_p90"]
        : ["arm", "year", "hba1c", "updated_mean_hba1c", "micro_cumulative", "mi_cumulative"];
    const rows = run.arms.flatMap((a) =>
        run.years.map((y, i) =>
            cohort
                ? [a.arm.id, y, r(a.hbA1c.mean[i], 4), r(a.hbA1c.lo?.[i], 4), r(a.hbA1c.hi?.[i], 4), r(a.micro.mean[i]), r(a.micro.lo?.[i]), r(a.micro.hi?.[i]), r(a.mi.mean[i]), r(a.mi.lo?.[i]), r(a.mi.hi?.[i])]
                : [a.arm.id, y, r(a.single[i].hbA1c, 4), r(a.single[i].updatedMeanHbA1c, 4), r(a.single[i].cumulativeMicro), r(a.single[i].cumulativeMi)],
        ),
    );
    return [header, ...rows].map((row) => row.join(",")).join("\n") + "\n";
};

const describeProvenance = (p: Provenance) =>
    p.kind === "illustrative"
        ? { kind: p.kind, note: p.reason }
        : {
              kind: p.kind,
              source: `${p.citation.short} (PMID ${p.citation.pmid}, doi:${p.citation.doi})`,
              ...(p.kind === "extrapolated" ? { gap: p.gap } : {}),
          };

export const toManifest = (config: ExperimentConfig, run: ExperimentRun, shareUrl: string, now = new Date()) => {
    const ref = referenceArm(run);
    const last = run.years.length - 1;
    return {
        tool: "MedBase Virtual Laboratory",
        model: { id: MODEL_ID, version: MODEL_VERSION },
        generatedAt: now.toISOString(),
        shareUrl,
        disclaimer:
            "Model output under the stated assumptions. The model is unvalidated against observed outcomes; this is not a clinical prediction or medical advice.",
        settings: {
            horizonYears: config.horizon,
            cohortMode: config.cohort,
            cohortSize: config.cohort ? config.n : 1,
            seed: config.cohort ? config.seed : null,
        },
        hazardCoefficients: {
            referenceHbA1c,
            betaMicro,
            betaMi,
            source: describeProvenance(hbA1cLogHazard.microvascular.provenance),
        },
        parameters: allParams
            .filter((p) => config.cohort || !spreadParams.includes(p))
            .map((p) => ({
                id: p.id,
                label: p.label,
                unit: p.unit,
                value: config.values[p.id],
                default: p.value,
                provenance: describeProvenance(p.provenance),
            })),
        arms: run.arms.map((a) => ({
            id: a.arm.id,
            label: a.arm.label,
            hbA1cShift: a.arm.hbA1cShift,
            driftMultiplier: a.arm.driftMultiplier,
            provenance: describeProvenance(a.arm.provenance),
        })),
        outcomesAtHorizon: run.arms.map((a) => ({
            arm: a.arm.id,
            hbA1c: a.hbA1c.mean[last],
            microvascular: { mean: a.micro.mean[last], p10: a.micro.lo?.[last], p90: a.micro.hi?.[last] },
            myocardialInfarction: { mean: a.mi.mean[last], p10: a.mi.lo?.[last], p90: a.mi.hi?.[last] },
            versusReference:
                ref && a !== ref
                    ? {
                          reference: ref.arm.id,
                          microvascular: compare(ref.micro.mean[last], a.micro.mean[last]),
                          myocardialInfarction: compare(ref.mi.mean[last], a.mi.mean[last]),
                      }
                    : undefined,
        })),
    };
};
