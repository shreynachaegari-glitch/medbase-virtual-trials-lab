import type { ReactNode } from "react";
import { Archive, Check, Cpu, Download, Radio, RefreshCw, WifiOff } from "lucide-react";
import { useElapsed } from "@/hooks/useSimRun";
import { useTransport } from "@/hooks/useTransport";
import { redetect, startEngine, type EngineState, type Mode } from "@/lib/trials/transport";
import { cn } from "@/lib/utils";

const MODES: Record<Mode, { label: string; icon: typeof Radio }> = {
    checking: { label: "Checking for a server…", icon: Radio },
    server: { label: "Live server", icon: Radio },
    browser: { label: "Running in your browser", icon: Cpu },
    saved: { label: "Saved run", icon: Archive },
};

/** Where the numbers on this page are coming from. Always visible near the top. */
export const ModeBadge = () => {
    const { mode } = useTransport();
    const { label, icon: Icon } = MODES[mode];
    return (
        <span
            data-testid="mode-badge"
            data-mode={mode}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium",
                mode === "saved" ? "border-[hsl(var(--prov-extrapolated))]/60 text-[hsl(var(--prov-extrapolated))]" : "border-border text-foreground",
            )}
        >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {label}
        </span>
    );
};

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * Loading and ready share one fixed-height line, so nothing below it moves when the download finishes.
 * The bar under it sweeps while loading and fills when ready.
 */
const StatusLine = ({ testId, icon, text, meta, loading }: { testId: string; icon: ReactNode; text: ReactNode; meta: ReactNode; loading: boolean }) => (
    <div data-testid={testId} className="relative flex h-9 items-center gap-2 overflow-hidden rounded-md border border-border bg-card/40 px-3 text-xs">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <p role="status" className="min-w-0 flex-1 truncate">{text}</p>
        <p className="tnum shrink-0 text-muted-foreground" aria-hidden="true">{meta}</p>
        {loading ? <div className="sweep absolute inset-x-0 bottom-0" aria-hidden="true" /> : <div className="absolute inset-x-0 bottom-0 h-px bg-[hsl(var(--pass))]/50" aria-hidden="true" />}
    </div>
);

const Loading = ({ engine }: { engine: EngineState }) => {
    const seconds = useElapsed(engine.startedAt);
    const step = engine.totalSteps > 0 ? `step ${engine.step} of ${engine.totalSteps}` : engine.label.toLowerCase();
    return (
        <StatusLine
            testId="engine-progress"
            loading
            icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
            text={<>Simulator loading, {step}<span className="hidden sm:inline">. Ask now: it runs as soon as this is ready</span></>}
            meta={<>{megabytes(engine.bytes)} · {seconds} s</>}
        />
    );
};

/** The download, from first byte to ready, and what happens if it can't finish. */
export const EngineBanner = () => {
    const { mode, engine } = useTransport();
    if (engine.phase === "failed") {
        return (
            <div data-testid="offline-banner" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[hsl(var(--prov-extrapolated))]/40 bg-[hsl(var(--prov-extrapolated))]/[0.07] px-3 py-2 text-sm">
                <WifiOff className="h-4 w-4 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
                <span className="min-w-0 flex-1">The simulator couldn&rsquo;t start in this browser, so anything shown here is a saved run, labelled as one.</span>
                <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 text-xs underline-offset-2 hover:underline">
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Reload and try again
                </button>
            </div>
        );
    }
    if (mode === "saved") {
        return (
            <div data-testid="offline-banner" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[hsl(var(--prov-extrapolated))]/40 bg-[hsl(var(--prov-extrapolated))]/[0.07] px-3 py-2 text-sm">
                <WifiOff className="h-4 w-4 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
                <span className="min-w-0 flex-1">The live simulator is offline. Anything shown here is a saved run, and is labelled as one.</span>
                <button type="button" onClick={() => void redetect()} className="inline-flex items-center gap-1.5 text-xs underline-offset-2 hover:underline">
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Check again
                </button>
            </div>
        );
    }
    // While the page works out where the simulator runs, hold the status line's space so nothing jumps when it appears.
    if (mode === "checking") return <div aria-hidden="true" className="h-9" />;
    if (mode !== "browser") return null;
    if (engine.phase === "loading") return <Loading engine={engine} />;
    if (engine.phase === "idle") {
        return (
            <div data-testid="engine-idle" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card/70 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Your browser asked to save data, so the simulator hasn&rsquo;t been downloaded. It is about 40 MB.</span>
                <button type="button" onClick={() => void startEngine()} className="btn-outline !px-3 !py-1.5 text-xs">Download the simulator</button>
            </div>
        );
    }
    return (
        <StatusLine
            testId="engine-ready"
            loading={false}
            icon={<Check className="h-3.5 w-3.5 text-[hsl(var(--pass))]" aria-hidden="true" />}
            text={<>Simulator ready on this device<span className="hidden sm:inline">. Your runs stay in this browser</span></>}
            meta={<>{megabytes(engine.bytes)} in {engine.loadSeconds === null ? "?" : engine.loadSeconds.toFixed(0)} s</>}
        />
    );
};

/** The hero scrolls away, so a thin bar under the header keeps the download in view without covering anything. */
export const EnginePill = () => {
    const { mode, engine } = useTransport();
    if (mode !== "browser" || engine.phase !== "loading") return null;
    return <div aria-hidden="true" data-testid="engine-pill" className="sweep pointer-events-none fixed inset-x-0 top-14 z-40" />;
};

/** Beside anything waiting on the worker, so a wait is explained rather than silent. */
export const EngineWaitNote = () => {
    const { mode, engine } = useTransport();
    if (mode !== "browser") return null;
    if (engine.phase === "loading") return <p data-testid="engine-wait" className="text-xs text-muted-foreground">Waiting for the simulator to finish loading: {engine.label.toLowerCase()}.</p>;
    if (engine.phase === "idle") return <p data-testid="engine-wait" className="text-xs text-muted-foreground">This downloads the simulator first, about 40 MB.</p>;
    if (engine.queued > 0) return <p data-testid="engine-wait" className="text-xs text-muted-foreground">One run at a time on this device. {engine.queued} waiting behind the current one.</p>;
    return null;
};
