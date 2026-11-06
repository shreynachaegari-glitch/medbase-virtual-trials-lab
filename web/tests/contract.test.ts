/**
 * Dev-only check that the fixtures assume no key the real API lacks. It needs a dump of real
 * responses, which is not shipped: run `MEDLAB_SHAPES=/path/to/dump.json npx vitest run tests/contract`.
 * Without that variable these tests are skipped. Only keys and types are compared, never values.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as fx from "./fixtures/api";

const path = process.env.MEDLAB_SHAPES;
const dump: Record<string, unknown> = path ? JSON.parse(readFileSync(path, "utf8")) : {};

/** Objects keyed by data, such as arm names, are compared by their values instead of their keys. */
const DATA_KEYED = new Set(["contrasts", "arms", "arm_kinds", "matched", "targets", "populations"]);
const kind = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

const diff = (fake: unknown, real: unknown, at: string, dataKeyed = false): string[] => {
    if (kind(real) === "null" || kind(fake) === "null") return [];
    if (kind(fake) !== kind(real)) return [`${at}: fixture ${kind(fake)}, real ${kind(real)}`];
    if (Array.isArray(fake)) {
        const [f, r] = [fake[0], (real as unknown[])[0]];
        return f === undefined || r === undefined ? [] : diff(f, r, `${at}[0]`);
    }
    if (kind(fake) !== "object") return [];
    const [f, r] = [fake as Record<string, unknown>, real as Record<string, unknown>];
    // Until a validation run exists the API sends only {available: false, note}, so there is nothing to compare.
    if ("V3_pass" in f && r.available === false) return [];
    if (dataKeyed) {
        const [fv, rv] = [Object.values(f)[0], Object.values(r)[0]];
        return fv === undefined || rv === undefined ? [] : diff(fv, rv, `${at}.*`);
    }
    return Object.keys(f).flatMap((key) =>
        key in r ? diff(f[key], r[key], `${at}.${key}`, DATA_KEYED.has(key) && !Array.isArray(f[key])) : [`${at}.${key}: not in the real API`],
    );
};

const body = { arms: [{ drug: "semaglutide", mg: 1 }], weeks: 8, n_per_arm: 50, egfr_min: 30, egfr_max: 60 };
const CASES: [string, unknown][] = [
    ["health", fx.health],
    ["drugs", fx.drugs],
    ["parameters", fx.parameters],
    ["scenarios", fx.scenarios],
    ["progression", fx.progressionFor({ scenario: "published-figure7-reference" })],
    ["trial", fx.trialFor(body)],
    ["power", fx.powerFor(body)],
    ["responders", fx.respondersFor(body)],
    ["design", fx.designFor({ drug: "semaglutide", target_effect: 1, weeks: 26, background: "any" })],
    ["safety_metformin", fx.safetyFor("metformin")],
    ["a_acc", fx.assistantFor("How accurate is this lab?")],
    ["a_emerg", fx.assistantFor("my chest hurts")],
];

describe.skipIf(!path)("fixtures match real response shapes", () => {
    it.each(CASES)("%s", (name, fake) => {
        expect(dump[name], `${name} is missing from the dump`).toBeDefined();
        expect(diff(fake, dump[name], name)).toEqual([]);
    });
});
