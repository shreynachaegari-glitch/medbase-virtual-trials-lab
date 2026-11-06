/**
 * The databases the Lab queries live, with what each is trusted for and what it is not.
 *
 * These feed the Lab's data panels only. Nothing retrieved from them is ever wired into the
 * simulation: a live search result has not been read, appraised or checked, and the model's
 * parameters stay fixed to the papers in src/sim/citations.ts.
 */

export type DatabaseCategory = "literature" | "trials" | "drugs" | "genes";

export interface DatabaseInfo {
    id: string;
    name: string;
    provider: string;
    category: DatabaseCategory;
    homepage: string;
    docs: string;
    /** What the Lab asks it for. */
    usedFor: string;
    /** The limit a reader is most likely to trip over in the browser. */
    limits: string;
    /** The one thing to keep in mind before reading its output as evidence. */
    caveat: string;
}

export const categoryLabel: Record<DatabaseCategory, string> = {
    literature: "Literature",
    trials: "Clinical trials",
    drugs: "Drugs & compounds",
    genes: "Genes & targets",
};

export const databases: DatabaseInfo[] = [
    {
        id: "pubmed",
        name: "PubMed",
        provider: "NCBI, U.S. National Library of Medicine",
        category: "literature",
        homepage: "https://pubmed.ncbi.nlm.nih.gov/",
        docs: "https://www.ncbi.nlm.nih.gov/books/NBK25501/",
        usedFor: "Biomedical literature search via E-utilities (esearch + esummary).",
        limits: "3 requests/second without an API key; requests are spaced automatically.",
        caveat: "Indexing is not appraisal — a hit is a paper that matches the query, not one that supports it.",
    },
    {
        id: "europepmc",
        name: "Europe PMC",
        provider: "EMBL-EBI",
        category: "literature",
        homepage: "https://europepmc.org/",
        docs: "https://europepmc.org/RestfulWebService",
        usedFor: "Literature search with citation counts, open-access flags and preprints.",
        limits: "No key required; fair use.",
        caveat: "Citation counts measure attention, not correctness, and lag for recent papers. Preprints are not peer reviewed.",
    },
    {
        id: "clinicaltrials",
        name: "ClinicalTrials.gov",
        provider: "U.S. National Library of Medicine",
        category: "trials",
        homepage: "https://clinicaltrials.gov/",
        docs: "https://clinicaltrials.gov/data-api/api",
        usedFor: "Registered studies by condition, status and phase (API v2).",
        limits: "About 50 requests/minute per IP.",
        caveat: "Registry entries are sponsor-submitted and often stale; status and enrolment are as last reported, not verified.",
    },
    {
        id: "openfda-label",
        name: "openFDA — drug labels",
        provider: "U.S. Food and Drug Administration",
        category: "drugs",
        homepage: "https://open.fda.gov/",
        docs: "https://open.fda.gov/apis/drug/label/",
        usedFor: "Structured Product Labeling: indications, boxed warnings, mechanism, pharmacological class.",
        limits: "240 requests/minute and 1,000/day per IP without a key.",
        caveat: "U.S. labelling only; many labels exist per ingredient, and the one shown is the closest single-ingredient match.",
    },
    {
        id: "openfda-faers",
        name: "openFDA — FAERS",
        provider: "U.S. Food and Drug Administration",
        category: "drugs",
        homepage: "https://open.fda.gov/",
        docs: "https://open.fda.gov/apis/drug/event/",
        usedFor: "Counts of spontaneously reported adverse-event terms.",
        limits: "Shares openFDA's per-IP limits.",
        caveat: "Report counts are not incidence and do not establish causation. They track prescribing volume and reporting behaviour as much as harm.",
    },
    {
        id: "pubchem",
        name: "PubChem",
        provider: "NCBI, U.S. National Library of Medicine",
        category: "drugs",
        homepage: "https://pubchem.ncbi.nlm.nih.gov/",
        docs: "https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest",
        usedFor: "Chemical identity and computed properties (formula, weight, XLogP, TPSA).",
        limits: "5 requests/second; requests are spaced automatically.",
        caveat: "Most properties are computed, not measured, and a name can resolve to a salt or mixture rather than the parent compound.",
    },
    {
        id: "mygene",
        name: "MyGene.info",
        provider: "BioThings, Scripps Research",
        category: "genes",
        homepage: "https://mygene.info/",
        docs: "https://docs.mygene.info/",
        usedFor: "Gene identity, location and the NCBI RefSeq summary.",
        limits: "No key required; fair use.",
        caveat: "An aggregator: records are only as current as its last sync from NCBI Gene and Ensembl.",
    },
    {
        id: "uniprot",
        name: "UniProtKB / Swiss-Prot",
        provider: "UniProt Consortium",
        category: "genes",
        homepage: "https://www.uniprot.org/",
        docs: "https://www.uniprot.org/help/api",
        usedFor: "Reviewed human protein function, subcellular location and curated disease links.",
        limits: "No key required; fair use.",
        caveat: "Only the reviewed (Swiss-Prot) entry is queried, so genes without one return nothing here.",
    },
    {
        id: "opentargets",
        name: "Open Targets Platform",
        provider: "Open Targets (EMBL-EBI, Wellcome Sanger Institute, industry partners)",
        category: "genes",
        homepage: "https://platform.opentargets.org/",
        docs: "https://platform-docs.opentargets.org/data-access/graphql-api",
        usedFor: "Target–disease association scores aggregated across genetics, literature and drug evidence.",
        limits: "No key required; fair use.",
        caveat: "An association score ranks evidence volume and type. It is not an effect size and does not establish that the gene causes the disease.",
    },
];

export const databaseById = (id: string) => databases.find((d) => d.id === id)!;
