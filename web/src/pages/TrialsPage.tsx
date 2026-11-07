import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useRemote } from "@/hooks/useRemote";
import { useTransport } from "@/hooks/useTransport";
import { useSimRun, type SimRequest } from "@/hooks/useSimRun";
import { ApiError, api, guards, loadSnapshot } from "@/lib/trials/api";
import { ChainContext, NO_CHAIN_STATUS, type ChainStatus } from "@/lib/trials/chain";
import { checksFrom, egfrLabel } from "@/lib/trials/format";
import { buildDesign, drugArm, formFromDesign, initialForm, PRESETS, savedFilesFor, type DesignForm, type FieldErrors, type Preset, type TrialBody } from "@/lib/trials/form";
import type { SimulatedDesign, TrialResponse, ValidationReport } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { CheckBadge, ErrorCallout, RunProgress } from "@/components/trials/bits";
import { AssistantPanel } from "@/components/trials/AssistantPanel";
import { AiStack } from "@/components/trials/AiStack";
import { EngineBanner, EnginePill, ModeBadge } from "@/components/trials/EngineStatus";
import { DesignerSection } from "@/components/trials/DesignerSection";
import { PowerTab } from "@/components/trials/PowerTab";
import { ProgressionTab } from "@/components/trials/ProgressionTab";
import { ProofStrip } from "@/components/trials/ProofStrip";
import { ProofTab } from "@/components/trials/ProofTab";
import { SurrogateExplorer, type FullRunRequest, type FullRunState } from "@/components/trials/SurrogateExplorer";
import { RespondersTab } from "@/components/trials/RespondersTab";
import { SafetyTab } from "@/components/trials/SafetyTab";
import { TrialBuilder } from "@/components/trials/TrialBuilder";
import { TrialResults } from "@/components/trials/TrialResults";

const TABS = [
    { id: "trial", label: "Trial" },
    { id: "progression", label: "Disease progression" },
    { id: "proof", label: "Proof" },
    { id: "responders", label: "Who responds" },
    { id: "power", label: "Power" },
    { id: "safety", label: "Safety" },
] as const;

type TabId = (typeof TABS)[number]["id"];
const isTab = (v: string | null): v is TabId => TABS.some((t) => t.id === v);

/** The first screen's one line of honesty: how the held-out test went, before anyone scrolls. */
const QuickProof = ({ report, notRun }: { report: ValidationReport | null; notRun: boolean }) => {
    if (!report) {
        return notRun ? <p data-testid="quick-proof" className="text-xs text-muted-foreground">Held-out validation has not been run yet, so no accuracy claim is made.</p> : null;
    }
    return (
        <ul data-testid="quick-proof" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground" aria-label="Pre-registered checks on held-out real trials">
            <li>Tested on {report.score.n_contrasts} real held-out contrasts:</li>
            {checksFrom(report.score, report.pass_marks).map((check) => (
                <li key={check.id} className="flex items-center gap-1.5" title={check.rule}>
                    <span className="tnum">{check.id}</span>
                    <CheckBadge passed={check.passed} />
                </li>
            ))}
        </ul>
    );
};

const requestsFor = (form: DesignForm): { requests: SimRequest[]; errors: FieldErrors; key: string } => {
    const { bodies, errors, key } = buildDesign(form);
    const saved = savedFilesFor(key);
    return {
        errors,
        key,
        requests: bodies.map((body, i) => ({
            path: "/api/trial",
            body,
            label: egfrLabel(body.egfr_min, body.egfr_max),
            savedFile: saved?.[i] ?? null,
        })),
    };
};

/**
 * The Virtual Trials page. It owns what several tabs share: the trial design, the last trial run
 * and the validation report. Everything else lives in its own tab, mounted on first visit.
 */
