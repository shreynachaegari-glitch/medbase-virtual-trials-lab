import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSourceCache, fetchJson, SourceError } from "./http";
import {
    europePmcSearchUrl,
    parseEuropePmc,
    parsePubmedSearch,
    parsePubmedSummary,
    pubmedSearchUrl,
    searchPubMed,
} from "./literature";
import { parseTrials, searchTrials, trialsSearchUrl } from "./trials";
import {
    getDrugLabel,
    parseCompound,
    parseDrugLabels,
    parseReactionCounts,
    parseReportTotal,
} from "./drugs";
import { parseGene, parseProtein, parseTargetAssociations, proteinUrl } from "./genes";

/* Fixtures follow each API's documented response shape, trimmed to the fields read. */

const esearch = {
    header: { type: "esearch", version: "0.3" },
    esearchresult: {
        count: "48210",
        retmax: "2",
        retstart: "0",
        idlist: ["10938048", "12060057"],
        querytranslation: '"diabetes mellitus, type 2"[MeSH Terms] OR "type 2 diabetes"[All Fields]',
    },
};

const esummary = {
    header: { type: "esummary", version: "0.3" },
    result: {
        uids: ["12060057", "10938048"],
        "10938048": {
            uid: "10938048",
            pubdate: "2000 Aug 12",
            source: "BMJ",
            authors: [
                { name: "Stratton IM", authtype: "Author" },
                { name: "Adler AI", authtype: "Author" },
                { name: "Neil HA", authtype: "Author" },
                { name: "Holman RR", authtype: "Author" },
            ],
            title: "Association of glycaemia with macrovascular and microvascular complications of type 2 diabetes (UKPDS 35): prospective observational study.",
            pubtype: ["Journal Article", "Multicenter Study"],
            articleids: [
                { idtype: "pubmed", idtypen: 1, value: "10938048" },
                { idtype: "doi", idtypen: 3, value: "10.1136/bmj.321.7258.405" },
                { idtype: "pmc", idtypen: 8, value: "PMC27454" },
            ],
            fulljournalname: "BMJ (Clinical research ed.)",
            sortpubdate: "2000/08/12 00:00",
        },
        "12060057": {
            uid: "12060057",
            pubdate: "2002 Jun",
            source: "Diabet Med",
            authors: [{ name: "Wallace TM" }, { name: "Matthews DR" }],
            title: "Coefficient of failure.",
            pubtype: ["Journal Article"],
            articleids: [{ idtype: "doi", value: "10.1046/j.1464-5491.2002.00718.x" }],
            fulljournalname: "Diabetic medicine",
            sortpubdate: "2002/06/01 00:00",
        },
    },
};

const epmc = {
    version: "6.9",
    hitCount: 91234,
    resultList: {
        result: [
            {
                id: "10938048",
                source: "MED",
                pmid: "10938048",
                pmcid: "PMC27454",
                doi: "10.1136/bmj.321.7258.405",
                title: "Association of glycaemia with macrovascular and microvascular complications of type 2 diabetes (UKPDS 35).",
                authorString: "Stratton IM, Adler AI, Neil HA.",
                journalTitle: "BMJ",
                pubYear: "2000",
                pubType: "research-article; Journal Article",
                isOpenAccess: "Y",
                citedByCount: 6123,
            },
            {
                id: "PPR123456",
                source: "PPR",
                title: "A preprint",
                authorString: "Doe J.",
                pubYear: "2026",
                pubType: "preprint",
                isOpenAccess: "N",
                citedByCount: 0,
            },
            { title: "no id — dropped" },
        ],
    },
};

