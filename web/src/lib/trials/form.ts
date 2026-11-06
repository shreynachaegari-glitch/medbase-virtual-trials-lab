import type { SimulatedDesign } from "./types";

export type Background = "any" | "naive" | "metformin";

export interface DrugArmDraft {
    id: string;
    kind: "drug";
    drug: string;
    mg: string;
}

export interface CandidateArmDraft {
    id: string;
    kind: "candidate";
    name: string;
    mechanism: string;
    half_life_h: string;
    volume_l: string;
    emax: string;
    ec50_nmol: string;
    mg_per_day: string;
}

export type ArmDraft = DrugArmDraft | CandidateArmDraft;

/** Inputs stay as text so a reader can clear a field while typing. */
export interface DesignForm {
    arms: ArmDraft[];
    weeks: string;
    n_per_arm: string;
    background: Background;
    egfr_min: string;
    egfr_max: string;
    dropout_pct: string;
    compare: boolean;
    egfr2_min: string;
    egfr2_max: string;
}

export interface TrialBody {
    arms: (
        | { drug: string; mg: number }
        | {
              candidate: {
                  name: string;
                  mechanism: string;
                  half_life_h: number;
                  volume_l: number;
                  emax: number;
                  ec50_nmol: number;
                  mg_per_day: number;
              };
          }
    )[];
    weeks: number;
    n_per_arm: number;
    background: Background;
    egfr_min: number;
    egfr_max: number;
    dropout: number;
}

export type FieldErrors = Record<string, string>;

/** The API takes at most this many arms in one request; it adds placebo itself. */
export const MAX_ARMS = 4;

let nextArm = 0;
const armId = () => `arm-${++nextArm}`;

export const drugArm = (drug: string, mg: string): DrugArmDraft => ({ id: armId(), kind: "drug", drug, mg });

/** Starting values for the form, not a real molecule. The form says so next to them. */
export const candidateArm = (): CandidateArmDraft => ({
    id: armId(),
    kind: "candidate",
    name: "Candidate X",
    mechanism: "hgp",
    half_life_h: "24",
    volume_l: "70",
    emax: "0.3",
    ec50_nmol: "100",
    mg_per_day: "50",
});

const baseForm = (arms: ArmDraft[]): DesignForm => ({
    arms,
    weeks: "26",
    n_per_arm: "200",
    background: "any",
    egfr_min: "30",
    egfr_max: "400",
    dropout_pct: "0",
    compare: false,
    egfr2_min: "90",
    egfr2_max: "400",
});

export interface Preset {
    id: "sema-empa" | "kidney" | "candidate";
    title: string;
    blurb: string;
    /** A preset with a complete question runs at once; "design your own" waits for the reader. */
    autoRun: boolean;
    form: () => DesignForm;
    savedFiles: string[];
}

export const PRESETS: readonly Preset[] = [
    {
        id: "sema-empa",
        title: "Semaglutide vs empagliflozin, 30 weeks",
        blurb: "Two drug classes against placebo in one simulated trial.",
        autoRun: true,
        form: () => ({ ...baseForm([drugArm("semaglutide", "1"), drugArm("empagliflozin", "25")]), weeks: "30" }),
        savedFiles: ["trial-sema-vs-empa-30wk.json"],
    },
    {
        id: "kidney",
        title: "Kidney disease: does empagliflozin weaken?",
        blurb: "Runs eGFR 30 to 60, then normal eGFR, and compares the two.",
        autoRun: true,
        form: () => ({
            ...baseForm([drugArm("empagliflozin", "25")]),
            egfr_min: "30",
            egfr_max: "60",
            compare: true,
        }),
        savedFiles: ["trial-kidney-egfr-30-60.json", "trial-kidney-egfr-90-plus.json"],
    },
    {
        id: "candidate",
        title: "Design your own candidate",
        blurb: "Set a made-up molecule's mechanism and exposure. Always labelled hypothetical.",
        autoRun: false,
        form: () => baseForm([candidateArm()]),
        savedFiles: ["trial-candidate.json"],
    },
];

export const initialForm = (): DesignForm => PRESETS[0].form();

