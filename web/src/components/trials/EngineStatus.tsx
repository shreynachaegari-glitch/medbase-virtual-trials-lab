import { Cpu, Download, Radio, Archive, WifiOff, RefreshCw } from "lucide-react";
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

const Loading = ({ engine }: { engine: EngineState }) => {
    const seconds = useElapsed(engine.startedAt);
    return (
        <div data-testid="engine-progress" className="rounded-md border border-border bg-card/40 px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p role="status" className="flex items-center gap-2 text-xs">
                    <Download className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>
                        Simulator warming up in the background{engine.totalSteps > 0 ? `, step ${engine.step} of ${engine.totalSteps}: ` : ": "}
                        {engine.label.toLowerCase()}
                    </span>
                </p>
                <p className="tnum text-xs text-muted-foreground" aria-hidden="true">{megabytes(engine.bytes)} · {seconds} s</p>
            </div>
            <div className="sweep mt-1.5" aria-hidden="true" />
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                No need to wait. Ask a question or start a run now and it goes as soon as this is ready. A first visit downloads about 40 MB.
            </p>
        </div>
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
        <p data-testid="engine-ready" className="tnum text-xs text-muted-foreground">
            Simulator ready on this device: {megabytes(engine.bytes)} loaded in {engine.loadSeconds === null ? "?" : engine.loadSeconds.toFixed(0)} s. Your runs stay in this browser.
        </p>
    );
};

/** The hero scrolls away, so the download also stays in view from anywhere on the page. */
export const EnginePill = () => {
    const { mode, engine } = useTransport();
    if (mode !== "browser" || engine.phase !== "loading") return null;
    return (
        <div aria-hidden="true" data-testid="engine-pill" className="tnum pointer-events-none fixed bottom-4 left-4 z-40 max-w-[calc(100vw-6rem)] truncate rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
            Loading simulator{engine.totalSteps > 0 ? `, step ${engine.step} of ${engine.totalSteps}` : ""} · {megabytes(engine.bytes)}
        </div>
    );
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
