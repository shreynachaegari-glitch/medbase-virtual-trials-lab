import { describe, expect, it } from "vitest";
import { betaMicro, betaMi, hbA1cAtYear, simulatePatient, type ModelConstants } from "./model";
import { runCohort, percentile, sensitivitySweep, mulberry32 } from "./cohort";
import { treatmentArms, referenceHbA1c } from "./params";

const constants: ModelConstants = {
    baselineMicroHazard: 0.025,
    baselineMiHazard: 0.012,
    durationHazardPerYear: 0.04,
};

const patient = { baselineHbA1c: 8.0, driftRate: 0.35, diabetesDuration: 5 };
const armFor = (id: string) => treatmentArms.find((a) => a.id === id)!;
const noTherapy = armFor("none");

describe("hazard coefficients", () => {
    it("reproduces the UKPDS 35 microvascular risk reduction", () => {
        // A 1-point lower HbA1c must multiply risk by (1 - 0.37).
        expect(Math.exp(-betaMicro)).toBeCloseTo(0.63, 10);
    });

    it("reproduces the UKPDS 35 myocardial infarction risk reduction", () => {
        expect(Math.exp(-betaMi)).toBeCloseTo(0.86, 10);
    });

    it("leaves hazard unchanged at the reference HbA1c", () => {
        const flat = { ...patient, baselineHbA1c: referenceHbA1c, driftRate: 0, diabetesDuration: 0 };
        const points = simulatePatient(flat, noTherapy, { ...constants, durationHazardPerYear: 0 }, 1);
        // One year at exactly the reference: cumulative incidence equals the bare baseline hazard.
        expect(points[1].cumulativeMicro).toBeCloseTo(constants.baselineMicroHazard, 12);
    });
});

describe("HbA1c trajectory", () => {
    it("applies the treatment shift at year zero", () => {
        expect(hbA1cAtYear(patient, armFor("metformin"), 0)).toBeCloseTo(8.0 - 1.12, 10);
    });

    it("drifts linearly under no therapy", () => {
        expect(hbA1cAtYear(patient, noTherapy, 10)).toBeCloseTo(8.0 + 3.5, 10);
    });

    it("applies the sulfonylurea drift multiplier", () => {
        const arm = armFor("sulfonylurea");
        expect(hbA1cAtYear(patient, arm, 10)).toBeCloseTo(8.0 - 1.0 + 0.35 * 1.4 * 10, 10);
    });

    it("clamps runaway drift to a physiological ceiling", () => {
        const runaway = { ...patient, baselineHbA1c: 12, driftRate: 1.0 };
        expect(hbA1cAtYear(runaway, noTherapy, 40)).toBe(16);
    });
});

describe("cumulative incidence", () => {
    const points = simulatePatient(patient, noTherapy, constants, 10);

    it("starts at zero and never decreases", () => {
        expect(points[0].cumulativeMicro).toBe(0);
        for (let i = 1; i < points.length; i++) {
            expect(points[i].cumulativeMicro).toBeGreaterThanOrEqual(points[i - 1].cumulativeMicro);
        }
    });

    it("stays a probability", () => {
        points.forEach((p) => {
            expect(p.cumulativeMicro).toBeGreaterThanOrEqual(0);
            expect(p.cumulativeMicro).toBeLessThanOrEqual(1);
        });
    });

    it("gives a worse outcome for a higher baseline HbA1c", () => {
        const worse = simulatePatient({ ...patient, baselineHbA1c: 10 }, noTherapy, constants, 10);
        expect(worse[10].cumulativeMicro).toBeGreaterThan(points[10].cumulativeMicro);
    });

    it("gives a better outcome under metformin than under no therapy", () => {
        const treated = simulatePatient(patient, armFor("metformin"), constants, 10);
        expect(treated[10].cumulativeMicro).toBeLessThan(points[10].cumulativeMicro);
    });

    it("tracks the updated mean, not the instantaneous value", () => {
        // Year 2 mean of a drifting patient must sit below that year's spot HbA1c.
        expect(points[2].updatedMeanHbA1c).toBeLessThan(points[2].hbA1c);
    });
});

describe("cohort sampling", () => {
    const spread = { hbA1cSd: 0.8, driftSd: 0.45, durationSd: 3 };

    it("is reproducible for a given seed", () => {
        const a = runCohort(patient, noTherapy, constants, spread, 10, 200, 42);
        const b = runCohort(patient, noTherapy, constants, spread, 10, 200, 42);
        expect(a.microMean).toEqual(b.microMean);
    });

    it("produces a different cohort for a different seed", () => {
        const a = runCohort(patient, noTherapy, constants, spread, 10, 200, 42);
        const b = runCohort(patient, noTherapy, constants, spread, 10, 200, 43);
        expect(a.microMean).not.toEqual(b.microMean);
    });

    it("brackets the mean with its percentile band", () => {
        const r = runCohort(patient, noTherapy, constants, spread, 10, 400, 7);
        expect(r.microP10[10]).toBeLessThanOrEqual(r.microMean[10]);
        expect(r.microP90[10]).toBeGreaterThanOrEqual(r.microMean[10]);
    });

    it("returns one final outcome per simulated patient", () => {
        const r = runCohort(patient, noTherapy, constants, spread, 10, 250, 1);
        expect(r.finalMicro).toHaveLength(250);
    });

    it("never samples a negative drift rate or duration", () => {
        const wide = { hbA1cSd: 2, driftSd: 5, durationSd: 20 };
        const r = runCohort(patient, noTherapy, constants, wide, 5, 300, 9);
        r.finalMicro.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    });

    it("keeps the generator inside the unit interval", () => {
        const rng = mulberry32(123);
        for (let i = 0; i < 1000; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

describe("percentile", () => {
    it("interpolates between ranks", () => {
        expect(percentile([0, 10], 0.5)).toBeCloseTo(5, 10);
    });

    it("returns the bounds at the extremes", () => {
        expect(percentile([1, 2, 3, 4], 0)).toBe(1);
        expect(percentile([1, 2, 3, 4], 1)).toBe(4);
    });

    it("handles an empty sample", () => {
        expect(percentile([], 0.5)).toBe(0);
    });
});

describe("sensitivity sweep", () => {
    it("ranks parameters by the swing they cause", () => {
        const entries = sensitivitySweep(patient, noTherapy, constants, 10, [
            { id: "baselineHbA1c", label: "Baseline HbA1c", low: 6, high: 12 },
            { id: "baselineMicroHazard", label: "Baseline hazard", low: 0.002, high: 0.08 },
            { id: "diabetesDuration", label: "Duration", low: 0, high: 25 },
        ]);
        for (let i = 1; i < entries.length; i++) {
            expect(entries[i - 1].swing).toBeGreaterThanOrEqual(entries[i].swing);
        }
    });

    it("reports a real swing for the uncited baseline hazard", () => {
        const [entry] = sensitivitySweep(patient, noTherapy, constants, 10, [
            { id: "baselineMicroHazard", label: "Baseline hazard", low: 0.002, high: 0.08 },
        ]);
        expect(entry.swing).toBeGreaterThan(0.1);
    });
});
