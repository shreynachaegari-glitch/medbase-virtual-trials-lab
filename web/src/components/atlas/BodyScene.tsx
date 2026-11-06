import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useReducedMotion } from "motion/react";
import { AdditiveBlending, Box3, Color, FrontSide, Vector3, type Mesh, type MeshStandardMaterial, type Object3D, type ShaderMaterial } from "three";
import { MESH_COLOURS, type MeshId } from "@/data/bodyAtlas";

/** The body as it stands in the atlas: the organs share one frame, head near y 0.9 and pelvis near y 0. */
const HOME_TARGET = new Vector3(0, 0.46, 0.02);
const HOME_CAMERA = new Vector3(0, 0.52, 1.5);
const IDLE_SPIN = 0.55;
const url = (id: MeshId) => `${import.meta.env.BASE_URL}hra/${id}.glb`;

export interface MeshState {
    /** Fades back while something else is in focus. */
    faded?: boolean;
    /** 0 to 1: extra glow. On Trials this is driven by a simulated value, and nothing else. */
    glow?: number;
}

interface PartProps {
    id: MeshId;
    state: MeshState;
    clickable: boolean;
    reduce: boolean;
    onSelect?: (id: MeshId) => void;
    onHover?: (id: MeshId | null) => void;
    onLoaded: (id: MeshId, center: Vector3, radius: number) => void;
}

const useModel = (id: MeshId) => {
    const { scene } = useGLTF(url(id), false, true);
    return useMemo(() => {
        scene.updateMatrixWorld(true);
        let found: Mesh | null = null;
        scene.traverse((object: Object3D) => {
            if (!found && (object as Mesh).isMesh) found = object as Mesh;
        });
        if (!found) throw new Error(`${id}: no mesh`);
        const mesh = found as Mesh;
        const box = new Box3().setFromObject(mesh);
        return { geometry: mesh.geometry, matrix: mesh.matrixWorld.clone(), center: box.getCenter(new Vector3()), radius: box.getSize(new Vector3()).length() / 2 };
    }, [scene, id]);
};

const OPACITY = { vessels: 0.5 } as Partial<Record<MeshId, number>>;
const NO_RAYCAST = () => null;

const Part = ({ id, state, clickable, reduce, onSelect, onHover, onLoaded }: PartProps) => {
    const model = useModel(id);
    const material = useRef<MeshStandardMaterial>(null);
    const { invalidate } = useThree();
    const emissive = useMemo(() => new Color(MESH_COLOURS[id]), [id]);
    const baseOpacity = OPACITY[id] ?? 1;
    const targetOpacity = state.faded ? Math.min(0.12, baseOpacity) : baseOpacity;
    const targetGlow = state.glow ?? 0;

    useEffect(() => {
        onLoaded(id, model.center, model.radius);
        invalidate();
    }, [id, model, onLoaded, invalidate]);

    useFrame((_, delta) => {
        const m = material.current;
        if (!m) return;
        const rate = reduce ? 1 : Math.min(1, delta * 4);
        const nextGlow = m.emissiveIntensity + (targetGlow - m.emissiveIntensity) * rate;
        const nextOpacity = m.opacity + (targetOpacity - m.opacity) * rate;
        const settled = Math.abs(nextGlow - targetGlow) < 0.003 && Math.abs(nextOpacity - targetOpacity) < 0.003;
        m.emissiveIntensity = settled ? targetGlow : nextGlow;
        m.opacity = settled ? targetOpacity : nextOpacity;
        const transparent = m.opacity < 0.999;
        // Three compiles an opaque shader that ignores opacity, so a change of mode needs a new one.
        if (m.transparent !== transparent) {
            m.transparent = transparent;
            m.needsUpdate = true;
        }
        m.depthWrite = m.opacity > 0.4;
        if (!settled) invalidate();
    });

    useEffect(() => invalidate(), [targetGlow, targetOpacity, invalidate]);

    return (
        <mesh
            geometry={model.geometry}
            matrixAutoUpdate={false}
            matrix={model.matrix}
            raycast={clickable ? undefined : NO_RAYCAST}
            onClick={clickable && onSelect ? (e) => {
                if (e.delta > 4) return;
                e.stopPropagation();
                onSelect(id);
            } : undefined}
            onPointerOver={clickable && onHover ? (e) => {
                e.stopPropagation();
                onHover(id);
            } : undefined}
            onPointerOut={clickable && onHover ? () => onHover(null) : undefined}
        >
            <meshStandardMaterial ref={material} color={MESH_COLOURS[id]} emissive={emissive} emissiveIntensity={0} roughness={0.52} metalness={0.05} transparent={baseOpacity < 1} opacity={baseOpacity} />
        </mesh>
    );
};

