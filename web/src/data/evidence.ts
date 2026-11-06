import { citations } from "@/sim/citations";

export interface LiteratureRecord {
    pmid: string;
    doi: string;
    title: string;
    authors: string;
    journal: string;
    year: number;
    /** Why this paper matters to the model, not a summary of the abstract. */
    relevance: string;
    /** Set when the paper supplies a number the simulator actually uses. */
    feedsModel?: string;
}

/**
 * Retrieved from PubMed. Every record here was returned by a live search — none are
 * reconstructed from memory, because a fabricated citation in a research tool is worse
 * than no citation at all.
 */
export const literature: LiteratureRecord[] = [
    {
        pmid: citations.ukpds35.pmid,
        doi: citations.ukpds35.doi,
        title: citations.ukpds35.title,
        authors: citations.ukpds35.authors,
        journal: citations.ukpds35.journal,
        year: citations.ukpds35.year,
        relevance:
            "The observational backbone of the model. Establishes that complication risk scales with updated mean HbA1c and quantifies the gradient, with no threshold below which risk stops falling.",
        feedsModel: "Microvascular and MI hazard ratios per 1% HbA1c",
    },
    {
        pmid: citations.wallace2002.pmid,
        doi: citations.wallace2002.doi,
        title: citations.wallace2002.title,
        authors: citations.wallace2002.authors,
        journal: citations.wallace2002.journal,
        year: citations.wallace2002.year,
        relevance:
            "Supplies the 'coefficient of failure' — the slope of HbA1c against time for an individual on stable therapy. This is what makes progression a trajectory rather than a fixed state, and its reported SD is what justifies spreading drift across a simulated cohort.",
        feedsModel: "Annual HbA1c drift rate and its between-patient SD",
    },
    {
        pmid: citations.hirst2012.pmid,
        doi: citations.hirst2012.doi,
        title: citations.hirst2012.title,
        authors: citations.hirst2012.authors,
        journal: citations.hirst2012.journal,
        year: citations.hirst2012.year,
        relevance:
            "Meta-analysis of 35 trials giving a pooled HbA1c effect for metformin, separately for monotherapy, add-on to oral therapy, and add-on to insulin.",
        feedsModel: "Metformin arm HbA1c shift (−1.12%)",
    },
    {
        pmid: citations.adopt2006.pmid,
        doi: citations.adopt2006.doi,
        title: citations.adopt2006.title,
        authors: citations.adopt2006.authors,
        journal: citations.adopt2006.journal,
        year: citations.adopt2006.year,
        relevance:
            "Head-to-head durability data: monotherapy does not hold. Failure rates diverged sharply by agent over five years, which is the empirical basis for treating drift as agent-dependent rather than universal.",
        feedsModel: "Sulfonylurea drift multiplier (re-expressed, not published as such)",
    },
    {
        pmid: citations.dpp2002.pmid,
        doi: citations.dpp2002.doi,
        title: citations.dpp2002.title,
        authors: citations.dpp2002.authors,
        journal: citations.dpp2002.journal,
        year: citations.dpp2002.year,
        relevance:
            "The canonical lifestyle-intervention trial. Note the population: people with prediabetes, with diabetes incidence as the endpoint. It does not license an HbA1c effect size in established diabetes, which is why the lifestyle arm in this model is flagged as an assumption.",
        feedsModel: "Lifestyle arm — cited as context, effect size NOT taken from it",
    },
    {
        pmid: citations.buckley2025.pmid,
        doi: citations.buckley2025.doi,
        title: citations.buckley2025.title,
        authors: citations.buckley2025.authors,
        journal: citations.buckley2025.journal,
        year: citations.buckley2025.year,
        relevance:
            "A direct counterexample to this model's central assumption. Tirzepatide-exposed patients had higher odds of new proliferative retinopathy (OR 2.15) despite better glycaemic control — evidence that rapid HbA1c improvement can transiently worsen retinopathy. A monotonic HbA1c→microvascular mapping cannot represent this at all.",
    },
    {
        pmid: citations.mori2026.pmid,
        doi: citations.mori2026.doi,
        title: citations.mori2026.title,
        authors: citations.mori2026.authors,
        journal: citations.mori2026.journal,
        year: citations.mori2026.year,
        relevance:
            "Argues that the popular four-subtype framing of type 2 diabetes (SIDD/SIRD/MOD/MARD) carries more classification uncertainty than is usually acknowledged, and weighs individualised prediction models against discrete subtyping. Directly relevant to whether a 'virtual patient' should be a point or a distribution.",
    },
];

export interface TrialRecord {
    nctId: string;
    title: string;
    status: string;
    phase: string;
    sponsor: string;
    enrollment: number;
    startDate: string;
    primaryCompletion: string;
    sites: number;
}

/**
 * Retrieved from ClinicalTrials.gov (recruiting, phase 3, condition: type 2 diabetes).
 * A snapshot taken during development — re-pull before using these operationally.
 */
export const trialsSnapshotDate = "2026-09-20";
export const trialsTotalMatching = 71;

