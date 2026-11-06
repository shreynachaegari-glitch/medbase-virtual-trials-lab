export interface Citation {
    id: string;
    short: string;
    authors: string;
    title: string;
    journal: string;
    year: number;
    pmid: string;
    doi: string;
}

export const citations: Record<string, Citation> = {
    ukpds35: {
        id: "ukpds35",
        short: "UKPDS 35",
        authors: "Stratton IM, Adler AI, Neil HAW, et al.",
        title: "Association of glycaemia with macrovascular and microvascular complications of type 2 diabetes (UKPDS 35): prospective observational study",
        journal: "BMJ",
        year: 2000,
        pmid: "10938048",
        doi: "10.1136/bmj.321.7258.405",
    },
    wallace2002: {
        id: "wallace2002",
        short: "Wallace & Matthews 2002",
        authors: "Wallace TM, Matthews DR",
        title: "Coefficient of failure: a methodology for examining longitudinal beta-cell function in Type 2 diabetes",
        journal: "Diabetic Medicine",
        year: 2002,
        pmid: "12060057",
        doi: "10.1046/j.1464-5491.2002.00718.x",
    },
    hirst2012: {
        id: "hirst2012",
        short: "Hirst et al. 2012",
        authors: "Hirst JA, Farmer AJ, Ali R, Roberts NW, Stevens RJ",
        title: "Quantifying the effect of metformin treatment and dose on glycemic control",
        journal: "Diabetes Care",
        year: 2012,
        pmid: "22275444",
        doi: "10.2337/dc11-1465",
    },
    dpp2002: {
        id: "dpp2002",
        short: "DPP 2002",
        authors: "Knowler WC, Barrett-Connor E, Fowler SE, et al.",
        title: "Reduction in the incidence of type 2 diabetes with lifestyle intervention or metformin",
        journal: "New England Journal of Medicine",
        year: 2002,
        pmid: "11832527",
        doi: "10.1056/NEJMoa012512",
    },
    adopt2006: {
        id: "adopt2006",
        short: "ADOPT 2006",
        authors: "Kahn SE, Haffner SM, Heise MA, et al.",
        title: "Glycemic durability of rosiglitazone, metformin, or glyburide monotherapy",
        journal: "New England Journal of Medicine",
        year: 2006,
        pmid: "17145742",
        doi: "10.1056/NEJMoa066224",
    },
    buckley2025: {
        id: "buckley2025",
        short: "Buckley et al. 2025",
        authors: "Buckley AJ, Tan GD, Gruszka-Goh M, et al.",
        title: "Early worsening of diabetic retinopathy in individuals with type 2 diabetes treated with tirzepatide: a real-world cohort study",
        journal: "Diabetologia",
        year: 2025,
        pmid: "40637847",
        doi: "10.1007/s00125-025-06466-8",
    },
    mori2026: {
        id: "mori2026",
        short: "Mori et al. 2026",
        authors: "Mori T, Herder C, Cardoso P, Dennis JM, Kuß O",
        title: "Type 2 diabetes subtypes for precision medicine: methodological challenges and alternative prediction-based approaches",
        journal: "Diabetologia",
        year: 2026,
        pmid: "42502138",
        doi: "10.1007/s00125-026-06802-6",
    },
};

export const pubmedUrl = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
export const doiUrl = (doi: string) => `https://doi.org/${doi}`;
