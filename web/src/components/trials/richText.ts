/**
 * Reads the small part of markdown an AI reply uses into plain data, so the page renders it as React text.
 * Nothing here becomes HTML, so a reply can never inject markup.
 */
export interface RichSpan {
    text: string;
    bold?: boolean;
}

export type RichBlock = { kind: "paragraph"; spans: RichSpan[] } | { kind: "list"; ordered: boolean; items: RichSpan[][] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

const parseSpans = (line: string): RichSpan[] => {
    const spans: RichSpan[] = [];
    const bold = /\*\*(\S(?:.*?\S)?)\*\*/g;
    let at = 0;
    for (let match = bold.exec(line); match; match = bold.exec(line)) {
        if (match.index > at) spans.push({ text: line.slice(at, match.index) });
        spans.push({ text: match[1], bold: true });
        at = match.index + match[0].length;
    }
    if (at < line.length) spans.push({ text: line.slice(at) });
    return spans;
};

export const parseRich = (text: string): RichBlock[] => {
    const blocks: RichBlock[] = [];
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        const bullet = line.match(BULLET);
        const numbered = line.match(NUMBERED);
        const heading = line.match(HEADING);
        if (bullet || numbered) {
            const ordered = !bullet;
            const item = parseSpans((bullet ?? numbered)?.[1] ?? "");
            const last = blocks[blocks.length - 1];
            if (last?.kind === "list" && last.ordered === ordered) blocks[blocks.length - 1] = { ...last, items: [...last.items, item] };
            else blocks.push({ kind: "list", ordered, items: [item] });
        } else if (heading) {
            blocks.push({ kind: "paragraph", spans: [{ text: heading[1].replace(/\*\*/g, ""), bold: true }] });
        } else {
            blocks.push({ kind: "paragraph", spans: parseSpans(line) });
        }
    }
    return blocks;
};
