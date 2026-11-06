import type { ArmKind, ContrastRow, PassMarks, ValidationScore, ValidationStatus } from "./types";

const MINUS = "−";

export const contrastKey = (c: ContrastRow): string => `${c.trial}|${c.arm}|${c.reference}`;

/** Fixed decimals with a true minus sign, and no "-0.00". */
export const fmtNum = (value: number, digits = 2): string => {
    const text = Math.abs(value).toFixed(digits);
    return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
};

export const fmtShare = (value: number, digits = 0): string => `${(value * 100).toFixed(digits)}%`;

export const fmtInterval = (interval: readonly [number, number], digits = 2): string =>
    `${fmtNum(interval[0], digits)} to ${fmtNum(interval[1], digits)}`;

export const ENDPOINTS: Record<string, { label: string; unit: string; digits: number }> = {
    hba1c: { label: "HbA1c", unit: "points", digits: 2 },
    fpg: { label: "Fasting glucose", unit: "mg/dL", digits: 1 },
    weight: { label: "Weight", unit: "kg", digits: 1 },
};

export const endpointInfo = (id: string) => ENDPOINTS[id] ?? { label: id, unit: "", digits: 2 };

export interface ArmStyle {
    color: string;
    /** SVG dash pattern. A candidate is always dashed; a repeat of one drug at another dose too. */
    dash?: string;
}

const DRUG_COLOURS: [RegExp, string][] = [
    [/semaglutide/i, "var(--arm-semaglutide)"],
    [/empagliflozin/i, "var(--arm-empagliflozin)"],
    [/sitagliptin/i, "var(--arm-sitagliptin)"],
    [/metformin/i, "var(--arm-metformin)"],
];
const REPEAT_DASHES = ["7 4", "2 3"];

/** Colour follows the drug, never the arm's position in the list. */
export const armStyles = (names: readonly string[], kinds: Record<string, ArmKind> = {}): Record<string, ArmStyle> => {
    const seen = new Map<string, number>();
    return Object.fromEntries(
        names.map((name) => {
            if (kinds[name] === "hypothetical" || /hypothetical/i.test(name)) return [name, { color: "var(--arm-candidate)", dash: "3 4" }];
            if (kinds[name] === "control" || /placebo/i.test(name)) return [name, { color: "var(--arm-placebo)" }];
            const color = DRUG_COLOURS.find(([rx]) => rx.test(name))?.[1] ?? "var(--arm-candidate)";
            const repeat = seen.get(color) ?? 0;
            seen.set(color, repeat + 1);
            return [name, repeat === 0 ? { color } : { color, dash: REPEAT_DASHES[Math.min(repeat - 1, 1)] }];
        }),
    );
};

export const drugName = (drug: string): string => drug.charAt(0).toUpperCase() + drug.slice(1);

const EGFR_TOP = 400; // the API's upper bound, which means "no upper limit" to a reader

export const egfrLabel = (min: number, max: number): string =>
    max >= EGFR_TOP ? `eGFR ${min} and above` : `eGFR ${min} to ${max}`;

export const BACKGROUNDS: { id: "any" | "naive" | "metformin"; label: string; inSentence: string }[] = [
    { id: "any", label: "Any", inSentence: "any background therapy" },
    { id: "naive", label: "Drug-naive", inSentence: "drug-naive patients" },
    { id: "metformin", label: "On metformin", inSentence: "patients on metformin" },
];

export const MECHANISMS: Record<string, string> = {
    hgp: "Lowers liver glucose output",
    secretion: "Raises insulin secretion",
    sensitizer: "Raises insulin sensitivity",
    renal: "Raises kidney glucose excretion",
};

export interface CheckResult {
    id: string;
    title: string;
    rule: string;
    passed: boolean;
}

