import {
    asArray,
    asNumber,
    asRecord,
    asString,
    asStrings,
    at,
    fetchJson,
    qs,
    SourceError,
} from "./http";
import type { Paper, PaperPage } from "./types";

export type LiteratureSort = "relevance" | "newest" | "cited";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
// Identifies the caller to NCBI, as its usage policy asks.
const NCBI_TOOL = "medbase-lab";

const yearFrom = (s: string | undefined) => {
    const m = s?.match(/\b(1[89]\d{2}|20\d{2})\b/);
    return m ? Number(m[1]) : undefined;
};

/* ---------------------------------- PubMed ---------------------------------- */

export const pubmedSearchUrl = (term: string, sort: LiteratureSort, retmax: number) =>
    `${EUTILS}/esearch.fcgi?${qs({
        db: "pubmed",
        term,
        retmode: "json",
        retmax,
        // PubMed has no citation-count sort; "cited" falls back to relevance.
        sort: sort === "newest" ? "pub_date" : "relevance",
        tool: NCBI_TOOL,
    })}`;

export const pubmedSummaryUrl = (ids: string[]) =>
    `${EUTILS}/esummary.fcgi?${qs({ db: "pubmed", id: ids.join(","), retmode: "json", tool: NCBI_TOOL })}`;

export const parsePubmedSearch = (json: unknown) => {
    const r = asRecord(at(json, "esearchresult"));
    if (!r) throw new SourceError("parse", "PubMed returned no search result block.");
    const error = asString(r.ERROR) ?? asString(r.error);
    if (error) throw new SourceError("http", `PubMed rejected the query: ${error}`);
    return {
        total: asNumber(r.count) ?? 0,
        ids: asStrings(r.idlist),
        interpretedAs: asString(r.querytranslation),
    };
};

/** NCBI summaries list authors as "Surname AB"; three plus "et al." is the citation norm. */
const shortAuthors = (names: string[]) =>
    names.length === 0
        ? "No authors listed"
        : names.length > 3
          ? `${names.slice(0, 3).join(", ")}, et al.`
          : names.join(", ");

export const parsePubmedSummary = (json: unknown, order: string[]): Paper[] => {
    const result = asRecord(at(json, "result"));
    if (!result) return [];
    const uids = order.length ? order : asStrings(result.uids);

    return uids.flatMap((uid) => {
        const doc = asRecord(result[uid]);
        if (!doc || doc.error) return [];
        const ids = asArray(doc.articleids).map(asRecord);
        const idOf = (type: string) =>
            asString(ids.find((i) => asString(i?.idtype) === type)?.value);
        const authorNames = asArray(doc.authors)
            .map((a) => asString(asRecord(a)?.name))
            .filter((n): n is string => Boolean(n));
        const pmcid = idOf("pmc");
        return [
            {
                id: `pubmed:${uid}`,
                title: asString(doc.title)?.replace(/\.$/, "") ?? "Untitled record",
                authors: shortAuthors(authorNames),
                authorList: authorNames,
                journal: asString(doc.fulljournalname) ?? asString(doc.source),
                year: yearFrom(asString(doc.sortpubdate) ?? asString(doc.pubdate)),
                pmid: uid,
                pmcid: pmcid?.startsWith("PMC") ? pmcid : undefined,
                doi: idOf("doi"),
                pubTypes: asStrings(doc.pubtype),
                // PubMed's summary carries no free-full-text flag; a PMC ID is the closest proxy.
                openAccess: pmcid ? true : undefined,
                url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
            } satisfies Paper,
        ];
    });
};

export const searchPubMed = async (
    term: string,
    { sort = "relevance", retmax = 20, signal }: { sort?: LiteratureSort; retmax?: number; signal?: AbortSignal } = {},
): Promise<PaperPage> => {
    const search = parsePubmedSearch(await fetchJson(pubmedSearchUrl(term, sort, retmax), { signal }));
    if (search.ids.length === 0) return { total: search.total, papers: [], interpretedAs: search.interpretedAs };
    const summary = await fetchJson(pubmedSummaryUrl(search.ids), { signal });
    return {
        total: search.total,
        papers: parsePubmedSummary(summary, search.ids),
        interpretedAs: search.interpretedAs,
    };
};

export const pubmedWebUrl = (term: string, sort: LiteratureSort = "relevance") =>
    `https://pubmed.ncbi.nlm.nih.gov/?${qs({ term, sort: sort === "newest" ? "date" : undefined })}`;

/* -------------------------------- Europe PMC -------------------------------- */

const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

export const europePmcSearchUrl = (query: string, sort: LiteratureSort, pageSize: number) =>
    `${EPMC}?${qs({
        query,
        format: "json",
        resultType: "lite",
        pageSize,
        sort: sort === "cited" ? "CITED desc" : sort === "newest" ? "P_PDATE_D desc" : undefined,
    })}`;

export const parseEuropePmc = (json: unknown): PaperPage => {
    const root = asRecord(json);
    if (!root) throw new SourceError("parse", "Europe PMC returned an empty response.");
    const results = asArray(at(root, "resultList.result"));

    const papers = results.flatMap((raw): Paper[] => {
        const r = asRecord(raw);
        const id = asString(r?.id);
        const source = asString(r?.source);
        if (!r || !id || !source) return [];
        const pmid = asString(r.pmid);
        const authorList = (asString(r.authorString) ?? "")
            .replace(/\.$/, "")
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean);
        return [
            {
                id: `epmc:${source}:${id}`,
                title: asString(r.title)?.replace(/\.$/, "") ?? "Untitled record",
                authors: shortAuthors(authorList),
                authorList,
                journal: asString(r.journalTitle) ?? asString(r.bookOrReportDetails),
                year: asNumber(r.pubYear) ?? yearFrom(asString(r.firstPublicationDate)),
                pmid,
                pmcid: asString(r.pmcid),
                doi: asString(r.doi),
                pubTypes: (asString(r.pubType) ?? "")
                    .split(";")
                    .map((s) => s.trim())
                    .filter(Boolean),
                citedBy: asNumber(r.citedByCount),
                openAccess: asString(r.isOpenAccess) === "Y",
                preprint: source === "PPR",
                url: `https://europepmc.org/article/${source}/${id}`,
            },
        ];
    });

    return { total: asNumber(root.hitCount) ?? papers.length, papers };
};

export const searchEuropePmc = async (
    query: string,
    { sort = "relevance", pageSize = 20, signal }: { sort?: LiteratureSort; pageSize?: number; signal?: AbortSignal } = {},
): Promise<PaperPage> => parseEuropePmc(await fetchJson(europePmcSearchUrl(query, sort, pageSize), { signal }));

export const europePmcWebUrl = (query: string) =>
    `https://europepmc.org/search?${qs({ query })}`;
