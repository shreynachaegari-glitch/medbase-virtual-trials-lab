import { citations, type Citation } from "./citations";

/**
 * Every number the model uses is declared here with its provenance. `derived` means the
 * value is read off a published result; `illustrative` means no published value was found
 * and the number only sets the scale of the output — it must never be read as an estimate.
 */
export type Provenance =
    | { kind: "derived"; citation: Citation; quote: string }
    | { kind: "extrapolated"; citation: Citation; quote: string; gap: string }
    | { kind: "illustrative"; reason: string };

export interface ParamSpec {
    id: string;
    label: string;
    unit: string;
    value: number;
    min: number;
    max: number;
    step: number;
    provenance: Provenance;
}

/** Log-hazard ratios per 1 percentage point of updated mean HbA1c, from UKPDS 35. */
export const hbA1cLogHazard = {
    microvascular: {
        riskReductionPer1Pct: 0.37,
        provenance: {
            kind: "derived",
            citation: citations.ukpds35,
            quote: "Each 1% reduction in updated mean HbA1c was associated with a 37% reduction in risk of microvascular complications (95% CI 33% to 41%).",
        } as Provenance,
    },
    myocardialInfarction: {
        riskReductionPer1Pct: 0.14,
        provenance: {
            kind: "derived",
            citation: citations.ukpds35,
            quote: "Each 1% reduction in updated mean HbA1c was associated with a 14% reduction in risk of myocardial infarction (95% CI 8% to 21%).",
        } as Provenance,
    },
} as const;

export const referenceHbA1c = 7.0;

export interface TreatmentArm {
    id: string;
    label: string;
    /** Used for direct labels on charts, where the full label does not fit. */
    shortLabel: string;
    /** Immediate change in HbA1c (percentage points) applied at year 0. */
    hbA1cShift: number;
    /** Multiplier on the annual drift rate after the initial shift. */
    driftMultiplier: number;
    provenance: Provenance;
    /** Shown beside the arm in the UI so a weak parameter is never silently equal to a strong one. */
    caveat?: string;
}

export const treatmentArms: TreatmentArm[] = [
    {
        id: "none",
        label: "No glucose-lowering therapy",
        shortLabel: "Untreated",
        hbA1cShift: 0,
        driftMultiplier: 1,
        provenance: {
            kind: "illustrative",
            reason: "Reference arm. Carries the untreated drift rate with no treatment effect applied.",
        },
    },
    {
        id: "metformin",
        label: "Metformin monotherapy",
        shortLabel: "Metformin",
        hbA1cShift: -1.12,
        driftMultiplier: 1,
        provenance: {
            kind: "derived",
            citation: citations.hirst2012,
            quote: "Metformin monotherapy lowered HbA1c by 1.12% (95% CI 0.92–1.32) versus placebo.",
        },
    },
    {
        id: "lifestyle",
        label: "Intensive lifestyle programme",
        shortLabel: "Lifestyle",
        hbA1cShift: -0.6,
        driftMultiplier: 1,
        provenance: {
            kind: "extrapolated",
            citation: citations.dpp2002,
            quote: "The lifestyle intervention reduced the incidence of diabetes by 58% (95% CI 48 to 66) versus placebo.",
            gap: "The DPP measured diabetes *incidence* in people with prediabetes. It did not measure an HbA1c treatment effect in established type 2 diabetes. The −0.6% shift used here is an assumption, not a published effect size — treat this arm as the weakest in the comparison.",
        },
        caveat: "Effect size assumed, not published",
    },
    {
        id: "sulfonylurea",
        label: "Sulfonylurea monotherapy",
        shortLabel: "Sulfonylurea",
        hbA1cShift: -1.0,
        driftMultiplier: 1.4,
        provenance: {
            kind: "extrapolated",
            citation: citations.adopt2006,
            quote: "Cumulative incidence of monotherapy failure at 5 years was 15% with rosiglitazone, 21% with metformin, and 34% with glyburide.",
            gap: "ADOPT reports time-to-failure, not a drift multiplier. The 1.4× faster drift here is a coarse re-expression of glyburide's higher failure rate and is not a published coefficient.",
        },
        caveat: "Drift multiplier re-expressed, not published. Hypoglycaemia is not modelled, and sulfonylureas raise its risk",
    },
];