const TrialsPage = () => {
    const [params, setParams] = useSearchParams();
    const rawTab = params.get("tab");
    const tab: TabId = isTab(rawTab) ? rawTab : "trial";
    const [visited, setVisited] = useState<TabId[]>([tab]);
    if (!visited.includes(tab)) setVisited([...visited, tab]);

    const health = useRemote("health", (signal) => api.health(signal));
    const validation = useRemote("validation", (signal) => api.validation(signal));
    const drugsState = useRemote("drugs", (signal) => api.drugs(signal));

    const calibration = useRemote("calibration", (signal) => api.calibration(signal));
    const { mode } = useTransport();
    const offline = mode === "saved";

    // The report knows the chain and the pass marks. Before a validation run exists, calibration
    // alone can still flag a chain that did not converge.
    const report = validation.state.status === "success" ? validation.state.data.data : null;
    const calibrated = calibration.state.status === "success" ? calibration.state.data.data : null;
    const chain = useMemo<ChainStatus>(() => {
        const source = report ?? calibrated;
        if (!source) return NO_CHAIN_STATUS;
        return {
            converged: source.converged ?? null,
            maxSplitRhat: source.max_split_rhat ?? null,
            lengthOverTau: source.length_over_tau ?? null,
            passMarks: report?.pass_marks ?? null,
        };
    }, [report, calibrated]);
    const healthData = health.state.status === "success" ? health.state.data : null;
    const drugs = drugsState.state.status === "success" ? drugsState.state.data.data : null;

    const [form, setForm] = useState<DesignForm>(initialForm);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [activePreset, setActivePreset] = useState<Preset["id"] | null>(PRESETS[0].id);
    const trial = useSimRun<TrialResponse>(guards.trial);
    const builderRef = useRef<HTMLDivElement>(null);
    const panelsRef = useRef<HTMLDivElement>(null);
    const lastTab = useRef<TabId | null>(null);

    // The tabs sit below the hero and the designer, so a link to one must bring it into view. A
    // click on the tab bar itself, with the panel already on screen, stays where it is.
    const revealPanels = useCallback(() => {
        const el = panelsRef.current;
        if (!el) return;
        const { top } = el.getBoundingClientRect();
        if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ block: "start" });
    }, []);

    useEffect(() => {
        const first = lastTab.current === null;
        const changed = lastTab.current !== tab;
        lastTab.current = tab;
        if ((first && tab !== "trial") || (!first && changed)) window.requestAnimationFrame(revealPanels);
    }, [tab, revealPanels]);

    useEffect(() => {
        document.title = "Virtual Trials — MedBase";
        return () => {
            document.title = "MedBase — Virtual Medical Research Laboratory";
        };
    }, []);

    const start = (next: DesignForm) => {
        const { requests, errors: found, key } = requestsFor(next);
        setErrors(found);
        if (Object.keys(found).length > 0) {
            const first = Object.keys(found)[0];
            const id = first.includes(".") ? first.replace(".", "-") : `trial-${first}`;
            window.requestAnimationFrame(() => document.getElementById(id)?.focus());
            return;
        }
        void trial.run(requests, key);
    };

    const onPreset = (preset: Preset) => {
        const next = preset.form();
        setForm(next);
        setErrors({});
        setActivePreset(preset.id);
        if (preset.autoRun) start(next);
        else window.requestAnimationFrame(() => builderRef.current?.querySelector<HTMLInputElement>("[data-testid=candidate-form] input")?.focus());
    };

    const selectTab = (next: TabId) => {
        const out = new URLSearchParams(params);
        if (next === "trial") out.delete("tab");
        else out.set("tab", next);
        setParams(out, { replace: true });
    };

    const onUseDesign = (design: SimulatedDesign, background: string) => {
        const next = formFromDesign(design, background);
        setForm(next);
        setErrors({});
        setActivePreset(null);
        selectTab("trial");
        window.requestAnimationFrame(revealPanels);
        start(next);
    };

    // The explorer asks for a full run and stays in place, so its comparison appears beside its sliders.
    const [fullRun, setFullRun] = useState<{ key: string; request: FullRunRequest } | null>(null);
    const onRunFull = (request: FullRunRequest) => {
        const next: DesignForm = {
            ...initialForm(),
            arms: [drugArm(request.drug, String(request.mg))],
            weeks: String(request.weeks),
            egfr_min: String(request.egfrLow),
            egfr_max: String(request.egfrHigh),
        };
        const { key } = buildDesign(next);
        setFullRun({ key, request });
        setForm(next);
        setErrors({});
        setActivePreset(null);
        start(next);
    };

    const onFormChange = (next: DesignForm) => {
        setForm(next);
        setActivePreset(null);
    };

    const built = useMemo(() => buildDesign(form), [form]);
    const outcome = trial.outcome;
    const stale = outcome !== null && outcome.key !== built.key;
    const outcomeBodies = useMemo(() => (outcome ? (JSON.parse(outcome.key) as TrialBody[]) : []), [outcome]);

    // With the simulator offline, open the first saved run there is, so a visitor sees a real result.
    const savedFirst = useRemote(offline && !outcome ? "saved-first" : null, async (signal) => {
        const data = await loadSnapshot<TrialResponse>(PRESETS[0].savedFiles[0], guards.trial, signal);
        return data;
    });
    const savedFirstData = savedFirst.state.status === "success" ? savedFirst.state.data : null;

    const fullState: FullRunState = useMemo(() => {
        if (!fullRun) return { status: "idle" };
        if (trial.outcome?.key === fullRun.key) {
            const { data } = trial.outcome.outputs[0];
            const arm = Object.keys(data.contrasts)[0];
            const contrast = data.contrasts[arm];
            if (contrast?.hba1c && contrast.weight) {
                return { status: "done", a1c: contrast.hba1c.effect, weight: contrast.weight.effect, predictedA1c: fullRun.request.predictedA1c, predictedWeight: fullRun.request.predictedWeight };
            }
        }
        if (trial.running?.key === fullRun.key) return { status: "running" };
        if (trial.error) return { status: "error", message: trial.error.message };
        return { status: "idle" };
    }, [fullRun, trial.outcome, trial.running, trial.error]);

    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
        const i = TABS.findIndex((t) => t.id === tab);
        const to =
            e.key === "ArrowRight" ? (i + 1) % TABS.length
            : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
            : e.key === "Home" ? 0
            : e.key === "End" ? TABS.length - 1
            : null;
        if (to === null) return;
        e.preventDefault();
        selectTab(TABS[to].id);
        tabRefs.current[TABS[to].id]?.focus();
    };

    const running = trial.running;

    return (
        <ChainContext.Provider value={chain}>
        <div className="flex min-h-screen flex-col">
            <Header />
            <EnginePill />
            <p data-testid="research-notice" className="sticky top-14 z-30 border-b border-border bg-background/90 px-4 py-1 text-center text-xs text-muted-foreground backdrop-blur-xl">
                Research and education only. Not medical advice.
            </p>

            <main className="flex-1">
                <div className="relative overflow-hidden border-b border-border">
                    <div className="aurora pointer-events-none absolute inset-0" aria-hidden="true" />
                    <div className="grid-field grid-fade pointer-events-none absolute inset-0" aria-hidden="true" />
                    <div className="relative mx-auto max-w-[1400px] px-4 pb-8 pt-3 sm:px-6 sm:pt-6 lg:pt-8">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <p className="label-caps">Applied AI for drug trials</p>
                            <ModeBadge />
                        </div>
                        <h1 className="text-balance mt-2 max-w-4xl text-[1.6rem] font-semibold leading-[1.12] tracking-tight sm:mt-3 sm:text-4xl">
                            Run a simulated type 2 diabetes drug trial now, and <span className="text-ai">see how far to trust it.</span>
                        </h1>
                        <p className="mt-1.5 max-w-3xl text-sm leading-snug text-muted-foreground sm:mt-2 sm:leading-relaxed">
                            Virtual patients built from real lab results. Ask a question, or move a slider.
                        </p>
                        <div className="mt-3">
                            <QuickProof report={report} notRun={validation.state.status === "error" && validation.state.error instanceof ApiError && validation.state.error.kind === "not-found"} />
                        </div>
                        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                            <AssistantPanel health={healthData} />
                            <div className="min-w-0 lg:row-span-2"><SurrogateExplorer onRunFull={onRunFull} full={fullState} /></div>
                            <div className="min-w-0 lg:col-start-1 lg:row-start-2"><AiStack /></div>
                        </div>
                        {/* Below the panels: the prompt and sliders come first, and this happens in the background. */}
                        <div className="mt-3 space-y-2 empty:hidden">
                            <EngineBanner />
                            {healthData && !healthData.calibrated && (
                                <p data-testid="uncalibrated-banner" className="rounded-md border border-border bg-card/70 px-3 py-2 text-xs text-muted-foreground">
                                    Calibration has not finished, so drug-trial runs will return a message instead of results for now. The disease progression model does not need it and works.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mx-auto max-w-[1400px] px-4 pb-2 sm:px-6">
                    <ProofStrip state={validation.state} onRetry={validation.retry} />
                </div>

                <DesignerSection drugs={drugs?.drugs ?? null} offline={offline} onUse={onUseDesign} />

                <div className="z-20 border-b border-border bg-background/90 backdrop-blur-xl lg:sticky lg:top-[5.0625rem]">
                    <div role="tablist" aria-label="Virtual Trials workspace" className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
                        {TABS.map((t) => {
                            const selected = t.id === tab;
                            return (
                                <button
                                    key={t.id}
                                    ref={(el) => {
                                        tabRefs.current[t.id] = el;
                                    }}
                                    id={`tab-${t.id}`}
                                    role="tab"
                                    type="button"
                                    aria-selected={selected}
                                    aria-controls={`panel-${t.id}`}
                                    tabIndex={selected ? 0 : -1}
                                    onClick={() => selectTab(t.id)}
                                    onKeyDown={onTabKey}
                                    className={cn("relative shrink-0 whitespace-nowrap px-3 py-3 text-sm transition-colors", selected ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                                >
                                    {t.label}
                                    {selected && <motion.span layoutId="trials-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div ref={panelsRef} className="mx-auto max-w-[1400px] scroll-mt-32 px-4 py-8 sm:px-6">
                    {visited.includes("trial") && (
                        <div id="panel-trial" role="tabpanel" aria-labelledby="tab-trial" hidden={tab !== "trial"}>
                            <div ref={builderRef}>
                                <TrialBuilder form={form} onChange={onFormChange} errors={errors} drugs={drugs} busy={running !== null} onRun={() => start(form)} onPreset={onPreset} activePreset={activePreset} />
                            </div>
                            <div className="mt-4 space-y-3">
                                {running && (
                                    <RunProgress
                                        running={running}
                                        onCancel={trial.cancel}
                                        summary={`Simulating placebo and ${built.bodies[0].arms.length} ${built.bodies[0].arms.length === 1 ? "arm" : "arms"} across calibrated parameter draws.`}
                                    />
                                )}
                                {trial.error && <ErrorCallout error={trial.error} onRetry={() => start(form)} />}
                            </div>
                            {outcome ? (
                                <TrialResults key={outcome.id} outcome={outcome} bodies={outcomeBodies} stale={stale} busy={running !== null} onRerun={() => start(form)} autoReveal={fullRun?.key !== outcome.key} />
                            ) : savedFirstData ? (
                                <TrialResults outcome={{ outputs: [{ label: "Saved run", data: savedFirstData, provenance: "saved" }], key: "", elapsedSeconds: 0, id: 0 }} bodies={[]} stale={false} busy={running !== null} onRerun={() => start(form)} />
                            ) : offline && savedFirst.state.status === "success" ? (
                                <p data-testid="trial-empty" className="mt-8 rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                                    The live simulator is offline and no saved runs are available yet. Start the simulator to run a trial.
                                </p>
                            ) : null}
                        </div>
                    )}
                    {visited.includes("progression") && (
                        <div id="panel-progression" role="tabpanel" aria-labelledby="tab-progression" hidden={tab !== "progression"}>
                            <ProgressionTab />
                        </div>
                    )}
                    {visited.includes("proof") && (
                        <div id="panel-proof" role="tabpanel" aria-labelledby="tab-proof" hidden={tab !== "proof"}>
                            <ProofTab validation={validation.state} onRetry={validation.retry} />
                        </div>
                    )}
                    {visited.includes("responders") && (
                        <div id="panel-responders" role="tabpanel" aria-labelledby="tab-responders" hidden={tab !== "responders"}>
                            <RespondersTab form={form} drugs={drugs} offline={offline} />
                        </div>
                    )}
                    {visited.includes("power") && (
                        <div id="panel-power" role="tabpanel" aria-labelledby="tab-power" hidden={tab !== "power"}>
                            <PowerTab form={form} drugs={drugs} offline={offline} />
                        </div>
                    )}
                    {visited.includes("safety") && (
                        <div id="panel-safety" role="tabpanel" aria-labelledby="tab-safety" hidden={tab !== "safety"}>
                            <SafetyTab drugs={drugs} />
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
        </ChainContext.Provider>
    );
};

export default TrialsPage;
