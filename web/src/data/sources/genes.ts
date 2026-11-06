import { asArray, asNumber, asRecord, asString, asStrings, at, fetchJson, qs, SourceError } from "./http";
import type { Gene, Protein, TargetAssociations } from "./types";

/** Gene symbols are letters, digits and a few separators; anything else is dropped. */
export const cleanSymbol = (s: string) => s.trim().replace(/[^A-Za-z0-9\-_.]/g, "");

/* -------------------------------- MyGene.info -------------------------------- */

const MYGENE = "https://mygene.info/v3/query";

export const geneUrl = (symbol: string) =>
    `${MYGENE}?${qs({
        q: `symbol:${cleanSymbol(symbol)}`,
        species: "human",
        fields: "symbol,name,summary,entrezgene,alias,map_location,type_of_gene,genomic_pos.chr,ensembl.gene",
        size: 1,
    })}`;

export const parseGene = (json: unknown): Gene | null => {
    const hit = asRecord(asArray(at(json, "hits"))[0]);
    const symbol = asString(hit?.symbol);
    if (!hit || !symbol) return null;
    // MyGene returns an object when there is one Ensembl mapping and an array when there are
    // several; the first primary-assembly gene is the one to follow.
    const ensembl = asArray(hit.ensembl).map((e) => asString(asRecord(e)?.gene))[0];
    const chr = asArray(hit.genomic_pos).map((g) => asString(asRecord(g)?.chr))[0];
    return {
        entrezId: asString(hit.entrezgene) ?? asString(hit._id),
        symbol,
        name: asString(hit.name),
        summary: asString(hit.summary),
        aliases: asStrings(hit.alias),
        location: asString(hit.map_location),
        chromosome: chr,
        typeOfGene: asString(hit.type_of_gene),
        ensemblId: ensembl,
    };
};

export const getGene = async (symbol: string, signal?: AbortSignal) =>
    parseGene(await fetchJson(geneUrl(symbol), { signal }));

export const ncbiGeneUrl = (entrezId: string) => `https://www.ncbi.nlm.nih.gov/gene/${entrezId}`;

/* ---------------------------------- UniProt ---------------------------------- */

const UNIPROT = "https://rest.uniprot.org/uniprotkb/search";

export const proteinUrl = (symbol: string, withFields = true) =>
    `${UNIPROT}?${qs({
        query: `gene_exact:${cleanSymbol(symbol)} AND organism_id:9606 AND reviewed:true`,
        format: "json",
        size: 1,
        fields: withFields
            ? "accession,id,protein_name,gene_names,cc_function,cc_subcellular_location,cc_disease,length"
            : undefined,
    })}`;

/** UniProt free text carries inline evidence tags like "(PubMed:12345, PubMed:67890)". */
const stripEvidence = (s: string) =>
    s
        .replace(/\s*\((?:PubMed|By similarity|Ref\.\d+)[^)]*\)/g, "")
        .replace(/\s+\./g, ".")
        .trim();

export const parseProtein = (json: unknown): Protein | null => {
    const r = asRecord(asArray(at(json, "results"))[0]);
    const accession = asString(r?.primaryAccession);
    if (!r || !accession) return null;
    const comments = asArray(r.comments).map(asRecord);
    const ofType = (t: string) => comments.filter((c) => asString(c?.commentType) === t);

    const fn = ofType("FUNCTION")
        .flatMap((c) => asArray(c?.texts))
        .map((t) => asString(asRecord(t)?.value))
        .filter((s): s is string => Boolean(s))
        .map(stripEvidence)
        .join(" ");

    const locations = ofType("SUBCELLULAR LOCATION")
        .flatMap((c) => asArray(c?.subcellularLocations))
        .map((l) => asString(at(l, "location.value")))
        .filter((s): s is string => Boolean(s));

    const diseases = ofType("DISEASE").flatMap((c) => {
        const name = asString(at(c, "disease.diseaseId"));
        return name ? [{ name, acronym: asString(at(c, "disease.acronym")) }] : [];
    });

    return {
        accession,
        entryName: asString(r.uniProtkbId),
        name:
            asString(at(r, "proteinDescription.recommendedName.fullName.value")) ??
            asString(at(asArray(at(r, "proteinDescription.submissionNames"))[0], "fullName.value")),
        geneNames: asArray(r.genes)
            .map((g) => asString(at(g, "geneName.value")))
            .filter((s): s is string => Boolean(s)),
        function: fn || undefined,
        locations: [...new Set(locations)],
        diseases,
        length: asNumber(at(r, "sequence.length")),
    };
};

export const getProtein = async (symbol: string, signal?: AbortSignal) => {
    try {
        return parseProtein(await fetchJson(proteinUrl(symbol), { signal }));
    } catch (e) {
        if (e instanceof SourceError && e.status === 400) {
            return parseProtein(await fetchJson(proteinUrl(symbol, false), { signal }));
        }
        throw e;
    }
};

export const uniprotWebUrl = (accession: string) => `https://www.uniprot.org/uniprotkb/${accession}/entry`;

/* -------------------------------- Open Targets -------------------------------- */

const OPEN_TARGETS = "https://api.platform.opentargets.org/api/v4/graphql";

export const TARGET_ASSOCIATIONS_QUERY = `query TargetAssociations($ensemblId: String!, $size: Int!) {
  target(ensemblId: $ensemblId) {
    id
    approvedSymbol
    associatedDiseases(page: { index: 0, size: $size }) {
      count
      rows { score disease { id name } }
    }
  }
}`;

export const parseTargetAssociations = (json: unknown, ensemblId: string): TargetAssociations | null => {
    const errors = asArray(at(json, "errors"));
    if (errors.length) {
        const msg = asString(asRecord(errors[0])?.message) ?? "unknown error";
        throw new SourceError("http", `Open Targets rejected the query: ${msg}`);
    }
    const target = asRecord(at(json, "data.target"));
    if (!target) return null;
    const rows = asArray(at(target, "associatedDiseases.rows")).flatMap((raw) => {
        const r = asRecord(raw);
        const diseaseId = asString(at(r, "disease.id"));
        const diseaseName = asString(at(r, "disease.name"));
        const score = asNumber(r?.score);
        return diseaseId && diseaseName && score !== undefined ? [{ diseaseId, diseaseName, score }] : [];
    });
    return {
        ensemblId: asString(target.id) ?? ensemblId,
        symbol: asString(target.approvedSymbol),
        total: asNumber(at(target, "associatedDiseases.count")) ?? rows.length,
        rows,
    };
};

export const getTargetAssociations = async (ensemblId: string, signal?: AbortSignal, size = 12) =>
    parseTargetAssociations(
        await fetchJson(OPEN_TARGETS, {
            signal,
            init: {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: TARGET_ASSOCIATIONS_QUERY, variables: { ensemblId, size } }),
            },
        }),
        ensemblId,
    );

export const openTargetsWebUrl = (ensemblId: string) =>
    `https://platform.opentargets.org/target/${ensemblId}/associations`;

export const openTargetsDiseaseUrl = (diseaseId: string) =>
    `https://platform.opentargets.org/disease/${diseaseId}`;