const SHELL_VERTEX = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
    vec4 world = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-world.xyz);
    gl_Position = projectionMatrix * world;
}`;

const SHELL_FRAGMENT = `
uniform vec3 tint;
uniform float strength;
varying vec3 vNormal;
varying vec3 vView;
void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
    gl_FragColor = vec4(tint, rim * strength);
}`;

/** The skin as a glass outline: only its edges catch light, so the organs inside stay visible. */
const Shell = ({ glow, reduce, onLoaded }: { glow: number; reduce: boolean; onLoaded: PartProps["onLoaded"] }) => {
    const model = useModel("skin");
    const material = useRef<ShaderMaterial>(null);
    const { invalidate } = useThree();
    const uniforms = useMemo(() => ({ tint: { value: new Color(MESH_COLOURS.skin) }, strength: { value: 0.55 } }), []);
    const target = 0.55 + glow * 0.9;

    useEffect(() => {
        onLoaded("skin", model.center, model.radius);
        invalidate();
    }, [model, onLoaded, invalidate]);
    useEffect(() => invalidate(), [target, invalidate]);

    useFrame((_, delta) => {
        const m = material.current;
        if (!m) return;
        const current = m.uniforms.strength.value as number;
        const next = current + (target - current) * (reduce ? 1 : Math.min(1, delta * 4));
        const settled = Math.abs(next - target) < 0.003;
        m.uniforms.strength.value = settled ? target : next;
        if (!settled) invalidate();
    });

    return (
        <mesh geometry={model.geometry} matrixAutoUpdate={false} matrix={model.matrix} raycast={NO_RAYCAST} renderOrder={10}>
            <shaderMaterial ref={material} vertexShader={SHELL_VERTEX} fragmentShader={SHELL_FRAGMENT} uniforms={uniforms} transparent depthWrite={false} blending={AdditiveBlending} side={FrontSide} />
        </mesh>
    );
};

/** One model failing must not take the others down. The page already has the same information as text. */
class ModelBoundary extends Component<{ id: MeshId; onFailed: (id: MeshId) => void; children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidCatch() {
        this.props.onFailed(this.props.id);
    }
    render() {
        return this.state.failed ? null : this.props.children;
    }
}

interface ControlsLike {
    target: Vector3;
    update: () => void;
}

/** Glides to whatever is in focus, or jumps there when the reader has asked for less motion. */
const CameraRig = ({ focus, reduce }: { focus: { center: Vector3; radius: number } | null; reduce: boolean }) => {
    const { camera, controls, invalidate } = useThree();
    const moving = useRef(false);
    const goal = useMemo(() => {
        const target = focus ? focus.center.clone() : HOME_TARGET.clone();
        const distance = focus ? Math.max(0.6, focus.radius * 4.6) : HOME_CAMERA.distanceTo(HOME_TARGET);
        const direction = HOME_CAMERA.clone().sub(HOME_TARGET).normalize();
        return { target, position: target.clone().add(direction.multiplyScalar(distance)) };
    }, [focus]);

    useEffect(() => {
        moving.current = true;
        invalidate();
    }, [goal, invalidate]);

    useFrame((_, delta) => {
        const c = controls as unknown as ControlsLike | null;
        if (!moving.current || !c) return;
        const rate = reduce ? 1 : Math.min(1, delta * 3.2);
        c.target.lerp(goal.target, rate);
        camera.position.lerp(goal.position, rate);
        c.update();
        if (camera.position.distanceTo(goal.position) < 0.002) moving.current = false;
        else invalidate();
    });
    return null;
};

export interface BodySceneProps {
    meshes: MeshId[];
    states?: Partial<Record<MeshId, MeshState>>;
    clickable?: MeshId[];
    focus?: MeshId[] | null;
    /** The shell's glow, 0 to 1. */
    shellGlow?: number;
    onSelect?: (id: MeshId | null) => void;
    onHover?: (id: MeshId | null) => void;
    onProgress?: (loaded: number, failed: MeshId[]) => void;
    /** Off for a scene whose only motion should come from data. */
    idleSpin?: boolean;
    label: string;
}

/** Real organ models in one shared body frame. Everything said about them lives in the page around this. */
const BodyScene = ({ meshes, states, clickable = [], focus = null, shellGlow = 0, onSelect, onHover, onProgress, idleSpin = false, label }: BodySceneProps) => {
    const reducedPreference = useReducedMotion();
    const reduce = Boolean(reducedPreference);
    const wrapper = useRef<HTMLDivElement>(null);
    const [bounds, setBounds] = useState<Partial<Record<MeshId, { center: Vector3; radius: number }>>>({});
    const [failed, setFailed] = useState<MeshId[]>([]);
    const [touched, setTouched] = useState(false);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const el = wrapper.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const loaded = Object.keys(bounds).length;
    useEffect(() => {
        onProgress?.(loaded, failed);
    }, [loaded, failed, onProgress]);

    const [handleLoaded] = useState(() => (id: MeshId, center: Vector3, radius: number) => {
        setBounds((all) => (all[id] ? all : { ...all, [id]: { center, radius } }));
    });
    const [handleFailed] = useState(() => (id: MeshId) => setFailed((all) => (all.includes(id) ? all : [...all, id])));

    const focusBounds = useMemo(() => {
        if (!focus || focus.length === 0) return null;
        const known = focus.flatMap((id) => (bounds[id] ? [bounds[id]] : []));
        if (known.length === 0) return null;
        const center = known.reduce((sum, b) => sum.add(b.center), new Vector3()).divideScalar(known.length);
        const radius = Math.max(...known.map((b) => b.center.distanceTo(center) + b.radius));
        return { center, radius };
    }, [focus, bounds]);

    const spinning = idleSpin && !reduce && !touched && focus === null && visible;

    return (
        <div ref={wrapper} className="h-full w-full" role="img" aria-label={label}>
            <Canvas
                dpr={[1, 1.75]}
                frameloop={!visible ? "never" : spinning ? "always" : "demand"}
                camera={{ position: HOME_CAMERA.toArray(), fov: 32, near: 0.01, far: 12 }}
                gl={{ antialias: true, alpha: true }}
                onPointerDown={() => setTouched(true)}
                onPointerMissed={() => onSelect?.(null)}
                style={{ touchAction: "pan-y" }}
            >
                <hemisphereLight args={["#dfe9ff", "#2a1f24", 1.15]} />
                <directionalLight position={[1.2, 1.8, 2]} intensity={1.8} />
                <directionalLight position={[-1.6, 0.6, -1.2]} intensity={0.55} color="#8fb7ff" />
                {meshes.map((id) => (
                    <ModelBoundary key={id} id={id} onFailed={handleFailed}>
                        <Suspense fallback={null}>
                            {id === "skin" ? (
                                <Shell glow={shellGlow} reduce={reduce} onLoaded={handleLoaded} />
                            ) : (
                                <Part
                                    id={id}
                                    state={states?.[id] ?? {}}
                                    clickable={clickable.includes(id)}
                                    reduce={reduce}
                                    onSelect={onSelect}
                                    onHover={onHover}
                                    onLoaded={handleLoaded}
                                />
                            )}
                        </Suspense>
                    </ModelBoundary>
                ))}
                <OrbitControls makeDefault target={HOME_TARGET.toArray()} enablePan={false} enableDamping minDistance={0.2} maxDistance={3.6} autoRotate={spinning} autoRotateSpeed={IDLE_SPIN} />
                <CameraRig focus={focusBounds} reduce={reduce} />
            </Canvas>
        </div>
    );
};

export default BodyScene;