const ctgov = {
    totalCount: 71,
    studies: [
        {
            protocolSection: {
                identificationModule: { nctId: "NCT07064473", briefTitle: "Vicadrostat + empagliflozin" },
                statusModule: {
                    overallStatus: "RECRUITING",
                    startDateStruct: { date: "2025-07-22", type: "ACTUAL" },
                    primaryCompletionDateStruct: { date: "2029-12-14", type: "ESTIMATED" },
                },
                sponsorCollaboratorsModule: { leadSponsor: { name: "Boehringer Ingelheim", class: "INDUSTRY" } },
                designModule: {
                    studyType: "INTERVENTIONAL",
                    phases: ["PHASE3"],
                    enrollmentInfo: { count: 11800, type: "ESTIMATED" },
                },
                conditionsModule: { conditions: ["Diabetes Mellitus, Type 2"] },
                armsInterventionsModule: {
                    interventions: [{ name: "Vicadrostat" }, { name: "Empagliflozin" }, { name: "Empagliflozin" }],
                },
                contactsLocationsModule: {
                    locations: [{ country: "Germany" }, { country: "Japan" }, { country: "Germany" }],
                },
            },
        },
        { protocolSection: { identificationModule: {} } },
    ],
};

describe("PubMed", () => {
    it("reads the count, IDs and query translation", () => {
        const r = parsePubmedSearch(esearch);
        expect(r.total).toBe(48210);
        expect(r.ids).toEqual(["10938048", "12060057"]);
        expect(r.interpretedAs).toContain("MeSH");
    });

    it("surfaces a query error rather than an empty result", () => {
        expect(() => parsePubmedSearch({ esearchresult: { ERROR: "Invalid query" } })).toThrow(SourceError);
    });

    it("keeps the search order, not the summary's uid order", () => {
        const papers = parsePubmedSummary(esummary, ["10938048", "12060057"]);
        expect(papers.map((p) => p.pmid)).toEqual(["10938048", "12060057"]);
    });

    it("normalises a summary into a citation", () => {
        const [p] = parsePubmedSummary(esummary, ["10938048"]);
        expect(p.title.endsWith(".")).toBe(false);
        expect(p.authors).toBe("Stratton IM, Adler AI, Neil HA, et al.");
        expect(p.year).toBe(2000);
        expect(p.doi).toBe("10.1136/bmj.321.7258.405");
        expect(p.pmcid).toBe("PMC27454");
        expect(p.url).toBe("https://pubmed.ncbi.nlm.nih.gov/10938048/");
    });

    it("skips records NCBI reports as errors", () => {
        const json = { result: { uids: ["1"], "1": { uid: "1", error: "cannot get document summary" } } };
        expect(parsePubmedSummary(json, ["1"])).toEqual([]);
    });

    it("asks PubMed for newest-first when sorting by date", () => {
        expect(pubmedSearchUrl("x", "newest", 5)).toContain("sort=pub_date");
    });
});

describe("Europe PMC", () => {
    it("normalises records and drops ones without an identifier", () => {
        const r = parseEuropePmc(epmc);
        expect(r.total).toBe(91234);
        expect(r.papers).toHaveLength(2);
        expect(r.papers[0]).toMatchObject({ citedBy: 6123, openAccess: true, year: 2000, preprint: false });
        expect(r.papers[1].preprint).toBe(true);
        expect(r.papers[0].url).toBe("https://europepmc.org/article/MED/10938048");
    });

    it("sorts by citations when asked", () => {
        expect(decodeURIComponent(europePmcSearchUrl("x", "cited", 10))).toContain("sort=CITED+desc");
    });
});

describe("ClinicalTrials.gov", () => {
    it("normalises studies and de-duplicates interventions and countries", () => {
        const r = parseTrials(ctgov);
        expect(r.total).toBe(71);
        expect(r.trials).toHaveLength(1);
        expect(r.trials[0]).toMatchObject({
            nctId: "NCT07064473",
            status: "RECRUITING",
            phases: ["PHASE3"],
            enrollment: 11800,
            sponsor: "Boehringer Ingelheim",
            interventions: ["Vicadrostat", "Empagliflozin"],
            countries: ["Germany", "Japan"],
            siteCount: 3,
        });
    });

    it("builds status and phase filters", () => {
        const url = decodeURIComponent(
            trialsSearchUrl({ condition: "type 2 diabetes", status: "recruiting", phase: "PHASE3" }),
        );
        expect(url).toContain("filter.overallStatus=RECRUITING");
        expect(url).toContain("filter.advanced=AREA[Phase]PHASE3");
        expect(url).toContain("countTotal=true");
    });
});

