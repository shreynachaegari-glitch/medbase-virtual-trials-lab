import { describe, expect, it } from "vitest";
import {
    activePreset,
    allParams,
    changedParams,
    compare,
    decodeExperiment,
    defaultExperiment,
    encodeExperiment,
    presets,
    provenanceMix,
    referenceArm,
    runExperiment,
    runSensitivity,
    snap,
    toCsv,
    toManifest,
    type ExperimentConfig,
} from "./experiment";

const custom = (): ExperimentConfig => {
    const c = defaultExperiment();
    return {
        ...c,
        values: { ...c.values, baselineHbA1c: 9.1, driftSd: 0.3, baselineMicroHazard: 0.031 },
        arms: ["metformin", "none", "sulfonylurea"],
        horizon: 15,
        n: 800,
        seed: 1234,
    };
};

describe("experiment URL codec", () => {
    it("encodes the defaults as an empty query", () => {
        expect(encodeExperiment(defaultExperiment()).toString()).toBe("");
    });

    it("round-trips a customised experiment exactly", () => {
        const c = custom();
        const back = decodeExperiment(new URLSearchParams(encodeExperiment(c).toString()));
        expect(back.values).toEqual(c.values);
        expect(new Set(back.arms)).toEqual(new Set(c.arms));
        expect(back).toMatchObject({ horizon: 15, n: 800, seed: 1234, cohort: true });
    });

    it("round-trips an empty arm selection and single-patient mode", () => {
        const c = { ...defaultExperiment(), arms: [], cohort: false };
        const back = decodeExperiment(encodeExperiment(c));
        expect(back.arms).toEqual([]);
        expect(back.cohort).toBe(false);
    });

    it("clamps and snaps hand-edited values instead of trusting them", () => {
        const c = decodeExperiment(new URLSearchParams("a1c=99&drift=0.333333&years=400&n=734&seed=-5&arms=metformin,bogus"));
        expect(c.values.baselineHbA1c).toBe(12);
        expect(c.values.driftRate).toBe(0.33);
        expect(c.horizon).toBe(10);
        expect(c.n).toBe(700);
        expect(c.seed).toBe(42);
        expect(c.arms).toEqual(["metformin"]);
    });

    it("ignores garbage without throwing", () => {
        const c = decodeExperiment(new URLSearchParams("a1c=abc&h_micro=&cohort=maybe"));
        expect(c.values.baselineHbA1c).toBe(defaultExperiment().values.baselineHbA1c);
        expect(c.cohort).toBe(true);
    });
});

describe("snap", () => {
    it("rounds to the parameter's step and range", () => {
        const spec = allParams.find((p) => p.id === "baselineMicroHazard")!;
        expect(snap(spec, 0.02549)).toBe(0.025);
        expect(snap(spec, 1)).toBe(spec.max);
    });

    it("rounds a typed half-step up despite float error", () => {
        const spec = allParams.find((p) => p.id === "baselineHbA1c")!;
        expect(snap(spec, 9.35)).toBe(9.4);
        expect(snap(spec, 9.34)).toBe(9.3);
    });
});

describe("presets", () => {
    it("recognises the reference preset on the defaults", () => {
        expect(activePreset(defaultExperiment())?.id).toBe("reference");
    });

    it("only sets patient characteristics, never model constants", () => {
        presets.forEach((p) =>
            Object.keys(p.values).forEach((id) =>
                expect(["baselineHbA1c", "driftRate", "diabetesDuration"]).toContain(id),
            ),
        );
    });

    it("keeps every preset value inside its slider range", () => {
        presets.forEach((p) =>
            Object.entries(p.values).forEach(([id, v]) => {
                const spec = allParams.find((s) => s.id === id)!;
                expect(v).toBeGreaterThanOrEqual(spec.min);
                expect(v).toBeLessThanOrEqual(spec.max);
            }),
        );
    });

    it("reports changed parameters", () => {
        expect(changedParams(defaultExperiment())).toEqual([]);
        expect(changedParams(custom()).map((p) => p.id).sort()).toEqual(
            ["baselineHbA1c", "baselineMicroHazard", "driftSd"].sort(),
        );
    });
});

