import { useState, type ReactNode } from "react";
import { Bookmark, BookmarkCheck, Check, Copy, Download, Trash2 } from "lucide-react";
import { useRemote } from "@/hooks/useRemote";
import {
    europePmcWebUrl,
    pubmedWebUrl,
    searchEuropePmc,
    searchPubMed,
    type LiteratureSort,
} from "@/data/sources/literature";
import { formatCitation, toBibtex, toRis } from "@/data/sources/cite";
import { databaseById } from "@/data/sources/registry";
import type { Paper, PaperPage } from "@/data/sources/types";
import { literature as curated } from "@/data/evidence";
import type { Disease } from "@/data/knowledge";
import { Chip, EmptyState, ExternalLink, RemoteView, SearchForm, Segmented, SourceLine } from "./primitives";
import { downloadFile, fmtInt, useCopy, useLocalStorage } from "./utils";
import { cn } from "@/lib/utils";

type Source = "pubmed" | "europepmc";

interface Query {
    q: string;
    source: Source;
    sort: LiteratureSort;
    freeText: boolean;
    reviews: boolean;
}

/** Papers already in MedBase's evidence layer, and whether the model takes a number from them. */
const curatedByPmid = new Map(curated.map((l) => [l.pmid, Boolean(l.feedsModel)]));

/** Filters are appended in each database's own syntax, so the query stays inspectable. */
const composed = ({ q, source, freeText, reviews }: Query) => {
    const parts = [`(${q.trim()})`];
    if (source === "pubmed") {
        if (freeText) parts.push("free full text[sb]");
        if (reviews) parts.push("review[pt]");
    } else {
        if (freeText) parts.push("OPEN_ACCESS:y");
        if (reviews) parts.push('PUB_TYPE:"review"');
    }
    return parts.length === 1 ? q.trim() : parts.join(" AND ");
};