describe("openFDA", () => {
    const labels = {
        meta: { results: { total: 3 } },
        results: [
            {
                set_id: "combo",
                openfda: {
                    generic_name: ["SITAGLIPTIN AND METFORMIN HYDROCHLORIDE"],
                    brand_name: ["JANUMET"],
                    substance_name: ["SITAGLIPTIN", "METFORMIN HYDROCHLORIDE"],
                },
                indications_and_usage: ["1 INDICATIONS AND USAGE JANUMET is indicated…"],
            },
            {
                set_id: "mono",
                effective_time: "20240115",
                openfda: {
                    generic_name: ["METFORMIN HYDROCHLORIDE"],
                    brand_name: ["GLUCOPHAGE"],
                    substance_name: ["METFORMIN HYDROCHLORIDE"],
                    pharm_class_epc: ["Biguanide [EPC]"],
                    route: ["ORAL"],
                },
                indications_and_usage: ["1 INDICATIONS AND USAGE GLUCOPHAGE is indicated as an adjunct to diet"],
                boxed_warning: ["WARNING: LACTIC ACIDOSIS Postmarketing cases…"],
                mechanism_of_action: ["12.1 Mechanism of Action Metformin decreases hepatic glucose production"],
            },
        ],
    };

    it("prefers the single-ingredient label over a combination product", () => {
        const label = parseDrugLabels(labels, "metformin")!;
        expect(label.setId).toBe("mono");
        expect(label.pharmClasses).toEqual(["Biguanide [EPC]"]);
    });

    it("strips the section heading but keeps a capitalised brand name after it", () => {
        const label = parseDrugLabels(labels, "metformin")!;
        expect(label.indications).toBe("GLUCOPHAGE is indicated as an adjunct to diet");
        expect(label.mechanism).toBe("Metformin decreases hepatic glucose production");
        expect(label.boxedWarning).toBe("WARNING: LACTIC ACIDOSIS Postmarketing cases…");
    });

    it("returns null for no results", () => {
        expect(parseDrugLabels({ results: [] }, "x")).toBeNull();
    });

    it("reads reaction counts and the report total", () => {
        expect(
            parseReactionCounts({ results: [{ term: "NAUSEA", count: 120 }, { term: "", count: 1 }] }),
        ).toEqual([{ term: "NAUSEA", count: 120 }]);
        expect(parseReportTotal({ meta: { results: { skip: 0, limit: 1, total: 98765 } } })).toBe(98765);
    });
});

describe("PubChem", () => {
    it("reads properties, including a weight sent as a string", () => {
        const c = parseCompound({
            PropertyTable: {
                Properties: [
                    { CID: 4091, MolecularFormula: "C4H11N5", MolecularWeight: "129.16", XLogP: -1.3, TPSA: 91.5 },
                ],
            },
        });
        expect(c).toEqual(expect.objectContaining({ cid: 4091, molecularWeight: 129.16, xlogp: -1.3 }));
    });

    it("returns null without a CID", () => {
        expect(parseCompound({ PropertyTable: { Properties: [{}] } })).toBeNull();
    });
});

