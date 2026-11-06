/**
 * Builds the 3D anatomy assets in public/anatomy/ from BodyParts3D.
 *
 *   1. Download from https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/ :
 *      isa_BP3D_4.0_obj_99.zip (unzip it), isa_inclusion_relation_list.txt, partof_element_parts.txt
 *   2. python classify.py <bp3d dir> <out dir>        -> parts.json (one row per mesh, with its body system)
 *   3. npm install && node build.mjs <bp3d dir> <parts.json> <public/anatomy dir>
 *
 * Each system becomes one GLB with one node per structure (named by its BodyParts3D file id), simplified with
 * meshoptimizer, quantized and meshopt-compressed. BodyParts3D models the lungs only as airway and vessel trees,
 * so a smooth outer lung shape is generated around each side's segmental trees (ids LUNG_R / LUNG_L).
 *
 * Data: BodyParts3D, (c) The Database Center for Life Science, licensed under CC BY 4.0.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { meshopt, quantize } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const require = createRequire(import.meta.url);
const { surfaceNets } = require("isosurface");

const [BP = "C:/Users/shrey/mb/bp3d", PARTS = "C:/Users/shrey/mb/anat/parts.json", OUT = "../../public/anatomy"] = process.argv.slice(2);
const OBJ_DIR = path.join(BP, "isa_BP3D_4.0_obj_99");

/** Display order, colours and default state; `keep` is the fraction of triangles kept after simplification. */
const SYSTEMS = [
    { id: "skeletal", label: "Skeletal", color: "#e9e1cf", visible: true, opacity: 1, keep: 0.14 },
    { id: "muscular", label: "Muscular", color: "#d98f80", visible: true, opacity: 0.15, keep: 0.05, error: 0.12 },
    { id: "nervous", label: "Nervous", color: "#f0cf6a", visible: true, opacity: 1, keep: 0.07 },
    { id: "cardiovascular", label: "Cardiovascular", color: "#d9655d", visible: true, opacity: 1, keep: 0.035, error: 0.05 },
    { id: "respiratory", label: "Respiratory", color: "#f2a7b8", visible: true, opacity: 1, keep: 0.3 },
    { id: "digestive", label: "Digestive", color: "#e9a37f", visible: true, opacity: 1, keep: 0.14 },
    { id: "urinary", label: "Urinary", color: "#b9737f", visible: true, opacity: 1, keep: 0.4 },
    { id: "glands", label: "Glands and immune organs", color: "#9f86c9", visible: true, opacity: 1, keep: 0.35 },
    { id: "integumentary", label: "Skin", color: "#e8c4a8", visible: false, opacity: 0.35, keep: 0.12, error: 0.1 },
];
const MIN_TRIS = 60;
/** Thousands of tiny vessel branches add weight without helping a learner; keep the larger vessels. */
const MIN_VESSEL_MM = 40;

const parts = JSON.parse(fs.readFileSync(PARTS, "utf8"));

// BodyParts3D: millimetres, +X = body's left, -Y = anterior, +Z = up. Output: metres, +Y up, +Z anterior.
const all = parts.filter((p) => p.system && p.bounds);
const minX = Math.min(...all.map((p) => p.bounds[0])), maxX = Math.max(...all.map((p) => p.bounds[3]));
const minY = Math.min(...all.map((p) => p.bounds[1])), maxY = Math.max(...all.map((p) => p.bounds[4]));
const minZ = Math.min(...all.map((p) => p.bounds[2]));
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
const toWorld = (x, y, z) => [(x - cx) / 1000, (z - minZ) / 1000, -(y - cy) / 1000];

function readObj(fj) {
    const text = fs.readFileSync(path.join(OBJ_DIR, `${fj}.obj`), "utf8");
    const pos = [];
    const idx = [];
    // Source meshes repeat vertices along seams; welding by position lets the simplifier collapse across them.
    const seen = new Map();
    const remap = [];
    for (const line of text.split("\n")) {
        if (line.startsWith("v ")) {
            const key = line.trim();
            let i = seen.get(key);
            if (i === undefined) {
                const [, x, y, z] = key.split(/\s+/).map(Number);
                i = pos.length / 3;
                seen.set(key, i);
                pos.push(...toWorld(x, y, z));
            }
            remap.push(i);
        } else if (line.startsWith("f ")) {
            const v = line.trim().split(/\s+/).slice(1).map((t) => remap[parseInt(t, 10) - 1]);
            for (let i = 1; i + 1 < v.length; i++) {
                if (v[0] !== v[i] && v[i] !== v[i + 1] && v[0] !== v[i + 1]) idx.push(v[0], v[i], v[i + 1]);
            }
        }
    }
    return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

function simplify({ pos, idx }, keep, error = 0.02) {
    const tris = idx.length / 3;
    const target = Math.max(MIN_TRIS, Math.floor(tris * keep)) * 3;
    if (target >= idx.length) return compact(pos, idx);
    let [out] = MeshoptSimplifier.simplify(idx, pos, 3, target, error, []);
    // Faint "ghost" layers only need the silhouette, so fall back to the sloppy simplifier if topology blocks the target.
    if (error >= 0.1 && out.length > target * 1.5) [out] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, target, error);
    return compact(pos, out);
}

