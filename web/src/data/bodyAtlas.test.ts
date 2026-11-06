import { describe, expect, it } from "vitest";
import { ATLAS_REGIONS, CONTEXT_MESHES, MESH_COLOURS, ORGANS } from "./bodyAtlas";
import { diseases, getDiseaseById } from "./knowledge";

describe("the body atlas", () => {
    it("names only conditions the library has", () => {
        for (const region of ATLAS_REGIONS) {
            for (const id of region.conditions) expect(getDiseaseById(id), `${region.id}: ${id}`).toBeDefined();
        }
        for (const organ of Object.values(ORGANS)) {
            for (const part of organ.parts) {
                for (const id of part.conditions) expect(getDiseaseById(id), `${part.id}: ${id}`).toBeDefined();
            }
        }
    });
    it("keeps every condition reachable from the body", () => {
        const reached = new Set(ATLAS_REGIONS.flatMap((r) => r.conditions));
        expect(diseases.filter((d) => !reached.has(d.id)).map((d) => d.id)).toEqual([]);
    });
    it("gives every model a colour, and uses each once", () => {
        const used = [...ATLAS_REGIONS.flatMap((r) => r.meshes), ...CONTEXT_MESHES];
        expect(new Set(used).size).toBe(used.length);
        expect([...used].sort()).toEqual(Object.keys(MESH_COLOURS).sort());
    });
    it("keeps the part-by-part text for heart, lungs and brain", () => {
        expect(Object.keys(ORGANS).sort()).toEqual(["brain", "heart", "lungs"]);
        expect(ORGANS.heart.parts.length).toBeGreaterThan(5);
    });
});
