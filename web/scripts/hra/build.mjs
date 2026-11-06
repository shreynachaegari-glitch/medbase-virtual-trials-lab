/**
 * Builds the 3D body in public/hra/ from Human Reference Atlas organs. Repeatable:
 *
 *   cd web/scripts/hra && npm install && node build.mjs
 *
 * Downloads are cached in .cache/. Each organ is joined into one mesh, simplified with meshoptimizer to a
 * triangle target, quantized and meshopt-compressed. The v1.3 male organs have no node transforms and share
 * one body frame, so they assemble into a body with no placement data.
 *
 * The v2.0 models folder holds only the brain, the pancreas and an 86 MB combined archive, so the individual
 * organs come from v1.3, the last release with all of them.
 *
 * Data: Human Reference Atlas 3D reference objects, HuBMAP, CC BY 4.0, from NLM Visible Human data. The brain
 * is the Allen Human Reference Atlas 3D, CC BY 4.0. These copies are simplified and compressed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, flatten, join, meshopt, prune, quantize, simplify, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../public/hra");
const CACHE = path.join(HERE, ".cache");
const BASE = "https://raw.githubusercontent.com/hubmapconsortium/ccf-releases/main/v1.3/models/";
const BUDGET_BYTES = 12_000_000;

/** `tris` is the triangle target after simplification. `only` keeps nodes whose name matches. */
const ORGANS = [
    { id: "skin", file: "VH_M_Skin.glb", tris: 60000 },
    { id: "brain", file: "Allen_M_Brain.glb", tris: 150000, only: /gyrus|lobule|cerebell|pons|medulla|midbrain|sulcus|lobe/i },
    { id: "eye-l", file: "VH_M_Eye_L.glb", tris: 8000, only: /sclera|cornea|eye_L$/i },
    { id: "eye-r", file: "VH_M_Eye_R.glb", tris: 8000, only: /sclera|cornea|eye_R$/i },
    { id: "lungs", file: "VH_M_Lung.glb", tris: 140000 },
    { id: "heart", file: "VH_M_Heart.glb", tris: 130000 },
    { id: "vessels", file: "VH_M_Blood_Vasculature.glb", tris: 140000 },
    { id: "liver", file: "VH_M_Liver.glb", tris: 60000 },
    { id: "pancreas", file: "VH_M_Pancreas.glb", tris: 14000 },
    { id: "spleen", file: "VH_M_Spleen.glb", tris: 16000 },
    { id: "kidney-l", file: "VH_M_Kidney_L.glb", tris: 40000 },
    { id: "kidney-r", file: "VH_M_Kidney_R.glb", tris: 40000 },
    { id: "small-intestine", file: "VH_M_Small_Intestine.glb", tris: 33000 },
    { id: "large-intestine", file: "SBU_M_Intestine_Large.glb", tris: 30000 },
    { id: "bladder", file: "VH_M_Urinary_Bladder.glb", tris: 10000 },
    { id: "spine", file: "VH_M_Spinal_Cord.glb", tris: 12000 },
    { id: "pelvis", file: "VH_M_Pelvis.glb", tris: 50000 },
    { id: "knee-l", file: "VH_M_Knee_L.glb", tris: 20000 },
    { id: "knee-r", file: "VH_M_Knee_R.glb", tris: 20000 },
];

const fetchCached = async (file) => {
    fs.mkdirSync(CACHE, { recursive: true });
    const target = path.join(CACHE, file);
    if (fs.existsSync(target)) return target;
    const response = await fetch(BASE + file);
    if (!response.ok) throw new Error(`${file}: ${response.status}`);
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    return target;
};

const countTris = (doc) => {
    let total = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            const indices = prim.getIndices();
            total += (indices ? indices.getCount() : prim.getAttribute("POSITION").getCount()) / 3;
        }
    }
    return Math.round(total);
};

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
fs.mkdirSync(OUT, { recursive: true });
const manifest = [];

for (const organ of ORGANS) {
    const doc = await io.read(await fetchCached(organ.file));
    const root = doc.getRoot();
    if (process.env.HRA_LIST_NODES) console.log(organ.id, root.listNodes().map((n) => n.getName()).join(" "));
    if (organ.only) {
        for (const node of root.listNodes()) {
            if (node.getMesh() && !organ.only.test(node.getName())) node.setMesh(null);
        }
    }
    // One plain material and no textures: the viewer colours each organ itself.
    const material = doc.createMaterial(organ.id);
    for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            prim.setMaterial(material);
            for (const semantic of prim.listSemantics()) {
                if (semantic !== "POSITION" && semantic !== "NORMAL") prim.setAttribute(semantic, null);
            }
        }
    }
    await doc.transform(flatten(), join({ keepNamed: false }), weld());
    const before = countTris(doc);
    const ratio = Math.min(1, organ.tris / before);
    await doc.transform(
        simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }),
        dedup(),
        prune(),
        quantize({ quantizePosition: 14, quantizeNormal: 8 }),
        meshopt({ encoder: MeshoptEncoder, level: "medium" }),
    );
    for (const mesh of root.listMeshes()) mesh.setName(organ.id);
    for (const node of root.listNodes()) node.setName(organ.id);
    const target = path.join(OUT, `${organ.id}.glb`);
    await io.write(target, doc);
    const bytes = fs.statSync(target).size;
    manifest.push({ id: organ.id, file: `${organ.id}.glb`, bytes, triangles: countTris(doc), source: organ.file });
    console.log(`${organ.id.padEnd(16)} ${String(before).padStart(7)} -> ${String(countTris(doc)).padStart(6)} tris  ${(bytes / 1e6).toFixed(2)} MB`);
}

const total = manifest.reduce((sum, m) => sum + m.bytes, 0);
fs.writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify(
        {
            source: "Human Reference Atlas 3D reference objects, HuBMAP Consortium, v1.3",
            license: "CC BY 4.0",
            derived_from: "National Library of Medicine Visible Human data; the brain is the Allen Human Reference Atlas 3D (CC BY 4.0)",
            changes: "Parts joined per organ, simplified, quantized and meshopt-compressed by this project.",
            total_bytes: total,
            organs: manifest,
        },
        null,
        1,
    ),
);
console.log(`total ${(total / 1e6).toFixed(2)} MB`);
if (total > BUDGET_BYTES) {
    console.error(`Over the ${BUDGET_BYTES / 1e6} MB budget. Lower some triangle targets.`);
    process.exitCode = 1;
}
