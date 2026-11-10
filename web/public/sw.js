/*
 * MedBase offline cache. It makes a repeat visit start without downloading the simulator again.
 *
 *   /assets/*            file names carry a content hash, so a cached copy is always right: cache first.
 *   Pyodide on the CDN   the URL carries the Pyodide version: cache first.
 *   /engine/manifest.json  always from the network (a cached copy is used only when offline). Its "version"
 *                        is a hash of every other engine file, and names the cache they are kept in, so a
 *                        deploy that changes any of them switches cache before anything stale is served.
 *   /engine/* (others)   cache first, inside the cache the latest manifest names.
 *
 * Pages, /api, the AI proxy and anything else are never touched: they always go to the network.
 */
const ASSETS = "medlab-assets-v1";
const CDN = "medlab-pyodide-v1";
const META = "medlab-meta-v1"; // must not start with ENGINE_PREFIX, or the clean-up below would delete it
const ENGINE_PREFIX = "medlab-engine-";
const MAX_ASSETS = 120;
const PYODIDE_CDN = /^https:\/\/cdn\.jsdelivr\.net\/pyodide\/v[\d.]+\//;

/** Which rule a request follows, or null to leave it alone. */
function strategyFor(url, origin) {
    const u = new URL(url);
    if (PYODIDE_CDN.test(u.href)) return "cdn";
    if (u.origin !== origin || u.search) return null;
    if (/\/assets\/[^/]+$/.test(u.pathname)) return "assets";
    if (/\/engine\/manifest\.json$/.test(u.pathname)) return "manifest";
    if (/\/engine\/[^/]+$/.test(u.pathname)) return "engine";
    return null;
}

/** Only complete, readable answers are kept. An opaque or partial response would be served wrongly later. */
const cacheable = (response) => response.ok && response.status === 200 && response.type !== "opaque";

async function cacheFirst(request, cacheName, limit) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (cacheable(response)) {
        await cache.put(request, response.clone());
        if (limit) {
            const keys = await cache.keys();
            await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
        }
    }
    return response;
}

async function engineVersion() {
    const stored = await (await caches.open(META)).match("manifest");
    if (!stored) return null;
    try {
        const version = (await stored.json()).version;
        return typeof version === "string" && /^[0-9a-f]{8,64}$/.test(version) ? version : null;
    } catch {
        return null;
    }
}

async function manifest(request) {
    const meta = await caches.open(META);
    let response;
    try {
        response = await fetch(request, { cache: "no-store" });
    } catch (error) {
        const saved = await meta.match("manifest");
        if (saved) return saved;
        throw error;
    }
    if (cacheable(response)) {
        await meta.put("manifest", response.clone());
        const version = await engineVersion();
        const names = await caches.keys();
        // Engine caches from earlier deploys can never be served again, so they go now.
        await Promise.all(names.filter((name) => name !== META && name.startsWith(ENGINE_PREFIX) && name !== ENGINE_PREFIX + version).map((name) => caches.delete(name)));
    }
    return response;
}

async function engineFile(request) {
    const version = await engineVersion();
    // Without a known version there is nothing safe to serve from, so this goes to the network uncached.
    if (!version) return fetch(request);
    return cacheFirst(request, ENGINE_PREFIX + version);
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET" || request.headers.has("range")) return;
    const strategy = strategyFor(request.url, self.location.origin);
    if (strategy === "cdn") event.respondWith(cacheFirst(request, CDN));
    else if (strategy === "assets") event.respondWith(cacheFirst(request, ASSETS, MAX_ASSETS));
    else if (strategy === "manifest") event.respondWith(manifest(request));
    else if (strategy === "engine") event.respondWith(engineFile(request));
});
