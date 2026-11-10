import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Loads public/sw.js as the browser would, with a stand-in `self`, and returns its routing rule. */
const load = (): ((url: string, origin: string) => string | null) => {
    const code = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");
    const self = { addEventListener: () => undefined, location: { origin: "https://site.test" } };
    return new Function("self", `${code}\nreturn strategyFor;`)(self);
};
const constants = (): { META: string; ENGINE_PREFIX: string } => {
    const code = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");
    return new Function("self", `${code}\nreturn { META, ENGINE_PREFIX };`)({ addEventListener: () => undefined, location: { origin: "https://site.test" } });
};

describe("offline cache routing", () => {
    const strategyFor = load();
    const O = "https://site.test";

    it("caches hashed assets, engine files and versioned Pyodide", () => {
        expect(strategyFor(`${O}/assets/index-BnvL_aZB.js`, O)).toBe("assets");
        expect(strategyFor(`${O}/engine/medlab.zip`, O)).toBe("engine");
        expect(strategyFor(`${O}/engine/manifest.json`, O)).toBe("manifest");
        expect(strategyFor("https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.asm.wasm", O)).toBe("cdn");
    });

    it("never touches pages, the API, the AI proxy or unversioned CDN files", () => {
        expect(strategyFor(`${O}/`, O)).toBeNull();
        expect(strategyFor(`${O}/index.html`, O)).toBeNull();
        expect(strategyFor(`${O}/copilot/index.html`, O)).toBeNull();
        expect(strategyFor(`${O}/api/assistant`, O)).toBeNull();
        expect(strategyFor("https://medbase-lab-ai.vercel.app/api/chat", O)).toBeNull();
        expect(strategyFor("https://cdn.jsdelivr.net/pyodide/latest/full/pyodide.js", O)).toBeNull();
        expect(strategyFor(`${O}/engine/medlab.zip?fresh=1`, O)).toBeNull();
        expect(strategyFor("https://other.test/assets/x.js", O)).toBeNull();
    });

    it("keeps the stored manifest out of the old-engine clean-up", () => {
        // A meta cache named like an engine cache was deleted on every load, so nothing was ever cached.
        const { META, ENGINE_PREFIX } = constants();
        expect(META.startsWith(ENGINE_PREFIX)).toBe(false);
    });
});