/** Drops unreferenced vertices so each mesh only stores what it draws. */
function compact(pos, idx) {
    const remap = new Int32Array(pos.length / 3).fill(-1);
    const p = [];
    const out = new Uint32Array(idx.length);
    let n = 0;
    for (let i = 0; i < idx.length; i++) {
        const v = idx[i];
        if (remap[v] < 0) {
            remap[v] = n++;
            p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        }
        out[i] = remap[v];
    }
    return { pos: new Float32Array(p), idx: out };
}

function normals(pos, idx) {
    const n = new Float32Array(pos.length);
    for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3];
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const k of [a, b, c]) {
            n[k] += nx;
            n[k + 1] += ny;
            n[k + 2] += nz;
        }
    }
    for (let i = 0; i < n.length; i += 3) {
        const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
        n[i] /= l;
        n[i + 1] /= l;
        n[i + 2] /= l;
    }
    return n;
}

/** Smooth outer shape around a cloud of points: splat, blur, extract an isosurface, relax it. */
function envelope(points, cell = 0.006, radius = 0.014) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < points.length; i += 3)
        for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], points[i + k]);
            max[k] = Math.max(max[k], points[i + k]);
        }
    const pad = radius * 3;
    for (let k = 0; k < 3; k++) {
        min[k] -= pad;
        max[k] += pad;
    }
    const dims = [0, 1, 2].map((k) => Math.ceil((max[k] - min[k]) / cell) + 1);
    const [nx, ny, nz] = dims;
    let grid = new Float32Array(nx * ny * nz);
    const r = Math.ceil(radius / cell);
    for (let i = 0; i < points.length; i += 3) {
        const gx = Math.round((points[i] - min[0]) / cell), gy = Math.round((points[i + 1] - min[1]) / cell), gz = Math.round((points[i + 2] - min[2]) / cell);
        for (let dz = -r; dz <= r; dz++)
            for (let dy = -r; dy <= r; dy++)
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy + dz * dz > r * r) continue;
                    const x = gx + dx, y = gy + dy, z = gz + dz;
                    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
                    grid[x + nx * (y + ny * z)] = 1;
                }
    }
    // Three box-blur passes turn the stamped voxels into a soft field, which rounds off the branch pattern.
    for (let pass = 0; pass < 3; pass++) {
        for (let axis = 0; axis < 3; axis++) {
            const next = new Float32Array(grid.length);
            const stride = axis === 0 ? 1 : axis === 1 ? nx : nx * ny;
            const len = dims[axis];
            for (let z = 0; z < nz; z++)
                for (let y = 0; y < ny; y++)
                    for (let x = 0; x < nx; x++) {
                        const i = x + nx * (y + ny * z);
                        const c = [x, y, z][axis];
                        let s = 0, w = 0;
                        for (let d = -2; d <= 2; d++) {
                            const cc = c + d;
                            if (cc < 0 || cc >= len) continue;
                            s += grid[i + d * stride];
                            w++;
                        }
                        next[i] = s / w;
                    }
            grid = next;
        }
    }
    const field = (x, y, z) => {
        const gx = Math.round((x - min[0]) / cell), gy = Math.round((y - min[1]) / cell), gz = Math.round((z - min[2]) / cell);
        if (gx < 0 || gy < 0 || gz < 0 || gx >= nx || gy >= ny || gz >= nz) return 1;
        return 0.5 - grid[gx + nx * (gy + ny * gz)];
    };
    const mesh = surfaceNets(dims, field, [min, max]);
    const pos = new Float32Array(mesh.positions.flat());
    const idx = new Uint32Array(mesh.cells.flatMap((c) => (c.length === 4 ? [c[0], c[1], c[2], c[0], c[2], c[3]] : c)));
    // Laplacian relaxation for an organic surface.
    const nbr = Array.from({ length: pos.length / 3 }, () => new Set());
    for (let i = 0; i < idx.length; i += 3)
        for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
            nbr[a].add(b);
            nbr[b].add(a);
        }
    for (let it = 0; it < 6; it++) {
        const next = new Float32Array(pos);
        for (let v = 0; v < nbr.length; v++) {
            if (!nbr[v].size) continue;
            let sx = 0, sy = 0, sz = 0;
            for (const u of nbr[v]) {
                sx += pos[u * 3];
                sy += pos[u * 3 + 1];
                sz += pos[u * 3 + 2];
            }
            const k = nbr[v].size;
            next[v * 3] = pos[v * 3] * 0.4 + (sx / k) * 0.6;
            next[v * 3 + 1] = pos[v * 3 + 1] * 0.4 + (sy / k) * 0.6;
            next[v * 3 + 2] = pos[v * 3 + 2] * 0.4 + (sz / k) * 0.6;
        }
        pos.set(next);
    }
    return { pos, idx };
}