export const formFromDesign = (design: SimulatedDesign, background: string): DesignForm => ({
    ...baseForm([drugArm(design.drug, String(design.dose_mg))]),
    weeks: String(design.weeks),
    n_per_arm: String(design.n_per_arm),
    background: background === "naive" || background === "metformin" ? background : "any",
});

/** Mirrors the API's arm names, so a label can be shown before a run has returned one. */
export const armLabel = (arm: ArmDraft, unitFor: (drug: string) => string): string =>
    arm.kind === "candidate"
        ? `${arm.name || "Candidate"} ${arm.mg_per_day || "?"} mg/day (hypothetical)`
        : `${arm.drug.charAt(0).toUpperCase()}${arm.drug.slice(1)} ${arm.mg || "?"} ${unitFor(arm.drug)}`;

const defaultUnit = (drug: string) => (drug === "semaglutide" ? "mg/week" : "mg/day");

export const unitOf = (drug: string, drugs?: readonly { drug: string; unit: string }[]): string =>
    drugs?.find((d) => d.drug === drug)?.unit ?? defaultUnit(drug);

const readNumber = (raw: string, key: string, label: string, errors: FieldErrors): number => {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) errors[key] = `Enter a number for ${label}.`;
    return value;
};

const armBody = (arm: ArmDraft, errors: FieldErrors): TrialBody["arms"][number] => {
    if (arm.kind === "drug") return { drug: arm.drug, mg: readNumber(arm.mg, `${arm.id}.mg`, "the dose", errors) };
    const field = (key: "half_life_h" | "volume_l" | "emax" | "ec50_nmol" | "mg_per_day", label: string) =>
        readNumber(arm[key], `${arm.id}.${key}`, label, errors);
    return {
        candidate: {
            name: arm.name.trim() || "Candidate X",
            mechanism: arm.mechanism,
            half_life_h: field("half_life_h", "half-life"),
            volume_l: field("volume_l", "volume"),
            emax: field("emax", "Emax"),
            ec50_nmol: field("ec50_nmol", "EC50"),
            mg_per_day: field("mg_per_day", "mg/day"),
        },
    };
};

export interface BuiltDesign {
    bodies: TrialBody[];
    errors: FieldErrors;
    /** Compares a finished run with the form now on screen. */
    key: string;
}

/**
 * Text fields to request bodies. Only "is this a number" is checked here: ranges belong to the
 * API, whose 422 messages are shown as they are, so two lists of limits cannot drift apart.
 */
export const buildDesign = (form: DesignForm): BuiltDesign => {
    const errors: FieldErrors = {};
    if (form.arms.length === 0) errors.arms = "Add at least one drug or candidate.";
    const shared = {
        arms: form.arms.map((arm) => armBody(arm, errors)),
        weeks: readNumber(form.weeks, "weeks", "weeks", errors),
        n_per_arm: readNumber(form.n_per_arm, "n_per_arm", "patients per arm", errors),
        background: form.background,
        dropout: readNumber(form.dropout_pct, "dropout_pct", "dropout", errors) / 100,
    };
    const primary: TrialBody = {
        ...shared,
        egfr_min: readNumber(form.egfr_min, "egfr_min", "lowest eGFR", errors),
        egfr_max: readNumber(form.egfr_max, "egfr_max", "highest eGFR", errors),
    };
    const bodies = form.compare
        ? [
              primary,
              {
                  ...shared,
                  egfr_min: readNumber(form.egfr2_min, "egfr2_min", "lowest eGFR of the second range", errors),
                  egfr_max: readNumber(form.egfr2_max, "egfr2_max", "highest eGFR of the second range", errors),
              },
          ]
        : [primary];
    return { bodies, errors, key: JSON.stringify(bodies) };
};

/** The saved runs that answer exactly this design, when a preset has been left unedited. */
/** Everything after the arms, for the tabs that test one arm against placebo. */
export const withSingleArm = (body: TrialBody, arm: TrialBody["arms"][number]): TrialBody => ({ ...body, arms: [arm] });

export const savedFilesFor = (key: string): string[] | null => {
    const match = PRESETS.find((preset) => buildDesign(preset.form()).key === key);
    return match ? match.savedFiles : null;
};
