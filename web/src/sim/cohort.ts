import { simulatePatient, type ModelConstants, type PatientInput } from "./model";
import type { TreatmentArm } from "./params";

/** Seeded so a run is reproducible: the same seed is the same cohort, sharable as a number. */
export const mulberry32 = (seed: number) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export const gaussian = (rng: () => number) => {
    const u = 1 - rng();
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export interface CohortSpread {
    hbA1cSd: number;
    driftSd: number;
    durationSd: number;
}

export interface CohortResult {
    armId: string;
    years: number[];
    hbA1cMean: number[];
    hbA1cP10: number[];
    hbA1cP90: number[];
    microMean: number[];
    microP10: number[];
    microP90: number[];
    miMean: number[];
    miP10: number[];
    miP90: number[];
    /** Per-patient cumulative incidence at the horizon, for the outcome distribution. */
    finalMicro: number[];
    finalMi: number[];
}

export const percentile = (sorted: number[], p: number): number => {
    if (sorted.length === 0) return 0;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const runCohort = (
    patient: PatientInput,
    arm: TreatmentArm,
    constants: ModelConstants,
    spread: CohortSpread,
    horizonYears: number,
    n: number,
    seed: number,
): CohortResult => {
    const rng = mulberry32(seed);
    const byYearHbA1c: number[][] = Array.from({ length: horizonYears + 1 }, () => []);
    const byYearMicro: number[][] = Array.from({ length: horizonYears + 1 }, () => []);
    const byYearMi: number[][] = Array.from({ length: horizonYears + 1 }, () => []);

    for (let i = 0; i < n; i++) {
        const sampled: PatientInput = {
            baselineHbA1c: patient.baselineHbA1c + gaussian(rng) * spread.hbA1cSd,
            driftRate: Math.max(0, patient.driftRate + gaussian(rng) * spread.driftSd),
            diabetesDuration: Math.max(
                0,
                patient.diabetesDuration + gaussian(rng) * spread.durationSd,
            ),
        };
        const points = simulatePatient(sampled, arm, constants, horizonYears);
        points.forEach((pt) => {
            byYearHbA1c[pt.year].push(pt.hbA1c);
            byYearMicro[pt.year].push(pt.cumulativeMicro);
            byYearMi[pt.year].push(pt.cumulativeMi);
        });
    }

    const sortedHbA1c = byYearHbA1c.map((xs) => [...xs].sort((a, b) => a - b));
    const sortedMicro = byYearMicro.map((xs) => [...xs].sort((a, b) => a - b));
    const sortedMi = byYearMi.map((xs) => [...xs].sort((a, b) => a - b));

    return {
        armId: arm.id,
        years: byYearHbA1c.map((_, i) => i),
        hbA1cMean: byYearHbA1c.map(mean),
        hbA1cP10: sortedHbA1c.map((xs) => percentile(xs, 0.1)),
        hbA1cP90: sortedHbA1c.map((xs) => percentile(xs, 0.9)),
        microMean: byYearMicro.map(mean),
        microP10: sortedMicro.map((xs) => percentile(xs, 0.1)),
        microP90: sortedMicro.map((xs) => percentile(xs, 0.9)),
        miMean: byYearMi.map(mean),
        miP10: sortedMi.map((xs) => percentile(xs, 0.1)),
        miP90: sortedMi.map((xs) => percentile(xs, 0.9)),
        finalMicro: byYearMicro[horizonYears],
        finalMi: byYearMi[horizonYears],
    };
};

export interface SensitivityEntry {
    paramId: string;
    label: string;
    lowValue: number;
    highValue: number;
    lowOutcome: number;
    highOutcome: number;
    swing: number;
}

export type Endpoint = "micro" | "mi";

/**
 * One-at-a-time sweep. Deliberately reports the *swing* in the headline outcome so a
 * parameter with no published backing that dominates the result is visible rather than buried.
 */
export const sensitivitySweep = (
    patient: PatientInput,
    arm: TreatmentArm,
    constants: ModelConstants,
    horizonYears: number,
    sweeps: { id: string; label: string; low: number; high: number }[],
    endpoint: Endpoint = "micro",
): SensitivityEntry[] => {
    const outcomeFor = (p: PatientInput, c: ModelConstants) => {
        const last = simulatePatient(p, arm, c, horizonYears).at(-1)!;
        return endpoint === "mi" ? last.cumulativeMi : last.cumulativeMicro;
    };

    const applied = (id: string, value: number): [PatientInput, ModelConstants] => {
        const p = { ...patient };
        const c = { ...constants };
        if (id === "baselineHbA1c") p.baselineHbA1c = value;
        else if (id === "driftRate") p.driftRate = value;
        else if (id === "diabetesDuration") p.diabetesDuration = value;
        else if (id === "baselineMicroHazard") c.baselineMicroHazard = value;
        else if (id === "baselineMiHazard") c.baselineMiHazard = value;
        else if (id === "durationHazardPerYear") c.durationHazardPerYear = value;
        return [p, c];
    };

    return sweeps
        .map(({ id, label, low, high }) => {
            const [lowP, lowC] = applied(id, low);
            const [highP, highC] = applied(id, high);
            const lowOutcome = outcomeFor(lowP, lowC);
            const highOutcome = outcomeFor(highP, highC);
            return {
                paramId: id,
                label,
                lowValue: low,
                highValue: high,
                lowOutcome,
                highOutcome,
                swing: Math.abs(highOutcome - lowOutcome),
            };
        })
        .sort((a, b) => b.swing - a.swing);
};
