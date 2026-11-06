import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import * as THREE from "three";
import { PanelLeftClose, PanelLeftOpen, RotateCcw, Search, X } from "lucide-react";
import Header from "@/components/Header";
import { getDiseaseById } from "@/data/knowledge";
import { describePart, SYSTEM_INFO, type SystemId } from "@/data/anatomy";
import { cn } from "@/lib/utils";

/**
 * 3D anatomy explorer over the BodyParts3D model (see scripts/anatomy). One GLB per body system is loaded
 * only when that system is switched on. Model space: metres, +Y up, +Z towards the viewer, +X the body's left.
 */
const BASE = `${import.meta.env.BASE_URL}anatomy/`;

interface SystemDef {
    id: string;
    label: string;
    file: string;
    color: string;
    visible: boolean;
    opacity: number;
}
interface PartDef {
    name: string;
    fma: string;
    system: string;
}
interface Manifest {
    credit: { text: string; url: string };
    systems: SystemDef[];
    parts: Record<string, PartDef>;
}
interface Layer {
    on: boolean;
    opacity: number;
}
interface FocusRequest {
    target: THREE.Vector3;
    camera: THREE.Vector3;
}

const HOME: FocusRequest = { target: new THREE.Vector3(0, 0.95, 0), camera: new THREE.Vector3(0, 1.05, 3.3) };
const HOME_TARGET = HOME.target.toArray() as [number, number, number];
/** Preset views; the body's left is +X, so "Left side" looks at it from +X. */
const VIEWS: { label: string; camera: [number, number, number] }[] = [
    { label: "Front", camera: [0, 1.05, 3.3] },
    { label: "Back", camera: [0, 1.05, -3.3] },
    { label: "Left", camera: [3.3, 1.05, 0] },
    { label: "Right", camera: [-3.3, 1.05, 0] },
];
const VEIN = /vein|vena|venous|sinus/i;
const colorFor = (sys: SystemDef, id: string, name: string) => {
    if (sys.id === "cardiovascular") return VEIN.test(name) ? "#5f87c9" : "#d9655d";
    if (sys.id === "respiratory") return id.startsWith("LUNG_") ? "#f2a7b8" : "#e9c9c2";
    return sys.color;
};
/** A faint layer is a silhouette, not something to click: clicks pass through to what is inside. */
const PICK_MIN_OPACITY = 0.3;

/** `left` puts the tag on the viewer's left of its point so neighbouring tags in the chest don't collide. */
const LANDMARKS: { system: string; label: string; left?: boolean; test: (id: string, name: string) => boolean }[] = [
    { system: "nervous", label: "Brain", test: (_, n) => /gyrus|cerebellum|pons|midbrain/i.test(n) },
    { system: "cardiovascular", label: "Heart", left: true, test: (_, n) => /wall of|cusp|leaflet|papillary/i.test(n) },
    { system: "respiratory", label: "Right lung", left: true, test: (id) => id === "LUNG_R" },
    { system: "respiratory", label: "Left lung", test: (id) => id === "LUNG_L" },
    { system: "digestive", label: "Liver", left: true, test: (_, n) => /hepatovenous segment|caudate lobe of liver/i.test(n) },
    { system: "digestive", label: "Stomach", test: (_, n) => /^stomach$/i.test(n) },
    { system: "urinary", label: "Left kidney", test: (_, n) => /^left kidney$/i.test(n) },
    { system: "skeletal", label: "Femur", left: true, test: (_, n) => /^right femur$/i.test(n) },
];

const meshesOf = (root: THREE.Object3D) => {
    const out = new Map<string, THREE.Mesh>();
    root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) out.set(o.name || o.parent?.name || o.uuid, o as THREE.Mesh);
    });
    return out;
};

const frame = (obj: THREE.Object3D, from: THREE.Vector3, target: THREE.Vector3): FocusRequest => {
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.04);
    const dir = from.clone().sub(target).normalize();
    return { target: center, camera: center.clone().add(dir.multiplyScalar(Math.max(radius * 3.2, 0.3))) };
};

interface LayerProps {
    sys: SystemDef;
    manifest: Manifest;
    layer: Layer;
    selected: string | null;
    hovered: string | null;
    labels: boolean;
    pendingFocus: string | null;
    onHover: (id: string | null) => void;
    onSelect: (id: string) => void;
    onFocus: (f: FocusRequest) => void;
    clearPending: () => void;
}

