import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/surrogate.dev.json";
import { doseAt, dosePosition, doseResponse, forward, isSurrogate, predict, type SurrogateInput, type SurrogateNet } from "./surrogate";

/** DEV ONLY network, trained on synthetic numbers. See tests/fixtures/surrogate.dev.json. */
const net = fixture as unknown as SurrogateNet & { _cases: SurrogateInput[]; _sklearn_expected: number[][] };

describe("the forward pass", () => {
    it("matches a network worked out by hand", () => {
        // Two inputs, one tanh layer of two units, one linear output.
        const small = { weights: [[[1, 0], [0, 2]], [[3], [-1]]], biases: [[0, 0.5], [0.25]] };
        // unit 1: tanh(1 * 0.5) = 0.46211716; unit 2: tanh(2 * -0.25 + 0.5) = tanh(0) = 0
        // output: 3 * 0.46211716 - 1 * 0 + 0.25 = 1.63635149
        expect(forward(small, [0.5, -0.25])[0]).toBeCloseTo(1.63635149, 7);
    });
    it("has no tanh on the last layer", () => {
        expect(forward({ weights: [[[10]]], biases: [[0]] }, [1])[0]).toBe(10);
    });
    it("matches scikit-learn's own predict, on a network it trained", () => {
        net._cases.forEach((input, i) => {
            const got = predict(net, input);
            expect(got.hba1c_vs_placebo).toBeCloseTo(net._sklearn_expected[i][0], 9);
            expect(got.weight_kg_vs_placebo).toBeCloseTo(net._sklearn_expected[i][1], 9);
        });
    });
});

describe("the dose scale", () => {
    it("is logarithmic, end to end", () => {
        expect(dosePosition(net, "alpha", 1)).toBeCloseTo(0, 10);
        expect(dosePosition(net, "alpha", 10)).toBeCloseTo(0.5, 10);
        expect(dosePosition(net, "alpha", 100)).toBeCloseTo(1, 10);
        expect(doseAt(net, "alpha", 0.5)).toBeCloseTo(10, 8);
    });
    it("draws a curve across the whole range", () => {
        const curve = doseResponse(net, { drug: "alpha", weeks: 26, targetA1c: 8, egfrLow: 60, egfrHigh: 90 }, "hba1c_vs_placebo");
        expect(curve[0].mg).toBeCloseTo(1, 8);
        expect(curve[curve.length - 1].mg).toBeCloseTo(100, 6);
        expect(curve[curve.length - 1].value).toBeCloseTo(predict(net, { drug: "alpha", mg: 100, weeks: 26, targetA1c: 8, egfrLow: 60, egfrHigh: 90 }).hba1c_vs_placebo, 8);
    });
});

describe("reading the file", () => {
    it("accepts the trained shape", () => {
        expect(isSurrogate(fixture)).toBe(true);
    });
    it("refuses a missing or partial file", () => {
        expect(isSurrogate(null)).toBe(false);
        expect(isSurrogate({ drugs: [] })).toBe(false);
        expect(isSurrogate({ ...fixture, activation: "relu" })).toBe(false);
        expect(isSurrogate({ ...fixture, mean_x: [1] })).toBe(false);
    });
    it("refuses a feature it doesn't know, instead of guessing", () => {
        expect(() => predict({ ...net, features: ["mystery"], mean_x: [0], std_x: [1] }, net._cases[0])).toThrow("unknown surrogate feature");
    });
});
