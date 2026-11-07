import { describe, expect, it } from "vitest";
import { parseRich } from "./richText";

describe("parseRich", () => {
    it("splits paragraphs and keeps bold as data", () => {
        expect(parseRich("It **trains** the body.\n\nThen memory stays.")).toEqual([
            { kind: "paragraph", spans: [{ text: "It " }, { text: "trains", bold: true }, { text: " the body." }] },
            { kind: "paragraph", spans: [{ text: "Then memory stays." }] },
        ]);
    });

    it("groups bullets and numbers into one list", () => {
        const blocks = parseRich("Steps:\n- first\n* second\n\n1. one\n2. two");
        expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "list", "list"]);
        expect(blocks[1]).toMatchObject({ ordered: false, items: [[{ text: "first" }], [{ text: "second" }]] });
        expect(blocks[2]).toMatchObject({ ordered: true, items: [[{ text: "one" }], [{ text: "two" }]] });
    });

    it("turns a markdown heading into a bold line", () => {
        expect(parseRich("### Why it matters")).toEqual([{ kind: "paragraph", spans: [{ text: "Why it matters", bold: true }] }]);
    });

    it("keeps raw HTML as plain text, so nothing can run", () => {
        const blocks = parseRich('<img src=x onerror="alert(1)"> **<b>hi</b>**');
        expect(blocks).toEqual([{ kind: "paragraph", spans: [{ text: '<img src=x onerror="alert(1)"> ' }, { text: "<b>hi</b>", bold: true }] }]);
    });

    it("leaves an unmatched marker alone and returns nothing for empty text", () => {
        expect(parseRich("2 ** 3 is eight")).toEqual([{ kind: "paragraph", spans: [{ text: "2 ** 3 is eight" }] }]);
        expect(parseRich("  \n ")).toEqual([]);
    });
});
