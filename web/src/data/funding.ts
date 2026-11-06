export interface Funder {
    name: string;
    region: string;
    focus: string;
    relevance: string;
    url: string;
}

/**
 * A curated starting list, not a database. Links were written by hand and were not
 * machine-verified in this build — check before relying on any of them.
 */
export const funders: Funder[] = [
    {
        name: "Indian Council of Medical Research (ICMR)",
        region: "India",
        focus: "Biomedical and clinical research, extramural grants, task-force studies",
        relevance:
            "Principal Indian funder for clinical and epidemiological work, including the national diabetes programmes that generate the cohort data a model like this needs to be calibrated against.",
        url: "https://www.icmr.gov.in",
    },
    {
        name: "Department of Biotechnology (DBT)",
        region: "India",
        focus: "Biotechnology, computational biology, translational research",
        relevance:
            "Funds computational and systems-biology work — the route by which a pathway-level model would be resourced rather than a purely clinical one.",
        url: "https://dbtindia.gov.in",
    },
    {
        name: "NIDDK (National Institutes of Health)",
        region: "United States",
        focus: "Diabetes, digestive and kidney disease research",
        relevance:
            "Funded the Diabetes Prevention Program, one of the trials cited by this model. Its data-repository policies also govern access to several of the cohorts used for calibration.",
        url: "https://www.niddk.nih.gov",
    },
    {
        name: "Wellcome",
        region: "United Kingdom / global",
        focus: "Discovery research, population health, data for science",
        relevance:
            "Supports open data-science and population-health infrastructure, including the kind of longitudinal cohort resources needed to validate a progression model rather than merely parameterise one.",
        url: "https://wellcome.org",
    },
    {
        name: "TDR — Special Programme for Research and Training in Tropical Diseases",
        region: "Global (WHO-hosted)",
        focus: "Implementation research in low- and middle-income settings",
        relevance:
            "Relevant when a model's transportability is the research question — TDR work focuses on settings where parameters derived from European and North American cohorts are least likely to hold.",
        url: "https://tdr.who.int",
    },
    {
        name: "Horizon Europe",
        region: "European Union",
        focus: "Collaborative research and innovation, health cluster",
        relevance:
            "Main EU instrument for multi-site consortia; the health cluster explicitly funds in-silico modelling and digital-twin methodology.",
        url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home",
    },
];