const SystemLayer = ({ sys, manifest, layer, selected, hovered, labels, pendingFocus, onHover, onSelect, onFocus, clearPending }: LayerProps) => {
    const { scene } = useGLTF(BASE + sys.file);
    const camera = useThree((s) => s.camera);
    const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;

    const root = useMemo(() => {
        const r = scene.clone(true);
        meshesOf(r).forEach((m, id) => {
            const lung = id.startsWith("LUNG_");
            m.userData.partId = id;
            m.userData.lung = lung;
            m.material = new THREE.MeshPhysicalMaterial({
                color: colorFor(sys, id, manifest.parts[id]?.name ?? ""),
                roughness: 0.5,
                metalness: 0,
                clearcoat: 0.3,
                clearcoatRoughness: 0.4,
                side: lung ? THREE.DoubleSide : THREE.FrontSide,
            });
        });
        return r;
    }, [scene, sys, manifest]);
    const meshes = useMemo(() => meshesOf(root), [root]);

    useEffect(() => () => meshes.forEach((m) => (m.material as THREE.Material).dispose()), [meshes]);

    // Opacity and pickability follow the layer controls.
    useEffect(() => {
        meshes.forEach((m) => {
            const mat = m.material as THREE.MeshPhysicalMaterial;
            const o = m.userData.lung ? layer.opacity * 0.35 : layer.opacity;
            mat.opacity = o;
            mat.transparent = o < 0.999;
            mat.depthWrite = o >= 0.999;
            mat.needsUpdate = true;
            m.raycast = layer.opacity >= PICK_MIN_OPACITY ? THREE.Mesh.prototype.raycast : () => {};
        });
    }, [meshes, layer.opacity]);

    useEffect(() => {
        meshes.forEach((m, id) => {
            const mat = m.material as THREE.MeshPhysicalMaterial;
            mat.emissive.set(id === selected ? "#f5b301" : id === hovered ? "#7dd3fc" : "#000000");
            mat.emissiveIntensity = id === selected ? 0.55 : id === hovered ? 0.35 : 0;
        });
    }, [meshes, selected, hovered]);

    // A search result in this layer gets framed once the layer has loaded.
    useEffect(() => {
        if (!pendingFocus) return;
        const m = meshes.get(pendingFocus);
        if (!m) return;
        onFocus(frame(m, camera.position, controls?.target ?? HOME.target));
        clearPending();
    }, [pendingFocus, meshes, camera, controls, onFocus, clearPending]);

    const anchors = useMemo(() => {
        return LANDMARKS.filter((l) => l.system === sys.id).flatMap((l) => {
            const box = new THREE.Box3();
            meshes.forEach((m, id) => {
                if (l.test(id, manifest.parts[id]?.name ?? "")) box.expandByObject(m);
            });
            return box.isEmpty() ? [] : [{ label: l.label, left: !!l.left, at: box.getCenter(new THREE.Vector3()) }];
        });
    }, [meshes, manifest, sys.id]);

    const idOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.object.userData.partId as string) ?? null;

    return (
        <group>
            <primitive
                object={root}
                onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                    e.stopPropagation();
                    onHover(idOf(e));
                }}
                onPointerOut={(e: ThreeEvent<PointerEvent>) => {
                    e.stopPropagation();
                    onHover(null);
                }}
                onClick={(e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    const id = idOf(e);
                    if (id) onSelect(id);
                }}
                onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    onFocus(frame(e.object, camera.position, controls?.target ?? HOME.target));
                }}
            />
            {labels &&
                layer.opacity >= PICK_MIN_OPACITY &&
                anchors.map((a) => (
                    <Html key={a.label} position={a.at} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
                        <div
                            className={cn("flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap", a.left && "-translate-x-full flex-row-reverse")}
                            style={{ marginLeft: a.left ? 4 : -4 }}
                        >
                            <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_0_2px_rgba(15,23,42,0.6)]" />
                            <span className="rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">{a.label}</span>
                        </div>
                    </Html>
                ))}
        </group>
    );
};

/** Eases the camera and orbit target towards a requested view. */
const CameraRig = ({ focus, reduce }: { focus: FocusRequest | null; reduce: boolean }) => {
    const camera = useThree((s) => s.camera);
    const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
    const active = useRef<FocusRequest | null>(null);
    useEffect(() => {
        active.current = focus;
    }, [focus]);
    useFrame(() => {
        const f = active.current;
        if (!f || !controls) return;
        const k = reduce ? 1 : 0.12;
        camera.position.lerp(f.camera, k);
        controls.target.lerp(f.target, k);
        controls.update();
        if (camera.position.distanceTo(f.camera) < 0.002 && controls.target.distanceTo(f.target) < 0.002) active.current = null;
    });
    return null;
};

const Loading = () => {
    const { active, progress } = useProgress();
    if (!active) return null;
    return (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1 text-xs text-slate-200">
            Loading model… {Math.round(progress)}%
        </div>
    );
};