const LiteraturePanel = ({ condition }: { condition: Disease }) => {
    const [input, setInput] = useState(condition.research.term);
    const [query, setQuery] = useState<Query>({
        q: condition.research.term,
        source: "pubmed",
        sort: "relevance",
        freeText: false,
        reviews: false,
    });
    const [reading, setReading] = useLocalStorage<Paper[]>("medbase.lab.reading.v1", []);
    const { copied, copy } = useCopy();

    const term = composed(query);
    const { state, retry } = useRemote<PaperPage>(
        query.q.trim() ? JSON.stringify([query.source, term, query.sort]) : null,
        (signal) =>
            query.source === "pubmed"
                ? searchPubMed(term, { sort: query.sort, retmax: 20, signal })
                : searchEuropePmc(term, { sort: query.sort, pageSize: 20, signal }),
    );

    const db = databaseById(query.source);
    const webUrl = query.source === "pubmed" ? pubmedWebUrl(term, query.sort) : europePmcWebUrl(term);
    const update = (patch: Partial<Query>) => setQuery((prev) => ({ ...prev, ...patch }));

    const inReading = (p: Paper) => reading.some((r) => r.id === p.id || (p.pmid && r.pmid === p.pmid));
    const toggleReading = (p: Paper) =>
        setReading((prev) =>
            inReading(p) ? prev.filter((r) => r.id !== p.id && !(p.pmid && r.pmid === p.pmid)) : [...prev, p],
        );

    return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
                <div className="space-y-3">
                    <SearchForm
                        label="literature"
                        value={input}
                        onChange={setInput}
                        onSubmit={() => update({ q: input })}
                        placeholder="Search titles, abstracts and MeSH terms…"
                        busy={state.status === "loading"}
                    />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <Segmented
                            label="Database"
                            value={query.source}
                            onChange={(source) =>
                                update({ source, sort: source === "pubmed" && query.sort === "cited" ? "relevance" : query.sort })
                            }
                            options={[
                                { id: "pubmed", label: "PubMed" },
                                { id: "europepmc", label: "Europe PMC" },
                            ]}
                        />
                        <Segmented
                            label="Sort"
                            value={query.sort}
                            onChange={(sort) => update({ sort })}
                            options={[
                                { id: "relevance", label: "Relevance" },
                                { id: "newest", label: "Newest" },
                                {
                                    id: "cited",
                                    label: "Most cited",
                                    disabled: query.source === "pubmed",
                                    title: query.source === "pubmed" ? "PubMed has no citation counts — switch to Europe PMC" : undefined,
                                },
                            ]}
                        />
                        <div className="flex flex-wrap gap-1.5">
                            <Chip active={query.freeText} onClick={() => update({ freeText: !query.freeText })}>
                                Free full text
                            </Chip>
                            <Chip active={query.reviews} onClick={() => update({ reviews: !query.reviews })}>
                                Reviews only
                            </Chip>
                            {query.q !== condition.research.term && (
                                <Chip
                                    onClick={() => {
                                        setInput(condition.research.term);
                                        update({ q: condition.research.term });
                                    }}
                                >
                                    ↺ {condition.research.term}
                                </Chip>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <RemoteView state={state} source={db.name} onRetry={retry} fallbackHref={webUrl}>
                        {(page) => (
                            <>
                                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                                    <p className="tnum text-xs text-muted-foreground">
                                        <span className="text-foreground">{fmtInt(page.total)}</span> records · showing{" "}
                                        {page.papers.length}
                                    </p>
                                    <ExternalLink href={webUrl} className="text-xs">
                                        Open full results on {db.name}
                                    </ExternalLink>
                                </div>
                                {page.interpretedAs && (
                                    <details className="mb-3 text-[11px] text-muted-foreground">
                                        <summary className="cursor-pointer hover:text-foreground">How PubMed read this query</summary>
                                        <code className="mt-1.5 block overflow-x-auto rounded bg-secondary px-2 py-1.5 font-mono">
                                            {page.interpretedAs}
                                        </code>
                                    </details>
                                )}
                                {page.papers.length === 0 ? (
                                    <EmptyState>No records match. Loosen the filters or broaden the terms.</EmptyState>
                                ) : (
                                    <ol className="divide-y divide-border">
                                        {page.papers.map((p) => (
                                            <PaperRow
                                                key={p.id}
                                                paper={p}
                                                saved={inReading(p)}
                                                onToggleSave={() => toggleReading(p)}
                                                onCopy={() => copy(formatCitation(p), p.id)}
                                                copied={copied === p.id}
                                            />
                                        ))}
                                    </ol>
                                )}
                                <SourceLine db={db} at={state.status === "success" ? state.at : undefined} className="mt-4 border-t border-border pt-3" />
                            </>
                        )}
                    </RemoteView>
                </div>
            </div>

            <ReadingList
                papers={reading}
                onRemove={(p) => setReading((prev) => prev.filter((r) => r.id !== p.id))}
                onClear={() => setReading([])}
                onCopyAll={() => copy(reading.map(formatCitation).join("\n\n"), "all")}
                copiedAll={copied === "all"}
            />
        </div>
    );
};

const Badge = ({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "derived" | "warn" }) => (
    <span
        className={cn(
            "inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wider",
            tone === "derived" && "border-[hsl(var(--prov-derived))]/40 text-[hsl(var(--prov-derived))]",
            tone === "warn" && "border-[hsl(var(--prov-extrapolated))]/40 text-[hsl(var(--prov-extrapolated))]",
            tone === "muted" && "border-border text-muted-foreground",
        )}
    >
        {children}
    </span>
);

const PaperRow = ({
    paper: p,
    saved,
    onToggleSave,
    onCopy,
    copied,
}: {
    paper: Paper;
    saved: boolean;
    onToggleSave: () => void;
    onCopy: () => void;
    copied: boolean;
}) => {
    const isReview = p.pubTypes.some((t) => /review/i.test(t));
    return (
        <li className="group py-4">
            <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                    <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium leading-snug hover:text-primary hover:underline"
                    >
                        {p.title}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {p.authors}
                        {p.journal && (
                            <>
                                {" · "}
                                <span className="italic">{p.journal}</span>
                            </>
                        )}
                        {p.year && <span className="tnum"> {p.year}</span>}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {p.pmid && curatedByPmid.get(p.pmid) === true && <Badge tone="derived">Feeds the model</Badge>}
                        {p.pmid && curatedByPmid.get(p.pmid) === false && <Badge>In MedBase evidence</Badge>}
                        {p.preprint && <Badge tone="warn">Preprint · not peer reviewed</Badge>}
                        {isReview && <Badge>Review</Badge>}
                        {p.openAccess && <Badge>Free full text</Badge>}
                        {p.citedBy !== undefined && (
                            <span className="tnum text-[11px] text-muted-foreground">cited by {fmtInt(p.citedBy)}</span>
                        )}
                        <span className="tnum text-[11px] text-muted-foreground">
                            {p.pmid && (
                                <a href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`} target="_blank" rel="noreferrer" className="hover:text-foreground">
                                    PMID {p.pmid}
                                </a>
                            )}
                            {p.doi && (
                                <>
                                    {p.pmid && " · "}
                                    <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="hover:text-foreground">
                                        DOI
                                    </a>
                                </>
                            )}
                        </span>
                    </div>
                </div>
                <div className="flex shrink-0 gap-0.5 sm:opacity-60 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <IconButton label={copied ? "Citation copied" : "Copy citation"} onClick={onCopy}>
                        {copied ? <Check className="h-3.5 w-3.5 text-[hsl(var(--prov-derived))]" /> : <Copy className="h-3.5 w-3.5" />}
                    </IconButton>
                    <IconButton label={saved ? "Remove from reading list" : "Add to reading list"} onClick={onToggleSave} pressed={saved}>
                        {saved ? <BookmarkCheck className="h-3.5 w-3.5 text-primary" /> : <Bookmark className="h-3.5 w-3.5" />}
                    </IconButton>
                </div>
            </div>
        </li>
    );
};

const IconButton = ({
    label,
    onClick,
    children,
    pressed,
}: {
    label: string;
    onClick: () => void;
    children: ReactNode;
    pressed?: boolean;
}) => (
    <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        aria-pressed={pressed}
        className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
        {children}
    </button>
);

const ReadingList = ({
    papers,
    onRemove,
    onClear,
    onCopyAll,
    copiedAll,
}: {
    papers: Paper[];
    onRemove: (p: Paper) => void;
    onClear: () => void;
    onCopyAll: () => void;
    copiedAll: boolean;
}) => {
    const [confirming, setConfirming] = useState(false);
    const stamp = new Date().toISOString().slice(0, 10);
    return (
        <aside aria-labelledby="reading-h" className="xl:sticky xl:top-[7.5rem] xl:self-start">
            <div className="rounded-md border border-border bg-card/50 p-4">
                <div className="flex items-baseline justify-between">
                    <h2 id="reading-h" className="text-sm font-semibold">
                        Reading list
                    </h2>
                    <span className="tnum text-xs text-muted-foreground">{papers.length}</span>
                </div>
                {papers.length === 0 ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        Bookmark papers from any search to collect them here, then export to a reference
                        manager. Kept in this browser only.
                    </p>
                ) : (
                    <>
                        <ul className="mt-3 max-h-[40vh] space-y-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                            {papers.map((p) => (
                                <li key={p.id} className="flex items-start gap-2 text-xs">
                                    <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 leading-snug hover:text-primary">
                                        <span className="line-clamp-2">{p.title}</span>
                                        <span className="tnum text-muted-foreground">
                                            {p.authorList[0] ?? "—"} {p.year}
                                        </span>
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => onRemove(p)}
                                        aria-label={`Remove ${p.title}`}
                                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    >
                                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-4 grid grid-cols-2 gap-1.5 border-t border-border pt-3">
                            <button
                                type="button"
                                onClick={() => downloadFile(`medbase-reading-${stamp}.ris`, toRis(papers), "application/x-research-info-systems")}
                                className="inline-flex items-center justify-center gap-1.5 rounded border border-input py-1.5 text-xs hover:bg-secondary"
                            >
                                <Download className="h-3 w-3" aria-hidden="true" /> RIS
                            </button>
                            <button
                                type="button"
                                onClick={() => downloadFile(`medbase-reading-${stamp}.bib`, toBibtex(papers), "application/x-bibtex")}
                                className="inline-flex items-center justify-center gap-1.5 rounded border border-input py-1.5 text-xs hover:bg-secondary"
                            >
                                <Download className="h-3 w-3" aria-hidden="true" /> BibTeX
                            </button>
                            <button
                                type="button"
                                onClick={onCopyAll}
                                className="inline-flex items-center justify-center gap-1.5 rounded border border-input py-1.5 text-xs hover:bg-secondary"
                            >
                                {copiedAll ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                                {copiedAll ? "Copied" : "Copy all"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!confirming) return setConfirming(true);
                                    setConfirming(false);
                                    onClear();
                                }}
                                onBlur={() => setConfirming(false)}
                                className={cn(
                                    "inline-flex items-center justify-center gap-1.5 rounded border py-1.5 text-xs hover:bg-secondary",
                                    confirming
                                        ? "border-destructive/60 text-destructive"
                                        : "border-input text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {confirming ? `Remove all ${papers.length}?` : "Clear"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
};

export default LiteraturePanel;