export const baseParams: ParamSpec[] = [
    {
        id: "baselineHbA1c",
        label: "Baseline HbA1c",
        unit: "%",
        value: 8.0,
        min: 6.0,
        max: 12.0,
        step: 0.1,
        provenance: {
            kind: "illustrative",
            reason: "A patient characteristic you set, not a published constant. The default sits in the range where glucose-lowering therapy is typically considered.",
        },
    },
    {
        id: "driftRate",
        label: "HbA1c drift (β-cell failure)",
        unit: "%/year",
        value: 0.35,
        min: 0,
        max: 1.0,
        step: 0.01,
        provenance: {
            kind: "derived",
            citation: citations.wallace2002,
            quote: "Chlorpropamide-treated patients showed a mean coefficient of failure of 0.34 HbA1c%/year (SD 0.44); glibenclamide-treated patients 0.50%/year (SD 0.50).",
        },
    },
    {
        id: "diabetesDuration",
        label: "Diabetes duration at entry",
        unit: "years",
        value: 5,
        min: 0,
        max: 25,
        step: 1,
        provenance: {
            kind: "illustrative",
            reason: "A patient characteristic you set. It enters the model only through the duration term on baseline hazard, which is itself illustrative.",
        },
    },
    {
        id: "baselineMicroHazard",
        label: "Microvascular hazard at reference",
        unit: "/year",
        value: 0.025,
        min: 0.002,
        max: 0.08,
        step: 0.001,
        provenance: {
            kind: "illustrative",
            reason: "No absolute baseline hazard was taken from a source. UKPDS 35 supplies relative risk per 1% HbA1c, not an absolute annual rate, so this anchor sets the vertical scale of every incidence curve and is the single largest unvalidated assumption in the model.",
        },
    },
    {
        id: "baselineMiHazard",
        label: "Myocardial infarction hazard at reference",
        unit: "/year",
        value: 0.012,
        min: 0.001,
        max: 0.05,
        step: 0.001,
        provenance: {
            kind: "illustrative",
            reason: "As above — an absolute anchor, not a published rate. Relative effects of HbA1c on this hazard are UKPDS 35-derived; its absolute level is not.",
        },
    },
    {
        id: "durationHazardPerYear",
        label: "Hazard increase per year of duration",
        unit: "×/year",
        value: 0.04,
        min: 0,
        max: 0.15,
        step: 0.005,
        provenance: {
            kind: "illustrative",
            reason: "Encodes 'longer-standing diabetes carries more complication risk' at a plausible magnitude. No coefficient from a cited source backs this specific value.",
        },
    },
];

/**
 * Between-patient spread for cohort mode. These were once constants buried in the Lab page;
 * they shape every percentile band and histogram, so they carry provenance like any other
 * input. They only matter when a cohort is sampled — a single virtual patient ignores them.
 */
export const spreadParams: ParamSpec[] = [
    {
        id: "hbA1cSd",
        label: "Baseline HbA1c spread (SD)",
        unit: "%",
        value: 0.8,
        min: 0,
        max: 2.0,
        step: 0.05,
        provenance: {
            kind: "illustrative",
            reason: "Sets how varied entry HbA1c is across the cohort. Chosen to give a plausible clinic-population spread around the baseline; not taken from a cited cohort.",
        },
    },
    {
        id: "driftSd",
        label: "Drift spread (SD)",
        unit: "%/year",
        value: 0.44,
        min: 0,
        max: 1.0,
        step: 0.01,
        provenance: {
            kind: "derived",
            citation: citations.wallace2002,
            quote: "Chlorpropamide-treated patients showed a mean coefficient of failure of 0.34 HbA1c%/year (SD 0.44); glibenclamide-treated patients 0.50%/year (SD 0.50).",
        },
    },
    {
        id: "durationSd",
        label: "Duration spread (SD)",
        unit: "years",
        value: 3,
        min: 0,
        max: 10,
        step: 0.5,
        provenance: {
            kind: "illustrative",
            reason: "Sets how varied time-since-diagnosis is across the cohort. No published distribution was used.",
        },
    },
];

export const getParam = (params: ParamSpec[], id: string): number => {
    const found = params.find((p) => p.id === id);
    if (!found) throw new Error(`Unknown parameter: ${id}`);
    return found.value;
};

export const withValue = (params: ParamSpec[], id: string, value: number): ParamSpec[] =>
    params.map((p) => (p.id === id ? { ...p, value } : p));