function lungSources(side) {
    const name = side === "R" ? "right lung" : "left lung";
    const ids = fs
        .readFileSync(path.join(BP, "partof_element_parts.txt"), "utf8")
        .split("\n")
        .slice(1)
        .map((l) => l.split("\t"))
        .filter((c) => (c[1] || "").toLowerCase() === name)
        .map((c) => c[2].trim());
    const byId = new Map(parts.map((p) => [p.fj, p]));
    // Segmental trees fill the lung; main bronchi and hilar vessels would pull the shape into the mediastinum.
    return ids.filter((id) => /segment/i.test(byId.get(id)?.name ?? ""));
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

const manifest = {
    version: 1,
    credit: {
        text: "BodyParts3D, © The Database Center for Life Science, licensed under CC BY 4.0",
        url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
    },
    bounds: { min: toWorld(minX, maxY, minZ), max: toWorld(maxX, minY, Math.max(...all.map((p) => p.bounds[5]))) },
    systems: [],
    parts: {},
};

for (const sys of SYSTEMS) {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const rgb = [1, 3, 5].map((i) => (parseInt(sys.color.slice(i, i + 2), 16) / 255) ** 2.2); // sRGB -> linear
    const material = doc.createMaterial(sys.id).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(0.6).setMetallicFactor(0);
    const scene = doc.createScene(sys.id);
    let count = 0, triangles = 0;

    const add = (id, mesh) => {
        const nrm = normals(mesh.pos, mesh.idx);
        const prim = doc
            .createPrimitive()
            .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(mesh.pos).setBuffer(buffer))
            .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(nrm).setBuffer(buffer))
            .setIndices(doc.createAccessor().setType("SCALAR").setArray(mesh.pos.length / 3 < 65536 ? new Uint16Array(mesh.idx) : mesh.idx).setBuffer(buffer))
            .setMaterial(material);
        scene.addChild(doc.createNode(id).setMesh(doc.createMesh(id).addPrimitive(prim)));
        count++;
        triangles += mesh.idx.length / 3;
    };

    for (const p of parts) {
        if (p.system !== sys.id) continue;
        if (sys.id === "cardiovascular" && p.diag < MIN_VESSEL_MM) continue;
        const mesh = simplify(readObj(p.fj), sys.keep, sys.error);
        if (mesh.idx.length < 3) continue;
        add(p.fj, mesh);
        manifest.parts[p.fj] = { name: p.name, fma: p.fma, system: sys.id };
    }

    if (sys.id === "respiratory") {
        for (const [side, fma, label] of [["R", "FMA7309", "Right lung"], ["L", "FMA7310", "Left lung"]]) {
            const ids = lungSources(side);
            const cloud = [];
            for (const id of ids) {
                const { pos } = readObj(id);
                for (let i = 0; i < pos.length; i += 3) cloud.push(pos[i], pos[i + 1], pos[i + 2]);
            }
            const shell = envelope(new Float32Array(cloud));
            const mesh = simplify(shell, Math.min(1, 9000 / (shell.idx.length / 3)));
            add(`LUNG_${side}`, mesh);
            manifest.parts[`LUNG_${side}`] = { name: label, fma, system: "respiratory" };
            console.log(`  lung ${side}: ${ids.length} source trees -> ${mesh.idx.length / 3} triangles`);
        }
    }

    await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    const file = `${sys.id}.glb`;
    await io.write(path.join(OUT, file), doc);
    const size = fs.statSync(path.join(OUT, file)).size;
    manifest.systems.push({ id: sys.id, label: sys.label, file, color: sys.color, visible: sys.visible, opacity: sys.opacity, parts: count, triangles });
    console.log(`${sys.id}: ${count} parts, ${triangles} triangles, ${(size / 1024 / 1024).toFixed(2)} MB`);
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest));
console.log("manifest:", Object.keys(manifest.parts).length, "parts");