export const trials: TrialRecord[] = [
    {
        nctId: "NCT07064473",
        title: "Vicadrostat + empagliflozin vs placebo + empagliflozin in type 2 diabetes, hypertension and established cardiovascular disease (EASi-PROTKT)",
        status: "Recruiting",
        phase: "Phase 3",
        sponsor: "Boehringer Ingelheim",
        enrollment: 11800,
        startDate: "2025-07-22",
        primaryCompletion: "2029-12-14",
        sites: 1143,
    },
    {
        nctId: "NCT05633810",
        title: "Colchicine and non-enteric coated aspirin in the cardiovascular outcomes trial of patients with type 2 diabetes (COLCOT-T2D)",
        status: "Recruiting",
        phase: "Phase 3",
        sponsor: "Montreal Heart Institute",
        enrollment: 10000,
        startDate: "2022-12-21",
        primaryCompletion: "2027-12",
        sites: 39,
    },
    {
        nctId: "NCT07662135",
        title: "Elecoglipron vs placebo in adults with type 2 diabetes and impaired renal function on background dapagliflozin (Eluminate-4)",
        status: "Recruiting",
        phase: "Phase 3",
        sponsor: "AstraZeneca",
        enrollment: 900,
        startDate: "2026-07-06",
        primaryCompletion: "2028-07-13",
        sites: 186,
    },
    {
        nctId: "NCT04602754",
        title: "Berlim 25/20 association in the treatment of type 2 diabetes mellitus and dyslipidaemia",
        status: "Recruiting",
        phase: "Phase 3",
        sponsor: "EMS",
        enrollment: 228,
        startDate: "2023-12-01",
        primaryCompletion: "2026-05",
        sites: 1,
    },
    {
        nctId: "NCT07379333",
        title: "HM11260C in patients with type 2 diabetes inadequately controlled with metformin and dapagliflozin",
        status: "Recruiting",
        phase: "Phase 3",
        sponsor: "Hanmi Pharmaceutical",
        enrollment: 118,
        startDate: "2026-04-13",
        primaryCompletion: "2027-11",
        sites: 1,
    },
    {
        nctId: "NCT06192693",
        title: "Faecal microbiota transfer to improve diabetes control post-bariatric surgery",
        status: "Recruiting",
        phase: "Phase 3",
        sponsor: "Assistance Publique – Hôpitaux de Paris",
        enrollment: 54,
        startDate: "2024-01-21",
        primaryCompletion: "2029-02",
        sites: 1,
    },
];

export interface OpenQuestion {
    question: string;
    why: string;
    citationId?: string;
}

export const openQuestions: OpenQuestion[] = [
    {
        question: "Does improving HbA1c quickly ever make microvascular outcomes worse before making them better?",
        why: "This model says no by construction: lower updated mean HbA1c always lowers microvascular hazard. Real-world tirzepatide data shows increased odds of new proliferative retinopathy in exposed patients, concentrated in those with existing retinopathy. Early worsening is a documented phenomenon that a monotonic model cannot express.",
        citationId: "buckley2025",
    },
    {
        question: "Should a virtual patient be a point estimate or a distribution?",
        why: "Discrete subtyping of type 2 diabetes is attractive for simulation because it gives you clean archetypes to instantiate. But subtype assignment carries substantial uncertainty, and individualised prediction may outperform it. The cohort mode here takes the distribution side of that argument.",
        citationId: "mori2026",
    },
    {
        question: "How far does a trial-derived effect size travel outside its trial population?",
        why: "The lifestyle arm is the worked example: a 58% reduction in diabetes incidence among people with prediabetes says nothing rigorous about HbA1c trajectory in someone who already has the disease. Most simulation error is this kind of quiet population transfer, not arithmetic.",
        citationId: "dpp2002",
    },
    {
        question: "What absolute baseline risk should a relative-risk model be anchored to?",
        why: "UKPDS 35 gives risk ratios per 1% HbA1c, not annual absolute rates. Every cumulative incidence curve in this tool therefore rests on an anchor that no cited source supplies. The sensitivity panel exists mainly to keep that visible.",
        citationId: "ukpds35",
    },
];

export const mechanismNotes = [
    {
        heading: "Progressive β-cell failure",
        body: "Type 2 diabetes is not a fixed state that therapy holds still. Glycaemic control deteriorates over time on stable monotherapy, and the rate of deterioration varies substantially between individuals — this is the quantity Wallace and Matthews formalised as a coefficient of failure, and it is the engine of the trajectory in this model.",
    },
    {
        heading: "Glycaemic exposure, not a snapshot",
        body: "UKPDS 35 related complications to updated mean HbA1c — cumulative exposure over follow-up — rather than a single reading. The model follows that convention: hazard at year t is a function of the running mean, so a patient who starts high and improves is not treated the same as one who was always at target.",
    },
    {
        heading: "Monotherapy durability differs by agent",
        body: "ADOPT showed cumulative monotherapy failure at five years ranging from 15% to 34% depending on the agent. Treating all glucose-lowering therapy as an equivalent one-off level shift would erase that, so arms here carry both a shift and a drift multiplier.",
    },
];
