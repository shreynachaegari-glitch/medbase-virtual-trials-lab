import { Component, lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Box, MousePointerClick } from "lucide-react";
import { ATLAS_REGIONS, CONTEXT_MESHES, ORGANS, regionOfMesh, type MeshId } from "@/data/bodyAtlas";
import { diseases, getDiseaseById } from "@/data/knowledge";
import { cn } from "@/lib/utils";
import { Disclosure, ExternalLink } from "@/components/lab/primitives";
import type { MeshState } from "./BodyScene";
import { canUseWebGL } from "./webgl";

const BodyScene = lazy(() => import("./BodyScene"));

const ALL_MESHES: MeshId[] = ["skin", ...ATLAS_REGIONS.flatMap((r) => r.meshes).filter((m) => m !== "skin"), ...CONTEXT_MESHES];
const CLICKABLE: MeshId[] = ALL_MESHES.filter((m) => m !== "skin" && m !== "vessels" && !CONTEXT_MESHES.includes(m));

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

const NoScene = () => (
    <div data-testid="atlas-no-3d" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Box className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm">The 3D body can&rsquo;t run in this browser.</p>
        <p className="text-xs text-muted-foreground">The list of body regions has everything the model would show.</p>
    </div>
);

const RegionDetail = ({ regionId }: { regionId: string | null }) => {
    const reduce = useReducedMotion();
    const region = ATLAS_REGIONS.find((r) => r.id === regionId) ?? null;
    const conditions = useMemo(() => (region?.conditions ?? []).flatMap((id) => {
        const disease = getDiseaseById(id);
        return disease ? [disease] : [];
    }), [region]);
    const organ = region?.organ ? ORGANS[region.organ] : null;
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key={regionId ?? "none"}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                aria-live="polite"
                data-testid="atlas-detail"
            >
                {region ? (
                    <>
                        <h3 className="text-lg font-semibold tracking-tight">{region.label}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{region.signs}</p>
                        {region.where && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{region.where}</p>}
                        <p className="label-caps mt-4">Conditions in this library that can involve it</p>
                        <ul className="mt-2 divide-y divide-border border-y border-border">
                            {conditions.map((d) => (
                                <li key={d.id}>
                                    <Link to={`/learn/${d.id}`} data-testid="atlas-condition" className="group flex items-start gap-3 py-2.5 transition-colors hover:bg-card/70">
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium group-hover:text-primary">
                                                {d.name}
                                                <span className="label-caps font-normal">{d.category}</span>
                                            </span>
                                            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{d.description}</span>
                                        </span>
                                        <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        {organ && (
                            <div className="mt-3">
                                <Disclosure summary={`Inside: ${organ.title.toLowerCase()}, part by part`}>
                                    <p className="text-xs leading-relaxed text-muted-foreground">{organ.intro}</p>
                                    <dl className="mt-2 space-y-2 text-xs leading-relaxed">
                                        {organ.parts.map((part) => (
                                            <div key={part.id}>
                                                <dt className="font-medium">{part.label}</dt>
                                                <dd className="text-muted-foreground">{part.text}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </Disclosure>
                            </div>
                        )}
                        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                            A reference index, not a symptom checker. These aren&rsquo;t ranked by likelihood, and this doesn&rsquo;t suggest a diagnosis.
                        </p>
                    </>
                ) : (
                    <div className="flex h-full flex-col justify-center gap-2 py-6">
                        <MousePointerClick className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                        <p className="text-lg font-semibold tracking-tight">Click an organ</p>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            See which of the {diseases.length} conditions in this library can involve it, and read each one. Drag to turn the body, and scroll or pinch to move closer.
                        </p>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
};

/** Learn's data, reached through the body. The list works by keyboard, and without 3D. */
export const BodyAtlas = () => {
    const [selected, setSelected] = useState<string | null>(null);
    const [hover, setHover] = useState<MeshId | null>(null);
    const [progress, setProgress] = useState({ loaded: 0, failed: [] as MeshId[] });
    const [webgl] = useState(canUseWebGL);

    const region = ATLAS_REGIONS.find((r) => r.id === selected) ?? null;
    const hoverRegion = hover ? regionOfMesh(hover) : undefined;

    const states = useMemo(() => {
        const out: Partial<Record<MeshId, MeshState>> = {};
        for (const mesh of ALL_MESHES) {
            const inSelected = region?.meshes.includes(mesh) ?? false;
            const inHover = hoverRegion?.meshes.includes(mesh) ?? false;
            out[mesh] = { faded: Boolean(region) && !inSelected, glow: inSelected ? 0.35 : inHover ? 0.22 : 0 };
        }
        return out;
    }, [region, hoverRegion]);

    const onSelect = useCallback((mesh: MeshId | null) => setSelected(mesh ? (regionOfMesh(mesh)?.id ?? null) : null), []);
    const onProgress = useCallback((loaded: number, failed: MeshId[]) => setProgress({ loaded, failed }), []);
    const loading = webgl && progress.loaded + progress.failed.length < ALL_MESHES.length;
    // The shell has no click target of its own, and focusing on it means the whole body.
    const focus = region && region.id !== "skin" && region.id !== "blood" ? region.meshes : null;

    return (
        <section aria-labelledby="atlas-heading" className="mt-10" data-testid="body-atlas">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="label-caps">Inside the body</p>
                    <h2 id="atlas-heading" className="mt-2 text-xl font-semibold tracking-tight">Start from the organ</h2>
                </div>
                <Link to="/anatomy" className="text-xs text-primary underline-offset-2 hover:underline">Explore every structure in the full anatomy viewer</Link>
            </div>

            <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-[13rem_minmax(0,1fr)_23rem]">
                <nav aria-label="Body regions" className="order-2 bg-background p-2 lg:order-none">
                    <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1" data-testid="atlas-list">
                        {ATLAS_REGIONS.map((r) => {
                            const active = r.id === selected;
                            return (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => setSelected(active ? null : r.id)}
                                        onPointerEnter={() => setHover(r.meshes[0])}
                                        onPointerLeave={() => setHover(null)}
                                        className={cn(
                                            "flex w-full items-baseline justify-between gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors",
                                            active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-card hover:text-foreground",
                                        )}
                                    >
                                        <span className="min-w-0">{r.label}</span>
                                        <span className={cn("tnum shrink-0 text-[11px]", active ? "text-background" : "text-muted-foreground")}>{r.conditions.length}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="relative order-1 h-[56vh] min-h-[22rem] bg-[radial-gradient(ellipse_at_50%_38%,hsl(217_60%_14%/0.55),hsl(var(--background))_68%)] lg:order-none lg:h-[42rem]" data-testid="atlas-canvas">
                    {webgl ? (
                        <SceneBoundary fallback={<NoScene />}>
                            <Suspense fallback={null}>
                                <BodyScene
                                    meshes={ALL_MESHES}
                                    states={states}
                                    clickable={CLICKABLE}
                                    focus={focus}
                                    onSelect={onSelect}
                                    onHover={setHover}
                                    onProgress={onProgress}
                                    idleSpin
                                    label="A 3D human body with its organs. Use the list of body regions to choose one without a pointer."
                                />
                            </Suspense>
                        </SceneBoundary>
                    ) : (
                        <NoScene />
                    )}
                    {loading && progress.failed.length === 0 && (
                        <p role="status" data-testid="atlas-loading" className="tnum pointer-events-none absolute left-3 top-3 rounded-full border border-border bg-card/90 px-2.5 py-1 text-xs text-muted-foreground">
                            Loading organs, {progress.loaded} of {ALL_MESHES.length}
                        </p>
                    )}
                    {progress.failed.length > 0 && (
                        <p role="status" data-testid="atlas-failed" className="absolute inset-x-3 top-3 rounded border border-[hsl(var(--prov-extrapolated))]/50 bg-card/95 px-2.5 py-1.5 text-xs">
                            {progress.failed.length === ALL_MESHES.length ? "The 3D organs couldn’t be loaded." : "Some 3D organs couldn’t be loaded."} The list of body regions has everything they would show.
                        </p>
                    )}
                    {hoverRegion && !selected && (
                        <p aria-hidden="true" className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-card/90 px-3 py-1 text-xs">{hoverRegion.label}</p>
                    )}
                </div>

                <div className="order-3 min-w-0 bg-background p-4 lg:max-h-[42rem] lg:overflow-y-auto" tabIndex={region ? 0 : undefined} role={region ? "region" : undefined} aria-label={region ? `${region.label} details` : undefined}>
                    <RegionDetail regionId={selected} />
                </div>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="atlas-credit">
                3D organs:{" "}
                <ExternalLink className="underline underline-offset-2" href="https://humanatlas.io/3d-reference-library">Human Reference Atlas</ExternalLink>
                , HuBMAP Consortium, CC BY 4.0, from National Library of Medicine Visible Human data. Brain:{" "}
                <ExternalLink className="underline underline-offset-2" href="https://community.brain-map.org/t/allen-human-reference-atlas-3d-2020-new/405">Allen Human Reference Atlas 3D</ExternalLink>
                , CC BY 4.0. Simplified and compressed for this site. A single reference anatomy for learning, not a model of anyone&rsquo;s body.
            </p>
        </section>
    );
};
