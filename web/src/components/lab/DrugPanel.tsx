import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useRemote } from "@/hooks/useRemote";
import {
    compoundImageUrl,
    compoundWebUrl,
    dailyMedUrl,
    getAdverseEvents,
    getCompound,
    getDrugLabel,
    openFdaLabelWebUrl,
} from "@/data/sources/drugs";
import { databaseById } from "@/data/sources/registry";
import type { Disease } from "@/data/knowledge";
import { Chip, Clamp, Disclosure, EmptyState, ExternalLink, LoadingRows, RemoteView, SearchForm, SourceLine } from "./primitives";
import { fmtInt } from "./utils";
import { NotSimulated } from "./NotSimulated";

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const formatDate = (yyyymmdd?: string) =>
    yyyymmdd && /^\d{8}$/.test(yyyymmdd)
        ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
        : undefined;

const DrugPanel = ({ condition }: { condition: Disease }) => {
    const suggestions = condition.research.drugs;
    const [input, setInput] = useState(suggestions[0] ?? "");
    const [name, setName] = useState(suggestions[0] ?? "");
    const run = (n: string) => {
        setInput(n);
        setName(n.trim());
    };

    const key = name ? name.toLowerCase() : null;
    const label = useRemote(key && `label:${key}`, (s) => getDrugLabel(name, s));
    const compound = useRemote(key && `pubchem:${key}`, (s) => getCompound(name, s));
    const events = useRemote(key && `faers:${key}`, (s) => getAdverseEvents(name, s));

    const labelDb = databaseById("openfda-label");
    const faersDb = databaseById("openfda-faers");
    const pubchemDb = databaseById("pubchem");

    return (
        <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <SearchForm
                    label="drug"
                    value={input}
                    onChange={setInput}
                    onSubmit={() => run(input)}
                    placeholder="Generic or brand name, e.g. metformin"
                    button="Look up"
                />
            </div>
            {suggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted-foreground">Used for {condition.name.split(" (")[0].toLowerCase()}:</span>
                    {suggestions.map((d) => (
                        <Chip key={d} active={name.toLowerCase() === d} onClick={() => run(d)}>
                            {d}
                        </Chip>
                    ))}
                </div>
            )}

            {!name ? (
                <div className="mt-6">
                    <EmptyState>Enter a drug name to pull its label, chemistry and adverse-event reports.</EmptyState>
                </div>
            ) : (
                <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                    {/* Label */}
                    <section aria-labelledby="label-h" className="min-w-0">
                        <h2 id="label-h" className="label-caps mb-3">
                            Prescribing label · openFDA
                        </h2>
                        <RemoteView state={label.state} source="openFDA" onRetry={label.retry} fallbackHref={openFdaLabelWebUrl(name)}>
                            {(l) =>
                                !l ? (
                                    <EmptyState>
                                        No U.S. label matches “{name}”. openFDA indexes U.S. labelling only — try the generic
                                        name, or the U.S. name (acetaminophen, not paracetamol).
                                    </EmptyState>
                                ) : (
                                    <div className="space-y-5">
                                        <div>
                                            <p className="text-lg font-semibold tracking-tight">
                                                {titleCase(l.genericNames[0] ?? name)}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {l.brandNames.length > 0 && <>Brand: {l.brandNames.slice(0, 3).map(titleCase).join(", ")} · </>}
                                                {l.routes.length > 0 && <>{l.routes.map(titleCase).join(", ")} · </>}
                                                {l.manufacturer && <>{l.manufacturer}</>}
                                                {formatDate(l.effectiveDate) && <> · label effective {formatDate(l.effectiveDate)}</>}
                                            </p>
                                            {l.pharmClasses.length > 0 && (
                                                <div className="mt-2.5 flex flex-wrap gap-1.5">
                                                    {l.pharmClasses.map((c) => (
                                                        <span key={c} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                            {c}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {l.boxedWarning && (
                                            <div role="note" className="rounded-md border border-destructive/40 bg-destructive/[0.07] p-3.5">
                                                <p className="label-caps flex items-center gap-1.5 text-destructive">
                                                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                                    Boxed warning
                                                </p>
                                                <div className="mt-2">
                                                    <Clamp text={l.boxedWarning} lines={3} />
                                                </div>
                                            </div>
                                        )}

                                        {l.indications && <LabelSection title="Indications and usage" text={l.indications} />}
                                        {l.mechanism && <LabelSection title="Mechanism of action" text={l.mechanism} />}
                                        {l.contraindications && (
                                            <Disclosure summary="Contraindications">
                                                <Clamp text={l.contraindications} lines={6} />
                                            </Disclosure>
                                        )}

                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                            {l.setId && <ExternalLink href={dailyMedUrl(l.setId)}>Full label on DailyMed</ExternalLink>}
                                            {l.rxcui[0] && (
                                                <ExternalLink href={`https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${l.rxcui[0]}`}>
                                                    RxNorm {l.rxcui[0]}
                                                </ExternalLink>
                                            )}
                                        </div>
                                        <SourceLine db={labelDb} at={label.state.status === "success" ? label.state.at : undefined} />
                                    </div>
                                )
                            }
                        </RemoteView>
                    </section>

                    {/* Chemistry */}
                    <section aria-labelledby="chem-h" className="min-w-0">
                        <h2 id="chem-h" className="label-caps mb-3">
                            Chemistry · PubChem
                        </h2>
                        <RemoteView state={compound.state} source="PubChem" onRetry={compound.retry} loading={<LoadingRows rows={3} label="PubChem" />}>
                            {(c) =>
                                !c ? (
                                    <EmptyState>PubChem has no compound named “{name}”. Biologics and mixtures often resolve poorly by name.</EmptyState>
                                ) : (
                                    <div className="space-y-4">
                                        {/* PubChem draws on white; a white tile keeps the depiction faithful rather than inverting its colours. */}
                                        <div className="flex h-48 items-center justify-center overflow-hidden rounded-md bg-white p-3">
                                            <img
                                                src={compoundImageUrl(c.cid)}
                                                alt={`2D structure of ${name} (PubChem CID ${c.cid})`}
                                                loading="lazy"
                                                className="max-h-full max-w-full"
                                            />
                                        </div>
                                        <dl className="tnum grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                                            {c.formula && <Prop k="Formula" v={c.formula} />}
                                            {c.molecularWeight !== undefined && <Prop k="Mol. weight" v={`${c.molecularWeight.toFixed(2)} g/mol`} />}
                                            {c.xlogp !== undefined && <Prop k="XLogP3" v={c.xlogp.toFixed(1)} />}
                                            {c.tpsa !== undefined && <Prop k="TPSA" v={`${c.tpsa.toFixed(1)} Å²`} />}
                                            {c.hBondDonors !== undefined && (
                                                <Prop k="H-bond donors / acceptors" v={`${c.hBondDonors} / ${c.hBondAcceptors ?? "—"}`} />
                                            )}
                                        </dl>
                                        {c.iupacName && (
                                            <p className="break-words font-mono text-[11px] leading-relaxed text-muted-foreground">{c.iupacName}</p>
                                        )}
                                        <ExternalLink href={compoundWebUrl(c.cid)} className="text-xs">
                                            PubChem CID {c.cid}
                                        </ExternalLink>
                                        <SourceLine db={pubchemDb} at={compound.state.status === "success" ? compound.state.at : undefined} />
                                    </div>
                                )
                            }
                        </RemoteView>
                    </section>

                    {/* FAERS */}
                    <section aria-labelledby="faers-h" className="min-w-0 border-t border-border pt-6 lg:col-span-2">
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                            <h2 id="faers-h" className="label-caps">
                                Most-reported adverse-event terms · FAERS
                            </h2>
                        </div>
                        <p className="mb-4 max-w-3xl rounded-md border border-[hsl(var(--prov-extrapolated))]/35 px-3 py-2 text-xs leading-relaxed text-[hsl(var(--prov-extrapolated))]">
                            These are counts of voluntary reports that mention the drug, not rates. A term being
                            common here does not mean the drug causes it, or that it is common in patients taking it.
                        </p>
                        <RemoteView state={events.state} source="openFDA FAERS" onRetry={events.retry} loading={<LoadingRows rows={3} label="FAERS" />}>
                            {(e) =>
                                !e || e.reactions.length === 0 ? (
                                    <EmptyState>No adverse-event reports indexed for “{name}”.</EmptyState>
                                ) : (
                                    <div>
                                        <p className="tnum mb-3 text-xs text-muted-foreground">
                                            <span className="text-foreground">{fmtInt(e.totalReports)}</span> reports mention {name} ·
                                            top {e.reactions.length} reaction terms (MedDRA preferred terms)
                                        </p>
                                        <ol className="grid gap-x-10 gap-y-2 md:grid-cols-2">
                                            {e.reactions.map((r) => (
                                                <li key={r.term} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-xs">{titleCase(r.term)}</p>
                                                        <div className="mt-1 h-1.5 rounded-full bg-secondary">
                                                            <div
                                                                className="h-1.5 rounded-full bg-[hsl(var(--prov-illustrative))]"
                                                                style={{ width: `${(r.count / e.reactions[0].count) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <span className="tnum self-end text-xs text-muted-foreground">{fmtInt(r.count)}</span>
                                                </li>
                                            ))}
                                        </ol>
                                        <SourceLine db={faersDb} at={events.state.status === "success" ? events.state.at : undefined} className="mt-4" />
                                    </div>
                                )
                            }
                        </RemoteView>
                    </section>
                </div>
            )}

            <NotSimulated area="drug" className="mt-10" />
        </div>
    );
};

const LabelSection = ({ title, text }: { title: string; text: string }) => (
    <div>
        <h3 className="label-caps mb-1.5">{title}</h3>
        <Clamp text={text} lines={5} />
    </div>
);

const Prop = ({ k, v }: { k: string; v: string }) => (
    <>
        <dt className="text-muted-foreground">{k}</dt>
        <dd className="text-right">{v}</dd>
    </>
);

export default DrugPanel;
