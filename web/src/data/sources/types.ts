/** Normalised shapes every panel renders, whichever database a record came from. */

export interface Paper {
    /** Stable key within one result list. */
    id: string;
    title: string;
    /** Display form: up to three names, then "et al." */
    authors: string;
    /** Every author the database returned, for citation export. */
    authorList: string[];
    journal?: string;
    year?: number;
    pmid?: string;
    pmcid?: string;
    doi?: string;
    pubTypes: string[];
    citedBy?: number;
    openAccess?: boolean;
    preprint?: boolean;
    /** Where to read it on the source site. */
    url: string;
}

export interface PaperPage {
    total: number;
    papers: Paper[];
    /** The query as the database interpreted it, when it reports one. */
    interpretedAs?: string;
}

export interface Trial {
    nctId: string;
    title: string;
    status?: string;
    phases: string[];
    studyType?: string;
    enrollment?: number;
    sponsor?: string;
    startDate?: string;
    primaryCompletion?: string;
    conditions: string[];
    interventions: string[];
    countries: string[];
    siteCount?: number;
}

export interface TrialPage {
    total: number;
    trials: Trial[];
}

export interface DrugLabel {
    setId?: string;
    brandNames: string[];
    genericNames: string[];
    manufacturer?: string;
    pharmClasses: string[];
    routes: string[];
    rxcui: string[];
    indications?: string;
    boxedWarning?: string;
    mechanism?: string;
    contraindications?: string;
    effectiveDate?: string;
}

export interface ReactionCount {
    term: string;
    count: number;
}

export interface AdverseEventSummary {
    totalReports: number;
    reactions: ReactionCount[];
}

export interface Compound {
    cid: number;
    formula?: string;
    molecularWeight?: number;
    iupacName?: string;
    xlogp?: number;
    tpsa?: number;
    hBondDonors?: number;
    hBondAcceptors?: number;
}

export interface Gene {
    entrezId?: string;
    symbol: string;
    name?: string;
    summary?: string;
    aliases: string[];
    location?: string;
    chromosome?: string;
    typeOfGene?: string;
    ensemblId?: string;
}

export interface Protein {
    accession: string;
    entryName?: string;
    name?: string;
    geneNames: string[];
    function?: string;
    locations: string[];
    diseases: { name: string; acronym?: string }[];
    length?: number;
}

export interface TargetAssociation {
    diseaseId: string;
    diseaseName: string;
    score: number;
}

export interface TargetAssociations {
    ensemblId: string;
    symbol?: string;
    total: number;
    rows: TargetAssociation[];
}
