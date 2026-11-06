import { describe, expect, it } from "vitest";
import { armStyles, checksFrom, describeToolArgs, egfrLabel, fmtInterval, fmtNum, fmtShare, prettyRule } from "./format";
import type { ValidationScore } from "./types";

describe("number formats", () => {
    it("uses a true minus sign and never shows a negative zero", () => {
        expect(fmtNum(-1.234)).toBe("−1.23");
        expect(fmtNum(-0.001)).toBe("0.00");
        expect(fmtInterval([-1.5, 0.25])).toBe("−1.50 to 0.25");
    });
    it("reads a share as a percentage", () => {
        expect(fmtShare(0.702)).toBe("70%");
        expect(fmtShare(0.0125, 1)).toBe("1.3%");
    });
    it("calls the top of the eGFR range open-ended", () => {
        expect(egfrLabel(30, 60)).toBe("eGFR 30 to 60");
        expect(egfrLabel(90, 400)).toBe("eGFR 90 and above");
    });
});

describe("armStyles", () => {
    it("ties colour to the drug, not its position", () => {
        const one = armStyles(["Placebo", "Semaglutide 1 mg/week", "Metformin 2000 mg/day"]);
        const two = armStyles(["Metformin 2000 mg/day", "Semaglutide 1 mg/week", "Placebo"]);
        expect(one["Metformin 2000 mg/day"]).toEqual(two["Metformin 2000 mg/day"]);
        expect(one["Semaglutide 1 mg/week"]).toEqual(two["Semaglutide 1 mg/week"]);
    });
    it("always dashes a hypothetical candidate", () => {
        expect(armStyles(["X 50 mg/day (hypothetical)"])["X 50 mg/day (hypothetical)"].dash).toBeTruthy();
    });
    it("reads hypothetical from the API's arm kinds, whatever the arm is called", () => {
        expect(armStyles(["Compound Q"], { "Compound Q": "hypothetical" })["Compound Q"].dash).toBeTruthy();
    });
    it("dashes a second dose of the same drug so the two can be told apart", () => {
        const styles = armStyles(["Semaglutide 0.5 mg/week", "Semaglutide 1 mg/week"]);
        expect(styles["Semaglutide 0.5 mg/week"].dash).toBeUndefined();
        expect(styles["Semaglutide 1 mg/week"].dash).toBeTruthy();
    });
});

describe("checksFrom", () => {
    const score: ValidationScore = {
        n_contrasts: 1, mae: 1, bias: 0, within_0_30: 0, coverage_95pi: 0,
        coverage_80pi: 0, coverage_50pi: 0, interval_score_95: 0, mean_pi95_width: 0, null_mae: 0, model_minus_null_mae: 0, model_minus_null_ci95: [0, 0],
        V3_pass: false, V4_pass: true, V5_pass: false, V5_order_correct: true, V5_each_within: false, beats_null: false,
    };
    it("returns every check, failures included, in order", () => {
        expect(checksFrom(score).map((c) => [c.id, c.passed])).toEqual([["V3", false], ["V4", true], ["V5", false], ["V6", false]]);
    });
    it("keeps a check this page has not heard of", () => {
        const extra = { ...score, V10_pass: true } as ValidationScore;
        expect(checksFrom(extra).map((c) => c.id)).toEqual(["V3", "V4", "V5", "V6", "V10"]);
    });
    it("takes every pass mark from the report", () => {
        const marks = { mae_max: 0.11, within_0_30_min: 0.91, coverage_95_min: 0.85, renal_tolerance: 0.22 };
        const rules = Object.fromEntries(checksFrom(score, marks).map((c) => [c.id, c.rule]));
        expect(rules.V3).toContain("0.11");
        expect(rules.V3).toContain("91%");
        expect(rules.V4).toContain("85%");
        expect(rules.V5).toContain("0.22");
    });
    it("states no number when it has no marks to read", () => {
        for (const check of checksFrom(score, null)) expect(check.rule).not.toMatch(/at least \d|at most \d|within \u00b1\d/);
    });
    it("says V5's ordering is largely structural", () => {
        expect(checksFrom(score).find((c) => c.id === "V5")?.rule).toContain("largely built into the model's structure");
    });
});

describe("prettyRule", () => {
    it("collapses a repeated feature to its tightest bounds", () => {
        expect(prettyRule("baseline fasting glucose <= 259.2 and baseline fasting glucose > 177.1 and weight <= 103.6")).toEqual([
            "baseline fasting glucose above 177.1, up to 259.2",
            "weight up to 103.6",
        ]);
        expect(prettyRule("BMI <= 40 and BMI <= 31")).toEqual(["BMI up to 31"]);
    });
    it("leaves text it cannot parse alone", () => {
        expect(prettyRule("all patients")).toEqual(["all patients"]);
    });
});

describe("describeToolArgs", () => {
    it("reads a trial the AI asked for", () => {
        expect(describeToolArgs("run_virtual_trial", '{"arms":[{"drug":"semaglutide","mg":1},{"drug":"empagliflozin","mg":25}],"weeks":30}')).toBe("semaglutide 1 mg, empagliflozin 25 mg, 30 weeks");
    });
    it("reads a kidney range", () => {
        expect(describeToolArgs("power_analysis", '{"arms":[{"drug":"empagliflozin","mg":25}],"egfr_min":30,"egfr_max":60}')).toBe("empagliflozin 25 mg, eGFR 30 to 60");
    });
    it("says nothing about arguments it can't read", () => {
        expect(describeToolArgs("run_virtual_trial", "not json")).toBe("");
        expect(describeToolArgs("validation_report", "{}")).toBe("");
    });
});
