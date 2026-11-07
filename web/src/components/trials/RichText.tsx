import { Fragment, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { parseRich, type RichSpan } from "./richText";

const WORD_DELAY_MS = 16;
const LONGEST_REVEAL_MS = 1400;

const renderBlocks = (text: string, animate: boolean): ReactNode[] => {
    let word = 0;
    const renderSpan = (span: RichSpan, key: number): ReactNode => {
        const pieces = span.text.split(/(\s+)/).map((piece, i) => {
            if (!piece.trim() || !animate) return <Fragment key={i}>{piece}</Fragment>;
            const delay = Math.min(word * WORD_DELAY_MS, LONGEST_REVEAL_MS);
            word += 1;
            return <span key={i} className="ai-word" style={{ animationDelay: `${delay}ms` }}>{piece}</span>;
        });
        return span.bold ? <strong key={key} className="font-semibold">{pieces}</strong> : <Fragment key={key}>{pieces}</Fragment>;
    };
    return parseRich(text).map((block, i) =>
        block.kind === "paragraph" ? (
            <p key={i} className="text-pretty">{block.spans.map(renderSpan)}</p>
        ) : block.ordered ? (
            <ol key={i} className="list-decimal space-y-1 pl-5">{block.items.map((item, j) => <li key={j}>{item.map(renderSpan)}</li>)}</ol>
        ) : (
            <ul key={i} className="list-disc space-y-1 pl-5">{block.items.map((item, j) => <li key={j}>{item.map(renderSpan)}</li>)}</ul>
        ),
    );
};

/**
 * An AI reply with its bold and lists, appearing word by word. The checks have already run, so what appears is the final text,
 * and all of it is in the page from the start for screen readers and for copying.
 */
export const RichText = ({ text, reveal }: { text: string; reveal: boolean }) => {
    const reduce = useReducedMotion();
    return <div className="space-y-2 text-sm leading-relaxed" data-testid="assistant-answer">{renderBlocks(text, reveal && !reduce)}</div>;
};
