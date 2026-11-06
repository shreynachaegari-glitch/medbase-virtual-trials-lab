import { asArray, asNumber, asRecord, asString, asStrings, at, fetchJson, qs, SourceError } from "./http";
import type { AdverseEventSummary, Compound, DrugLabel } from "./types";

const OPENFDA = "https://api.fda.gov/drug";

/** openFDA's query language breaks on quotes and colons inside a term, so they are removed. */
const cleanTerm = (name: string) => name.replace(/["\\:]/g, " ").replace(/\s+/g, " ").trim();

/* ------------------------------ openFDA labels ------------------------------ */

export const drugLabelUrl = (name: string) => {
    const t = cleanTerm(name);
    return `${OPENFDA}/label.json?${qs({
        search: `openfda.generic_name:"${t}" OR openfda.brand_name:"${t}" OR openfda.substance_name:"${t}"`,
        limit: 10,
    })}`;
};

/**
 * Label sections open with their own numbered heading ("1 INDICATIONS AND USAGE …"), which
 * the panel already shows. Only that known heading is removed — a looser pattern would also
 * eat a brand name written in capitals straight after it.
 */
const firstText = (v: unknown, pattern: RegExp) =>
    asStrings(v)[0]?.replace(pattern, "").trim() || undefined;

const heading = (words: string) =>
    new RegExp(`^\\s*(\\d+(\\.\\d+)*\\s*)?${words}:?\\s*`, "i");

const HEADINGS = {
    indications: heading("INDICATIONS?\\s*(AND|&)\\s*USAGE"),
    boxedWarning: heading("BOXED\\s+WARNING"),
    mechanism: heading("MECHANISM\\s+OF\\s+ACTION"),
    contraindications: heading("CONTRAINDICATIONS"),
};

const toLabel = (r: Record<string, unknown>): DrugLabel => {
    const o = asRecord(r.openfda) ?? {};
    return {
        setId: asString(r.set_id),
        brandNames: asStrings(o.brand_name),
        genericNames: asStrings(o.generic_name),
        manufacturer: asStrings(o.manufacturer_name)[0],
        pharmClasses: [...asStrings(o.pharm_class_epc), ...asStrings(o.pharm_class_moa)],
        routes: asStrings(o.route),
        rxcui: asStrings(o.rxcui),
        indications: firstText(r.indications_and_usage, HEADINGS.indications),
        boxedWarning: firstText(r.boxed_warning, HEADINGS.boxedWarning),
        mechanism: firstText(r.mechanism_of_action, HEADINGS.mechanism),
        contraindications: firstText(r.contraindications, HEADINGS.contraindications),
        effectiveDate: asString(r.effective_time),
    };
};

/**
 * A search for "metformin" returns every combination product that contains it. The label
 * that describes the drug itself is the one whose generic name *is* the query (allowing for a
 * salt suffix) and which lists a single active substance, so that one is preferred.
 */
const labelScore = (label: DrugLabel, raw: Record<string, unknown>, query: string) => {
    const q = query.toLowerCase();
    const generics = label.genericNames.map((g) => g.toLowerCase());
    const substances = asStrings(at(raw, "openfda.substance_name"));
    let score = 0;
    if (generics.some((g) => g === q)) score += 8;
    else if (generics.some((g) => g.startsWith(`${q} `))) score += 6;
    if (label.brandNames.some((b) => b.toLowerCase() === q)) score += 5;
    if (substances.length === 1) score += 3;
    if (label.indications) score += 1;
    if (label.mechanism) score += 1;
    return score;
};

export const parseDrugLabels = (json: unknown, query: string): DrugLabel | null => {
    const results = asArray(at(json, "results"))
        .map(asRecord)
        .filter((r): r is Record<string, unknown> => Boolean(r));
    if (results.length === 0) return null;
    const ranked = results
        .map((raw) => ({ raw, label: toLabel(raw) }))
        .map((x) => ({ ...x, score: labelScore(x.label, x.raw, cleanTerm(query)) }))
        .sort((a, b) => b.score - a.score);
    return ranked[0].label;
};

export const getDrugLabel = async (name: string, signal?: AbortSignal) => {
    try {
        return parseDrugLabels(await fetchJson(drugLabelUrl(name), { signal }), name);
    } catch (e) {
        // openFDA answers a search with no matches with 404.
        if (e instanceof SourceError && e.kind === "not-found") return null;
        throw e;
    }
};

/* --------------------------- openFDA FAERS reports --------------------------- */

const eventSearch = (name: string) => `patient.drug.openfda.generic_name:"${cleanTerm(name)}"`;

export const adverseEventCountUrl = (name: string, limit = 12) =>
    `${OPENFDA}/event.json?${qs({
        search: eventSearch(name),
        count: "patient.reaction.reactionmeddrapt.exact",
        limit,
    })}`;

export const adverseEventTotalUrl = (name: string) =>
    `${OPENFDA}/event.json?${qs({ search: eventSearch(name), limit: 1 })}`;

export const parseReactionCounts = (json: unknown) =>
    asArray(at(json, "results")).flatMap((raw) => {
        const r = asRecord(raw);
        const term = asString(r?.term);
        const count = asNumber(r?.count);
        return term && count !== undefined ? [{ term, count }] : [];
    });

export const parseReportTotal = (json: unknown) => asNumber(at(json, "meta.results.total")) ?? 0;

export const getAdverseEvents = async (
    name: string,
    signal?: AbortSignal,
): Promise<AdverseEventSummary | null> => {
    try {
        const [counts, total] = await Promise.all([
            fetchJson(adverseEventCountUrl(name), { signal }),
            fetchJson(adverseEventTotalUrl(name), { signal }),
        ]);
        return { reactions: parseReactionCounts(counts), totalReports: parseReportTotal(total) };
    } catch (e) {
        if (e instanceof SourceError && e.kind === "not-found") return null;
        throw e;
    }
};

export const dailyMedUrl = (setId: string) =>
    `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${encodeURIComponent(setId)}`;

export const openFdaLabelWebUrl = (name: string) =>
    `https://dailymed.nlm.nih.gov/dailymed/search.cfm?${qs({ query: name })}`;

/* --------------------------------- PubChem --------------------------------- */

const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const PROPS = "MolecularFormula,MolecularWeight,IUPACName,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount";

export const compoundUrl = (name: string) =>
    `${PUG}/compound/name/${encodeURIComponent(name.trim())}/property/${PROPS}/JSON`;

export const parseCompound = (json: unknown): Compound | null => {
    const p = asRecord(asArray(at(json, "PropertyTable.Properties"))[0]);
    const cid = asNumber(p?.CID);
    if (!p || cid === undefined) return null;
    return {
        cid,
        formula: asString(p.MolecularFormula),
        // PubChem returns weight as a string in current responses and a number in older ones.
        molecularWeight: asNumber(p.MolecularWeight),
        iupacName: asString(p.IUPACName),
        xlogp: asNumber(p.XLogP),
        tpsa: asNumber(p.TPSA),
        hBondDonors: asNumber(p.HBondDonorCount),
        hBondAcceptors: asNumber(p.HBondAcceptorCount),
    };
};

export const getCompound = async (name: string, signal?: AbortSignal) => {
    try {
        return parseCompound(await fetchJson(compoundUrl(name), { signal }));
    } catch (e) {
        if (e instanceof SourceError && (e.kind === "not-found" || e.status === 400)) return null;
        throw e;
    }
};

export const compoundImageUrl = (cid: number, size = 320) =>
    `${PUG}/compound/cid/${cid}/PNG?image_size=${size}x${size}`;

export const compoundWebUrl = (cid: number) => `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