describe("running an experiment", () => {
    it("returns arms in canonical order with a band per endpoint in cohort mode", () => {
        const run = runExperiment(custom());
        expect(run.arms.map((a) => a.arm.id)).toEqual(["none", "metformin", "sulfonylurea"]);
        expect(run.years).toHaveLength(16);
        run.arms.forEach((a) => {
            expect(a.mi.lo).toHaveLength(16);
            expect(a.final?.micro).toHaveLength(800);
        });
    });

    it("draws the same patients for every arm, so the comparison is paired", () => {
        const c = { ...defaultExperiment(), arms: ["none", "metformin"] };
        const run = runExperiment(c);
        const [none, met] = run.arms;
        // Paired: the treated patient is never worse than the same untreated patient.
        none.final!.micro.forEach((v, i) => expect(met.final!.micro[i]).toBeLessThanOrEqual(v));
    });

    it("has no bands and no per-patient outcomes in single-patient mode", () => {
        const run = runExperiment({ ...defaultExperiment(), cohort: false });
        expect(run.arms[0].micro.lo).toBeUndefined();
        expect(run.arms[0].final).toBeUndefined();
        expect(run.arms[0].micro.mean).toEqual(run.arms[0].single.map((p) => p.cumulativeMicro));
    });

    it("measures against the untreated arm when it is shown", () => {
        const run = runExperiment(custom());
        expect(referenceArm(run)?.arm.id).toBe("none");
        const noUntreated = runExperiment({ ...custom(), arms: ["metformin", "lifestyle"] });
        expect(referenceArm(noUntreated)?.arm.id).toBe("metformin");
    });

    it("sweeps the chosen endpoint", () => {
        const micro = runSensitivity(defaultExperiment(), "none", "micro");
        const mi = runSensitivity(defaultExperiment(), "none", "mi");
        expect(micro.find((e) => e.paramId === "baselineMiHazard")!.swing).toBe(0);
        expect(mi.find((e) => e.paramId === "baselineMiHazard")!.swing).toBeGreaterThan(0);
    });
});

describe("comparisons", () => {
    it("computes absolute and relative reduction and NNT", () => {
        const c = compare(0.3, 0.2);
        expect(c.absoluteReduction).toBeCloseTo(0.1, 12);
        expect(c.relativeReduction).toBeCloseTo(1 / 3, 12);
        expect(c.nnt).toBeCloseTo(10, 9);
    });

    it("reports harm as a negative NNT and withholds it when the difference is noise", () => {
        expect(compare(0.2, 0.25).nnt).toBeCloseTo(-20, 9);
        expect(compare(0.2, 0.200001).nnt).toBeUndefined();
    });
});

describe("provenance mix", () => {
    it("counts spread parameters only in cohort mode", () => {
        const cohort = provenanceMix(defaultExperiment());
        const single = provenanceMix({ ...defaultExperiment(), cohort: false });
        expect(cohort.total - single.total).toBe(3);
        expect(cohort.derived + cohort.extrapolated + cohort.illustrative).toBe(cohort.total);
    });
});

describe("export", () => {
    it("writes one CSV row per arm-year plus a header", () => {
        const c = custom();
        const csv = toCsv(runExperiment(c), true).trim().split("\n");
        expect(csv).toHaveLength(1 + 3 * 16);
        expect(csv[0].split(",")).toHaveLength(11);
        expect(csv[1].startsWith("none,0,")).toBe(true);
    });

    it("writes a manifest that carries provenance and the seed", () => {
        const c = custom();
        const m = toManifest(c, runExperiment(c), "https://example.org/lab?x", new Date("2026-01-01T00:00:00Z"));
        expect(m.settings.seed).toBe(1234);
        expect(m.parameters.find((p) => p.id === "baselineMicroHazard")?.provenance.kind).toBe("illustrative");
        expect(m.outcomesAtHorizon.find((o) => o.arm === "metformin")?.versusReference?.reference).toBe("none");
        expect(JSON.parse(JSON.stringify(m)).generatedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("omits spread parameters from a single-patient manifest", () => {
        const c = { ...defaultExperiment(), cohort: false };
        const m = toManifest(c, runExperiment(c), "");
        expect(m.parameters.some((p) => p.id === "driftSd")).toBe(false);
        expect(m.settings.seed).toBeNull();
    });
});