const AnatomyPage = () => {
    const [manifest, setManifest] = useState<Manifest | null>(null);
    const [failed, setFailed] = useState(false);
    const [layers, setLayers] = useState<Record<string, Layer>>({});
    const [selected, setSelected] = useState<string | null>(null);
    const [hovered, setHovered] = useState<string | null>(null);
    const [labels, setLabels] = useState(true);
    const [query, setQuery] = useState("");
    const [focus, setFocus] = useState<FocusRequest | null>(null);
    const [pendingFocus, setPendingFocus] = useState<string | null>(null);
    const [panelOpen, setPanelOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 640);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    useEffect(() => {
        fetch(`${BASE}manifest.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((m: Manifest) => {
                setManifest(m);
                setLayers(Object.fromEntries(m.systems.map((s) => [s.id, { on: s.visible, opacity: s.opacity }])));
            })
            .catch(() => setFailed(true));
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => {
        document.body.style.cursor = hovered ? "pointer" : "";
        return () => {
            document.body.style.cursor = "";
        };
    }, [hovered]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!manifest || q.length < 2) return [];
        const seen = new Set<string>();
        return Object.entries(manifest.parts)
            .filter(([, p]) => p.name.toLowerCase().includes(q) && !seen.has(p.name) && seen.add(p.name))
            .slice(0, 8);
    }, [manifest, query]);

    const part = selected && manifest ? manifest.parts[selected] : null;
    const info = part ? describePart(part.name, part.system) : null;
    const sysOf = (id: string) => manifest?.systems.find((s) => s.id === id);

    const setLayer = (id: string, patch: Partial<Layer>) => setLayers((l) => ({ ...l, [id]: { ...l[id], ...patch } }));
    const choose = (id: string) => {
        const p = manifest!.parts[id];
        const layer = layers[p.system];
        if (!layer.on || layer.opacity < PICK_MIN_OPACITY) setLayer(p.system, { on: true, opacity: Math.max(layer.opacity, 1) });
        setSelected(id);
        setPendingFocus(id);
        setQuery("");
        if (window.innerWidth < 640) setPanelOpen(false);
    };

    return (
        <div className="flex min-h-screen flex-col">
            <Header />
            <main className="relative h-[calc(100vh-3.5rem)] min-h-[520px] overflow-hidden bg-[radial-gradient(ellipse_at_center,#1e293b_0%,#0b1120_70%)] text-slate-100">
                {failed && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-300">The 3D model could not be loaded. Check your connection and reload the page.</p>}

                {manifest && (
                    <Canvas
                        dpr={[1, 2]}
                        camera={{ position: HOME.camera.toArray(), fov: 35, near: 0.01, far: 50 }}
                        gl={{ antialias: true, alpha: true }}
                        onPointerMissed={() => setSelected(null)}
                    >
                        <hemisphereLight args={["#ffffff", "#334155", 0.9]} />
                        <ambientLight intensity={0.35} />
                        <directionalLight position={[2, 4, 3]} intensity={1.5} />
                        <directionalLight position={[-3, 2, -2]} intensity={0.6} />
                        {manifest.systems.map((s) =>
                            layers[s.id]?.on && layers[s.id].opacity > 0 ? (
                                <Suspense key={s.id} fallback={null}>
                                    <SystemLayer
                                        sys={s}
                                        manifest={manifest}
                                        layer={layers[s.id]}
                                        selected={selected}
                                        hovered={hovered}
                                        labels={labels}
                                        pendingFocus={pendingFocus}
                                        onHover={setHovered}
                                        onSelect={setSelected}
                                        onFocus={setFocus}
                                        clearPending={() => setPendingFocus(null)}
                                    />
                                </Suspense>
                            ) : null,
                        )}
                        <OrbitControls makeDefault target={HOME_TARGET} enableDamping minDistance={0.15} maxDistance={6} />
                        <CameraRig focus={focus} reduce={reduce} />
                    </Canvas>
                )}
                <Loading />

                {hovered && manifest?.parts[hovered] && (
                    <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 rounded bg-slate-900/85 px-2.5 py-1 text-xs text-white">{manifest.parts[hovered].name}</div>
                )}

                {/* Control panel */}
                <button
                    type="button"
                    onClick={() => setPanelOpen((v) => !v)}
                    aria-expanded={panelOpen}
                    aria-controls="anatomy-panel"
                    className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs backdrop-blur hover:bg-slate-800"
                >
                    {panelOpen ? <PanelLeftClose className="h-4 w-4" aria-hidden="true" /> : <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />}
                    Anatomy Explorer
                </button>
                {panelOpen && manifest && (
                    <aside id="anatomy-panel" className="absolute left-3 top-14 z-10 max-h-[calc(100%-7rem)] w-[min(18rem,calc(100%-1.5rem))] overflow-y-auto rounded-lg border border-white/10 bg-slate-900/85 p-3 shadow-xl backdrop-blur">
                        <label className="relative block">
                            <span className="sr-only">Search structures</span>
                            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search, e.g. kidney, femur"
                                className="w-full rounded-md border border-white/10 bg-slate-950/60 py-2 pl-8 pr-2 text-sm text-slate-100 placeholder:text-slate-500"
                            />
                        </label>
                        {results.length > 0 && (
                            <ul className="mt-1 overflow-hidden rounded-md border border-white/10">
                                {results.map(([id, p]) => (
                                    <li key={id}>
                                        <button type="button" onClick={() => choose(id)} className="flex w-full justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-white/10">
                                            <span className="truncate">{p.name}</span>
                                            <span className="shrink-0 text-slate-400">{sysOf(p.system)?.label}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <ul className="mt-3 space-y-1">
                            {manifest.systems.map((s) => {
                                const l = layers[s.id];
                                return (
                                    <li key={s.id} className="rounded-md bg-white/5 px-2.5 py-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="flex items-center gap-2 text-sm">
                                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                                                {s.label}
                                            </span>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={l.on}
                                                aria-label={`Show ${s.label}`}
                                                onClick={() => setLayer(s.id, { on: !l.on })}
                                                className={cn("relative h-5 w-9 rounded-full transition-colors", l.on ? "bg-sky-500" : "bg-slate-600")}
                                            >
                                                <span className={cn("absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white transition-transform", l.on ? "translate-x-[18px]" : "translate-x-0.5")} />
                                            </button>
                                        </div>
                                        {l.on && (
                                            <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                                                Opacity
                                                <input
                                                    type="range"
                                                    min={0.05}
                                                    max={1}
                                                    step={0.05}
                                                    value={l.opacity}
                                                    onChange={(e) => setLayer(s.id, { opacity: Number(e.target.value) })}
                                                    className="h-1 flex-1 accent-sky-500"
                                                />
                                            </label>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>

                        <div className="mt-3 flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-xs text-slate-300">
                                <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="accent-sky-500" />
                                Labels
                            </label>
                            <button
                                type="button"
                                onClick={() => setFocus({ target: HOME.target.clone(), camera: HOME.camera.clone() })}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10"
                            >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                Reset view
                            </button>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-1" role="group" aria-label="Preset views">
                            {VIEWS.map((v) => (
                                <button
                                    key={v.label}
                                    type="button"
                                    onClick={() => setFocus({ target: HOME.target.clone(), camera: new THREE.Vector3(...v.camera) })}
                                    className="rounded-md border border-white/10 px-1 py-1 text-[11px] hover:bg-white/10"
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Drag to rotate, scroll to zoom in, click a structure to read about it, double-click to fly to it.</p>
                    </aside>
                )}

                {/* Info panel */}
                {part && info && (
                    <aside className="absolute right-3 top-3 z-10 w-[min(20rem,calc(100%-1.5rem))] rounded-lg border border-white/10 bg-slate-900/85 p-4 shadow-xl backdrop-blur max-sm:bottom-3 max-sm:top-auto">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-wider text-slate-400">Structure</p>
                                <h2 className="mt-0.5 text-base font-semibold">{part.name}</h2>
                            </div>
                            <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="rounded p-1 hover:bg-white/10">
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                            {SYSTEM_INFO[part.system as SystemId]?.label ?? sysOf(part.system)?.label} system{info.title.toLowerCase() !== part.name.toLowerCase() ? ` · ${info.title}` : ""}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-slate-200">{info.text}</p>
                        {info.related.some((id) => getDiseaseById(id)) && (
                            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                                <span className="text-[11px] uppercase tracking-wider text-slate-400">Related</span>
                                {info.related.map((id) => {
                                    const d = getDiseaseById(id);
                                    return d ? (
                                        <Link key={id} to={`/learn/${id}`} className="text-xs text-sky-300 hover:underline">
                                            {d.name}
                                        </Link>
                                    ) : null;
                                })}
                            </div>
                        )}
                        <p className="mt-3 text-[10px] text-slate-500">{part.fma}</p>
                    </aside>
                )}

                {manifest && (
                    <p className="absolute bottom-2 left-3 z-10 max-w-[60%] text-[10px] leading-snug text-slate-400">
                        Model:{" "}
                        <a href={manifest.credit.url} target="_blank" rel="noreferrer" className="underline hover:text-slate-200">
                            {manifest.credit.text}
                        </a>
                        . Educational model, not for diagnosis.
                    </p>
                )}
            </main>
        </div>
    );
};

export default AnatomyPage;