describe("gene sources", () => {
    it("reads a MyGene hit whether Ensembl is an object or an array", () => {
        const base = { symbol: "TCF7L2", name: "transcription factor 7 like 2", entrezgene: 6934 };
        expect(parseGene({ hits: [{ ...base, ensembl: { gene: "ENSG00000148737" } }] })?.ensemblId).toBe(
            "ENSG00000148737",
        );
        const g = parseGene({
            hits: [{ ...base, ensembl: [{ gene: "ENSG00000148737" }, { gene: "ENSG0000ALT" }], alias: "TCF4" }],
        })!;
        expect(g.ensemblId).toBe("ENSG00000148737");
        expect(g.entrezId).toBe("6934");
        expect(g.aliases).toEqual(["TCF4"]);
        expect(parseGene({ hits: [] })).toBeNull();
    });

    it("reads a UniProt entry and strips evidence tags", () => {
        const p = parseProtein({
            results: [
                {
                    primaryAccession: "Q9NQB0",
                    uniProtkbId: "TF7L2_HUMAN",
                    proteinDescription: { recommendedName: { fullName: { value: "Transcription factor 7-like 2" } } },
                    genes: [{ geneName: { value: "TCF7L2" } }],
                    comments: [
                        {
                            commentType: "FUNCTION",
                            texts: [{ value: "Participates in the Wnt signaling pathway (PubMed:123, PubMed:456)." }],
                        },
                        {
                            commentType: "SUBCELLULAR LOCATION",
                            subcellularLocations: [{ location: { value: "Nucleus" } }, { location: { value: "Nucleus" } }],
                        },
                        { commentType: "DISEASE", disease: { diseaseId: "Diabetes mellitus, non-insulin-dependent", acronym: "NIDDM" } },
                    ],
                    sequence: { length: 619 },
                },
            ],
        })!;
        expect(p.function).toBe("Participates in the Wnt signaling pathway.");
        expect(p.locations).toEqual(["Nucleus"]);
        expect(p.diseases[0].acronym).toBe("NIDDM");
        expect(p.length).toBe(619);
    });

    it("queries reviewed human entries only", () => {
        const url = decodeURIComponent(proteinUrl("tcf7l2")).replace(/\+/g, " ");
        expect(url).toContain("gene_exact:tcf7l2 AND organism_id:9606 AND reviewed:true");
    });

    it("reads Open Targets associations and raises GraphQL errors", () => {
        const r = parseTargetAssociations(
            {
                data: {
                    target: {
                        id: "ENSG00000148737",
                        approvedSymbol: "TCF7L2",
                        associatedDiseases: {
                            count: 900,
                            rows: [{ score: 0.81, disease: { id: "MONDO_0005148", name: "type 2 diabetes mellitus" } }],
                        },
                    },
                },
            },
            "ENSG00000148737",
        )!;
        expect(r.total).toBe(900);
        expect(r.rows[0].diseaseName).toBe("type 2 diabetes mellitus");
        expect(() => parseTargetAssociations({ errors: [{ message: "bad" }] }, "x")).toThrow(SourceError);
        expect(parseTargetAssociations({ data: { target: null } }, "x")).toBeNull();
    });
});

describe("request layer", () => {
    const ok = (body: unknown) =>
        Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

    beforeEach(() => clearSourceCache());
    afterEach(() => vi.unstubAllGlobals());

    it("maps HTTP failures to typed errors", async () => {
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 429 }))));
        await expect(fetchJson("https://example.org/a")).rejects.toMatchObject({ kind: "rate-limit" });
        vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
        await expect(fetchJson("https://example.org/b")).rejects.toMatchObject({ kind: "network" });
    });

    it("serves a repeat request from cache but retries after a failure", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => Promise.resolve(new Response("", { status: 500 })))
            .mockImplementation(() => ok({ v: 1 }));
        vi.stubGlobal("fetch", fetchMock);
        await expect(fetchJson("https://example.org/c")).rejects.toMatchObject({ kind: "http", status: 500 });
        await expect(fetchJson("https://example.org/c")).resolves.toEqual({ v: 1 });
        await expect(fetchJson("https://example.org/c")).resolves.toEqual({ v: 1 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("chains PubMed search into summary", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string) => ok(url.includes("esearch") ? esearch : esummary)),
        );
        const page = await searchPubMed("type 2 diabetes", { retmax: 2 });
        expect(page.total).toBe(48210);
        expect(page.papers.map((p) => p.pmid)).toEqual(["10938048", "12060057"]);
    });

    it("retries a trials search without the field list on HTTP 400", async () => {
        const fetchMock = vi.fn((url: string) =>
            url.includes("fields=") ? Promise.resolve(new Response("", { status: 400 })) : ok(ctgov),
        );
        vi.stubGlobal("fetch", fetchMock);
        const page = await searchTrials({ condition: "diabetes" });
        expect(page.trials[0].nctId).toBe("NCT07064473");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("treats openFDA's 404 as no match", async () => {
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 404 }))));
        await expect(getDrugLabel("notadrug")).resolves.toBeNull();
    });
});
