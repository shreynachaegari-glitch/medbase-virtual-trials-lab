import { useState } from "react";
import { doiUrl, pubmedUrl, type Citation } from "@/sim/citations";
import type { Provenance } from "@/sim/params";
import { cn } from "@/lib/utils";

const kindLabel: Record<Provenance["kind"], string> = {
    derived: "Derived",
    extrapolated: "Extrapolated",
    illustrative: "Illustrative",
};

const kindClass: Record<Provenance["kind"], string> = {
    derived: "text-[hsl(var(--prov-derived))] border-[hsl(var(--prov-derived))]/35",
    extrapolated: "text-[hsl(var(--prov-extrapolated))] border-[hsl(var(--prov-extrapolated))]/35",
    illustrative: "text-[hsl(var(--prov-illustrative))] border-[hsl(var(--prov-illustrative))]/35",
};

export const CitationLink = ({ citation }: { citation: Citation }) => (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <span className="text-foreground">{citation.short}</span>
        <a
            href={pubmedUrl(citation.pmid)}
            target="_blank"
            rel="noreferrer"
            className="tnum text-[11px] text-primary underline-offset-2 hover:underline"
        >
            PMID {citation.pmid}
        </a>
        <a
            href={doiUrl(citation.doi)}
            target="_blank"
            rel="noreferrer"
            className="tnum text-[11px] text-primary underline-offset-2 hover:underline"
        >
            doi:{citation.doi}
        </a>
    </span>
);

/**
 * The product's signature element: no parameter appears without saying where it came from,
 * and an assumption is never allowed to look like a citation.
 */
export const ProvenanceTag = ({
    provenance,
    className,
}: {
    provenance: Provenance;
    className?: string;
}) => {
    const [open, setOpen] = useState(false);

    return (
        <div className={cn("text-xs", className)}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="group inline-flex items-center gap-1.5 text-left"
            >
                <span
                    className={cn(
                        "label-caps border-b px-0 pb-px",
                        kindClass[provenance.kind],
                    )}
                >
                    {kindLabel[provenance.kind]}
                </span>
                <span className="text-muted-foreground group-hover:text-foreground">
                    {provenance.kind === "illustrative"
                        ? "no source"
                        : provenance.citation.short}
                </span>
                <span className="text-muted-foreground" aria-hidden="true">
                    {open ? "−" : "+"}
                </span>
            </button>

            {open && (
                <div className="mt-2 space-y-2 border-l-2 border-border pl-3 text-muted-foreground">
                    {provenance.kind === "illustrative" ? (
                        <p>{provenance.reason}</p>
                    ) : (
                        <>
                            <p className="italic">“{provenance.quote}”</p>
                            <p>
                                <CitationLink citation={provenance.citation} />
                            </p>
                            {provenance.kind === "extrapolated" && (
                                <p className="text-[hsl(var(--prov-extrapolated))]">
                                    <span className="label-caps text-[hsl(var(--prov-extrapolated))]">
                                        Gap
                                    </span>{" "}
                                    {provenance.gap}
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
