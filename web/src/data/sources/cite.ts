import type { Paper } from "./types";

/** One-line reference in the Vancouver style most biomedical journals use. */
export const formatCitation = (p: Paper) => {
    const authors =
        p.authorList.length > 6
            ? `${p.authorList.slice(0, 6).join(", ")}, et al.`
            : p.authorList.length
              ? `${p.authorList.join(", ")}.`
              : "";
    const ids = [p.pmid && `PMID: ${p.pmid}`, p.doi && `doi:${p.doi}`].filter(Boolean).join(". ");
    return [authors, `${p.title}.`, p.journal && `${p.journal}.`, p.year && `${p.year}.`, ids && `${ids}.`]
        .filter(Boolean)
        .join(" ");
};

/** RIS is the format every reference manager imports (Zotero, EndNote, Mendeley). */
export const toRis = (papers: Paper[]) =>
    papers
        .map((p) =>
            [
                `TY  - ${p.preprint ? "UNPB" : "JOUR"}`,
                `TI  - ${p.title}`,
                ...p.authorList.map((a) => `AU  - ${a}`),
                p.journal && `JO  - ${p.journal}`,
                p.year && `PY  - ${p.year}`,
                p.doi && `DO  - ${p.doi}`,
                p.pmid && `AN  - PMID:${p.pmid}`,
                `UR  - ${p.url}`,
                "ER  - ",
            ]
                .filter(Boolean)
                .join("\r\n"),
        )
        .join("\r\n\r\n") + "\r\n";

const bibEscape = (s: string) => s.replace(/[{}\\]/g, "").replace(/([&%$#_])/g, "\\$1");

const bibKey = (p: Paper, used: Set<string>) => {
    const surname = (p.authorList[0] ?? "anon").split(/\s+/)[0].replace(/[^A-Za-z]/g, "").toLowerCase() || "anon";
    const base = `${surname}${p.year ?? ""}`;
    let key = base;
    for (let i = 0; used.has(key); i++) key = `${base}${String.fromCharCode(97 + (i % 26))}${i >= 26 ? i : ""}`;
    used.add(key);
    return key;
};

export const toBibtex = (papers: Paper[]) => {
    const used = new Set<string>();
    return (
        papers
            .map((p) => {
                const fields = [
                    ["title", `{${bibEscape(p.title)}}`],
                    // PubMed names are "Surname AB"; BibTeX separates authors with " and ".
                    ["author", p.authorList.length ? `{${p.authorList.map(bibEscape).join(" and ")}}` : undefined],
                    ["journal", p.journal ? `{${bibEscape(p.journal)}}` : undefined],
                    ["year", p.year ? String(p.year) : undefined],
                    ["doi", p.doi ? `{${p.doi}}` : undefined],
                    ["pmid", p.pmid ? `{${p.pmid}}` : undefined],
                    ["url", `{${p.url}}`],
                ].filter((f): f is [string, string] => Boolean(f[1]));
                return `@article{${bibKey(p, used)},\n${fields.map(([k, v]) => `  ${k} = ${v}`).join(",\n")}\n}`;
            })
            .join("\n\n") + "\n"
    );
};
