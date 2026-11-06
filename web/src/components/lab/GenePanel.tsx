import { useState } from "react";
import { useRemote } from "@/hooks/useRemote";
import {
    cleanSymbol,
    getGene,
    getProtein,
    getTargetAssociations,
    ncbiGeneUrl,
    openTargetsDiseaseUrl,
    openTargetsWebUrl,
    uniprotWebUrl,
} from "@/data/sources/genes";
import { databaseById } from "@/data/sources/registry";
import type { Disease } from "@/data/knowledge";
import { Chip, Clamp, EmptyState, ExternalLink, LoadingRows, RemoteView, SearchForm, SourceLine } from "./primitives";
import { fmtInt } from "./utils";
import { NotSimulated } from "./NotSimulated";
import { cn } from "@/lib/utils";

const GenePanel = ({ condition }: { condition: Disease }) => {
    const suggestions = condition.research.genes;
    const [input, setInput] = useState(suggestions[0] ?? "");
    const [symbol, setSymbol] = useState(suggestions[0] ?? "");
    const run = (s: string) => {
        setInput(s);
        setSymbol(cleanSymbol(s));
    };

    const key = symbol ? symbol.toUpperCase() : null;
    const gene = useRemote(key && `gene:${key}`, (s) => getGene(symbol, s));
    const protein = useRemote(key && `protein:${key}`, (s) => getProtein(symbol, s));
    // Open Targets is keyed by Ensembl ID, which only MyGene knows — so it waits for that lookup.
    const ensemblId = gene.state.status === "success" ? gene.state.data?.ensemblId : undefined;
    const assoc = useRemote(ensemblId ? `ot:${ensemblId}` : null, (s) => getTargetAssociations(ensemblId!, s));

    // Only the condition's own name and search term — broader keywords ("glucose", "insulin")
    // would light up measurement traits that are not the condition.
    const needles = [condition.research.term, condition.name.replace(/\s*\(.*\)\s*/, "")]
        .map((k) => k.toLowerCase().trim())
        .filter((k) => k.length > 3);
    const matchesCondition = (name: string) => needles.some((n) => name.toLowerCase().includes(n));

    return (
        <div>
            <SearchForm
                label="gene"
                value={input}
                onChange={setInput}
                onSubmit={() => run(input)}
                placeholder="HGNC gene symbol, e.g. TCF7L2"
                button="Look up"
            />
            {suggestions.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted-foreground">Worth looking up:</span>
                    {suggestions.map((g) => (
                        <Chip key={g} active={symbol.toUpperCase() === g} onClick={() => run(g)}>
                            <span className="font-mono">{g}</span>
                        </Chip>
                    ))}
                </div>
            ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                    No suggested lookups for {condition.name.split(" (")[0].toLowerCase()} — for an infectious disease the
                    relevant genes are often the pathogen&rsquo;s, which these human-gene databases do not cover.
                </p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
                Suggestions are replicated loci, pathway members or drug targets worth looking up — not a claim that the
                gene causes the condition.
            </p>

            {!symbol ? (
                <div className="mt-6">
                    <EmptyState>Enter a human gene symbol to pull its identity, protein function and disease associations.</EmptyState>
                </div>
            ) : (
                <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-2">
                    <section aria-labelledby="gene-h" className="min-w-0">
                        <h2 id="gene-h" className="label-caps mb-3">
                            Gene · MyGene.info
                        </h2>
                        <RemoteView state={gene.state} source="MyGene.info" onRetry={gene.retry} loading={<LoadingRows rows={3} label="MyGene.info" />}>
                            {(g) =>
                                !g ? (
                                    <EmptyState>No human gene with the symbol “{symbol}”. Check the HGNC symbol — aliases are not matched.</EmptyState>
                                ) : (
                                    <div className="space-y-3">
                                        <div>
                                            <p className="font-mono text-lg font-semibold">{g.symbol}</p>
                                            <p className="text-sm text-muted-foreground">{g.name}</p>
                                        </div>
                                        <dl className="tnum grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                                            {g.location && (
                                                <>
                                                    <dt className="text-muted-foreground">Cytoband</dt>
                                                    <dd>{g.location}</dd>
                                                </>
                                            )}
                                            {g.typeOfGene && (
                                                <>
                                                    <dt className="text-muted-foreground">Type</dt>
                                                    <dd>{g.typeOfGene}</dd>
                                                </>
                                            )}
                                            {g.aliases.length > 0 && (
                                                <>
                                                    <dt className="text-muted-foreground">Aliases</dt>
                                                    <dd className="font-mono">{g.aliases.slice(0, 6).join(", ")}</dd>
                                                </>
                                            )}
                                            {g.ensemblId && (
                                                <>
                                                    <dt className="text-muted-foreground">Ensembl</dt>
                                                    <dd className="font-mono">{g.ensemblId}</dd>
                                                </>
                                            )}
                                        </dl>
                                        {g.summary ? (
                                            <Clamp text={g.summary} lines={6} />
                                        ) : (
                                            <p className="text-xs text-muted-foreground">No RefSeq summary for this gene.</p>
                                        )}
                                        {g.entrezId && (
                                            <ExternalLink href={ncbiGeneUrl(g.entrezId)} className="text-xs">
                                                NCBI Gene {g.entrezId}
                                            </ExternalLink>
                                        )}
                                        <SourceLine db={databaseById("mygene")} at={gene.state.status === "success" ? gene.state.at : undefined} />
                                    </div>
                                )
                            }
                        </RemoteView>
                    </section>

                    <section aria-labelledby="protein-h" className="min-w-0">
                        <h2 id="protein-h" className="label-caps mb-3">
                            Protein · UniProtKB/Swiss-Prot
                        </h2>
                        <RemoteView state={protein.state} source="UniProt" onRetry={protein.retry} loading={<LoadingRows rows={3} label="UniProt" />}>
                            {(p) =>
                                !p ? (
                                    <EmptyState>No reviewed human UniProt entry for “{symbol}”. Non-coding genes have none.</EmptyState>
                                ) : (
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-sm font-medium">{p.name ?? p.entryName}</p>
                                            <p className="tnum text-xs text-muted-foreground">
                                                {p.accession}
                                                {p.entryName && ` · ${p.entryName}`}
                                                {p.length !== undefined && ` · ${fmtInt(p.length)} aa`}
                                            </p>
                                        </div>
                                        {p.function && (
                                            <div>
                                                <h3 className="label-caps mb-1">Function</h3>
                                                <Clamp text={p.function} lines={5} />
                                            </div>
                                        )}
                                        {p.locations.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {p.locations.map((l) => (
                                                    <span key={l} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                        {l}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {p.diseases.length > 0 && (
                                            <div>
                                                <h3 className="label-caps mb-1">Curated disease involvement</h3>
                                                <ul className="space-y-0.5 text-xs text-muted-foreground">
                                                    {p.diseases.map((d) => (
                                                        <li key={d.name}>
                                                            {d.name}
                                                            {d.acronym && <span className="font-mono"> ({d.acronym})</span>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        <ExternalLink href={uniprotWebUrl(p.accession)} className="text-xs">
                                            UniProt {p.accession}
                                        </ExternalLink>
                                        <SourceLine db={databaseById("uniprot")} at={protein.state.status === "success" ? protein.state.at : undefined} />
                                    </div>
                                )
                            }
                        </RemoteView>
                    </section>

                    <section aria-labelledby="ot-h" className="min-w-0 border-t border-border pt-6 lg:col-span-2">
                        <h2 id="ot-h" className="label-caps mb-1">
                            Disease associations · Open Targets
                        </h2>
                        <p className="mb-4 text-xs text-muted-foreground">
                            Overall association score, 0–1, combining genetic, literature, expression and drug evidence.
                            It ranks how much evidence links the two — it is not an effect size.
                        </p>
                        {gene.state.status === "loading" && <LoadingRows rows={3} label="Open Targets" />}
                        {gene.state.status === "success" && !ensemblId && (
                            <EmptyState>No Ensembl ID for this gene, so Open Targets can&rsquo;t be queried.</EmptyState>
                        )}
                        {gene.state.status === "error" && (
                            <EmptyState>Waiting on the gene lookup above, which Open Targets needs for the Ensembl ID.</EmptyState>
                        )}
                        {ensemblId && (
                            <RemoteView
                                state={assoc.state}
                                source="Open Targets"
                                onRetry={assoc.retry}
                                fallbackHref={openTargetsWebUrl(ensemblId)}
                                loading={<LoadingRows rows={3} label="Open Targets" />}
                            >
                                {(a) =>
                                    !a || a.rows.length === 0 ? (
                                        <EmptyState>Open Targets lists no disease associations for this target.</EmptyState>
                                    ) : (
                                        <div>
                                            <p className="tnum mb-3 text-xs text-muted-foreground">
                                                Top {a.rows.length} of <span className="text-foreground">{fmtInt(a.total)}</span> associated
                                                diseases and phenotypes
                                            </p>
                                            <ol className="grid gap-x-10 gap-y-2 md:grid-cols-2">
                                                {a.rows.map((r) => {
                                                    const hit = matchesCondition(r.diseaseName);
                                                    return (
                                                        <li key={r.diseaseId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                                                            <div className="min-w-0">
                                                                <a
                                                                    href={openTargetsDiseaseUrl(r.diseaseId)}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className={cn("block truncate text-xs hover:underline", hit && "font-medium text-primary")}
                                                                    title={r.diseaseName}
                                                                >
                                                                    {r.diseaseName}
                                                                    {hit && <span className="sr-only"> (matches the current condition)</span>}
                                                                </a>
                                                                <div className="mt-1 h-1.5 rounded-full bg-secondary">
                                                                    <div
                                                                        className={cn("h-1.5 rounded-full", hit ? "bg-primary" : "bg-[hsl(var(--prov-illustrative))]")}
                                                                        style={{ width: `${Math.max(2, r.score * 100)}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <span className="tnum self-end text-xs text-muted-foreground">{r.score.toFixed(2)}</span>
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                                                <ExternalLink href={openTargetsWebUrl(ensemblId)} className="text-xs">
                                                    All associations on Open Targets
                                                </ExternalLink>
                                                <span className="text-[11px] text-muted-foreground">
                                                    <span className="inline-block h-1.5 w-3 rounded-full bg-primary align-middle" /> matches{" "}
                                                    {condition.name.split(" (")[0].toLowerCase()}
                                                </span>
                                            </div>
                                            <SourceLine db={databaseById("opentargets")} at={assoc.state.status === "success" ? assoc.state.at : undefined} className="mt-3" />
                                        </div>
                                    )
                                }
                            </RemoteView>
                        )}
                    </section>
                </div>
            )}

            <NotSimulated area="gene" className="mt-10" />
        </div>
    );
};

export default GenePanel;