/** Marks are read from the report, so the page can never disagree with the test that was run. */
const ruleFor = (id: string, marks: PassMarks | null): string => {
    switch (id) {
        case "V3":
            return marks
                ? `Mean error at most ${marks.mae_max} points, and at least ${fmtShare(marks.within_0_30_min)} of contrasts within \u00b10.30`
                : "Accuracy on held-out contrasts, against marks fixed in advance";
        case "V4":
            return marks
                ? `At least ${fmtShare(marks.coverage_95_min)} of observed values inside the 95% predictive interval`
                : "Observed values inside the 95% predictive interval, against a mark fixed in advance";
        case "V5":
            return `Effect weakens in the right order across eGFR strata${marks ? `, each within \u00b1${marks.renal_tolerance}` : ""}. Never fitted. The ordering is largely built into the model's structure, so only the size test carries information`;
        case "V6":
            return "Beats a rival with no physiology: the whole 95% interval for model error minus rival error lies below zero";
        default:
            return "";
    }
};

const CHECK_TITLES: Record<string, string> = {
    V3: "HbA1c accuracy",
    V4: "Interval coverage",
    V5: "Kidney-function effect",
    V6: "Beats a simple rival",
};

/** Reads whichever checks the response carries, so a new one cannot be silently dropped. */
export const checksFrom = (score: ValidationScore | ValidationStatus, marks: PassMarks | null = null): CheckResult[] =>
    Object.entries(score)
        .flatMap(([key, value]) => {
            const match = /^(V\d+)_pass$/.exec(key);
            const id = key === "beats_null" ? "V6" : match?.[1];
            if (!id || typeof value !== "boolean") return [];
            return [{ id, title: CHECK_TITLES[id] ?? id, rule: ruleFor(id, marks), passed: value }];
        })
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

/**
 * A decision-tree path repeats a feature as it narrows, as in "BMI <= 40 and BMI <= 31". Each
 * feature collapses to its tightest bounds, in the tree's own numbers.
 */
export const prettyRule = (rule: string): string[] => {
    const bounds = new Map<string, { upper?: number; lower?: number }>();
    const other: string[] = [];
    for (const part of rule.split(" and ")) {
        const match = /^(.+?) (<=|>) (-?\d+(?:\.\d+)?)$/.exec(part);
        if (!match) {
            other.push(part);
            continue;
        }
        const [, feature, op, raw] = match;
        const value = Number(raw);
        const entry = bounds.get(feature) ?? {};
        if (op === "<=") entry.upper = entry.upper === undefined ? value : Math.min(entry.upper, value);
        else entry.lower = entry.lower === undefined ? value : Math.max(entry.lower, value);
        bounds.set(feature, entry);
    }
    const parts = [...bounds].map(([feature, { lower, upper }]) => {
        if (lower !== undefined && upper !== undefined) return `${feature} above ${lower}, up to ${upper}`;
        if (upper !== undefined) return `${feature} up to ${upper}`;
        return `${feature} above ${lower}`;
    });
    return [...parts, ...other];
};

const TOOL_ARMS = (args: { arms?: { drug?: string; mg?: number }[]; weeks?: number; n_per_arm?: number; egfr_min?: number; egfr_max?: number }): string => {
    const parts = (args.arms ?? []).map((arm) => `${arm.drug ?? "?"} ${arm.mg ?? "?"} mg`);
    if (args.weeks !== undefined) parts.push(`${args.weeks} weeks`);
    if (args.n_per_arm !== undefined) parts.push(`${args.n_per_arm} per arm`);
    if (args.egfr_min !== undefined || args.egfr_max !== undefined) parts.push(egfrLabel(args.egfr_min ?? 30, args.egfr_max ?? EGFR_TOP));
    return parts.join(", ");
};

/** What the AI asked a tool to do, in a reader's words. Text it can't read is simply not shown. */
export const describeToolArgs = (name: string, rawArgs: string): string => {
    try {
        const args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
        if (name === "run_virtual_trial" || name === "power_analysis" || name === "who_responds") return TOOL_ARMS(args);
        if (name === "drug_safety") return typeof args.drug === "string" ? args.drug : "";
        if (name === "search_registry" || name === "search_literature") return typeof args.query === "string" ? args.query : "";
        return "";
    } catch {
        return "";
    }
};
