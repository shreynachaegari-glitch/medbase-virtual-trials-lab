import { describe, expect, it } from "vitest";
import { titleFor } from "@/lib/pageTitle";

describe("titleFor", () => {
    it("gives each page its own tab title", () => {
        expect(titleFor("/copilot")).toBe("AI Copilot — MedBase");
        expect(titleFor("/home")).toBe("MedBase — AI virtual trials for type 2 diabetes");
        expect(titleFor("/conditions/diabetes")).toBe("Condition record — MedBase");
        expect(titleFor("/nope")).toBe("Page not found — MedBase");
    });
    it("leaves Trials and Lab to name themselves", () => {
        expect(titleFor("/trials")).toBeNull();
        expect(titleFor("/lab")).toBeNull();
    });
});
