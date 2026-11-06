import { describe, expect, it } from "vitest";
import { buildDesign, candidateArm, formFromDesign, initialForm, PRESETS, savedFilesFor } from "./form";

describe("buildDesign", () => {
    it("turns the first preset into the API's body", () => {
        const { bodies, errors } = buildDesign(PRESETS[0].form());
        expect(errors).toEqual({});
        expect(bodies).toEqual([
            {
                arms: [{ drug: "semaglutide", mg: 1 }, { drug: "empagliflozin", mg: 25 }],
                weeks: 30, n_per_arm: 200, background: "any", dropout: 0, egfr_min: 30, egfr_max: 400,
            },
        ]);
    });
    it("runs the kidney preset as two requests differing only in eGFR", () => {
        const { bodies } = buildDesign(PRESETS[1].form());
        expect(bodies.map((b) => [b.egfr_min, b.egfr_max])).toEqual([[30, 60], [90, 400]]);
        expect({ ...bodies[0], egfr_min: 0, egfr_max: 0 }).toEqual({ ...bodies[1], egfr_min: 0, egfr_max: 0 });
    });
    it("reports a blank field against that field", () => {
        const form = initialForm();
        const blank = { ...form, weeks: " ", arms: [{ ...form.arms[0], mg: "" } as (typeof form.arms)[number]] };
        const { errors } = buildDesign(blank);
        expect(Object.keys(errors).sort()).toEqual([`${form.arms[0].id}.mg`, "weeks"].sort());
    });
    it("asks for an arm when there are none", () => {
        expect(buildDesign({ ...initialForm(), arms: [] }).errors.arms).toBeTruthy();
    });
    it("sends a candidate without a label, so the API's '(hypothetical)' name always stands", () => {
        const { bodies } = buildDesign({ ...initialForm(), arms: [candidateArm()] });
        expect(bodies[0].arms[0]).toHaveProperty("candidate");
        expect(bodies[0].arms[0]).not.toHaveProperty("label");
    });
});

describe("savedFilesFor", () => {
    it("matches an unedited preset", () => {
        const key = buildDesign(PRESETS[1].form()).key;
        expect(savedFilesFor(key)).toEqual(PRESETS[1].savedFiles);
    });
    it("matches nothing once the design is edited", () => {
        expect(savedFilesFor(buildDesign({ ...PRESETS[0].form(), weeks: "31" }).key)).toBeNull();
    });
});

describe("formFromDesign", () => {
    it("carries the proposal into the builder", () => {
        const form = formFromDesign(
            { drug: "sitagliptin", dose_mg: 50, unit: "mg/day", n_per_arm: 100, power: 0.9, weeks: 24, expected_effect: -0.6, effect_interval95: [-0.8, -0.4] },
            "naive",
        );
        expect(buildDesign(form).bodies[0]).toMatchObject({ arms: [{ drug: "sitagliptin", mg: 50 }], weeks: 24, n_per_arm: 100, background: "naive" });
    });
});
