import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";
import { BookOpen, ClipboardList, Dna, FlaskConical, Pill, type LucideIcon } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SimulatePanel from "@/components/lab/SimulatePanel";
import LiteraturePanel from "@/components/lab/LiteraturePanel";
import TrialsPanel from "@/components/lab/TrialsPanel";
import DrugPanel from "@/components/lab/DrugPanel";
import GenePanel from "@/components/lab/GenePanel";
import { decodeExperiment, encodeExperiment, type ExperimentConfig } from "@/sim/experiment";
import { databases } from "@/data/sources/registry";
import { diseases, getDiseaseById, modelledConditions, type Disease } from "@/data/knowledge";
import { cn } from "@/lib/utils";

type Tab = "simulate" | "literature" | "trials" | "drugs" | "genes";

const TABS: { id: Tab; label: string; icon: LucideIcon; sources: string }[] = [
    { id: "simulate", label: "Simulate", icon: FlaskConical, sources: "Evidence-parameterised model" },
    { id: "literature", label: "Literature", icon: BookOpen, sources: "PubMed · Europe PMC" },
    { id: "trials", label: "Trials", icon: ClipboardList, sources: "ClinicalTrials.gov" },
    { id: "drugs", label: "Drugs", icon: Pill, sources: "openFDA · FAERS · PubChem" },
    { id: "genes", label: "Genes", icon: Dna, sources: "MyGene · UniProt · Open Targets" },
];

const isTab = (v: string | null): v is Tab => TABS.some((t) => t.id === v);
const defaultTab = (c: Disease): Tab => (c.labModel ? "simulate" : "literature");

interface LabState {
    conditionId: string;
    tab: Tab;
    config: ExperimentConfig;
    /** Panels mount on first visit and then stay mounted, so switching tabs keeps their state. */
    visited: Tab[];
    /** The router location this state was last reconciled with. */
    navKey: string;
}

const fromLocation = (location: Location): LabState => {
    const sp = new URLSearchParams(location.search);
    // The Lab keeps no condition list of its own — it resolves one out of the knowledge base.
    const condition = getDiseaseById(sp.get("condition") ?? "") ?? modelledConditions[0];
    const rawTab = sp.get("tab");
    const tab = isTab(rawTab) ? rawTab : defaultTab(condition);
    return { conditionId: condition.id, tab, config: decodeExperiment(sp), visited: [tab], navKey: location.key };
};

const searchFor = (s: LabState, condition: Disease) => {
    const out = new URLSearchParams({ condition: s.conditionId });
    if (s.tab !== defaultTab(condition)) out.set("tab", s.tab);
    if (condition.labModel) encodeExperiment(s.config).forEach((v, k) => out.set(k, v));
    // Commas are legal in a query string; leaving them unescaped keeps a shared link readable.
    return `?${out.toString().replace(/%2C/gi, ",")}`;
};

const LabPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [lab, setLab] = useState<LabState>(() => fromLocation(location));

    // A navigation the Lab did not make itself (the header's Lab link, a pasted URL) resets it
    // to whatever the URL now says. Its own URL syncs are tagged and only acknowledged.
    if (location.key !== lab.navKey) {
        const own = (location.state as { labSync?: boolean } | null)?.labSync === true;
        setLab(own ? { ...lab, navKey: location.key } : fromLocation(location));
    }

    const condition = getDiseaseById(lab.conditionId)!;
    const search = searchFor(lab, condition);
    const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}${import.meta.env.VITE_LANDING ? "#/" : ""}lab${search}`;

    // The address bar tracks the experiment so a refresh or a copied URL reproduces it. Writes
    // are debounced: a slider drag would otherwise exceed Safari's cap on replaceState calls.
    useEffect(() => {
        if (search === location.search) return;
        const t = window.setTimeout(
            () => navigate({ search }, { replace: true, state: { labSync: true } }),
            350,
        );
        return () => window.clearTimeout(t);
    }, [search, location.search, navigate]);

    const activeTab = TABS.find((t) => t.id === lab.tab)!;
    useEffect(() => {
        document.title = `${activeTab.label} · ${condition.name} — MedBase Lab`;
        return () => {
            document.title = "MedBase — Virtual Medical Research Laboratory";
        };
    }, [activeTab.label, condition.name]);

    const selectTab = (tab: Tab) =>
        setLab((prev) => ({
            ...prev,
            tab,
            visited: prev.visited.includes(tab) ? prev.visited : [...prev.visited, tab],
        }));

    const selectCondition = (id: string) => {
        const next = getDiseaseById(id);
        if (!next) return;
        setLab((prev) => {
            const tab = prev.tab === "simulate" && !next.labModel ? "literature" : prev.tab;
            return { ...prev, conditionId: id, tab, visited: [tab] };
        });
    };

    const setConfig = (next: ExperimentConfig | ((prev: ExperimentConfig) => ExperimentConfig)) =>
        setLab((prev) => ({ ...prev, config: typeof next === "function" ? next(prev.config) : next }));

    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
        const i = TABS.findIndex((t) => t.id === lab.tab);
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

    const renderPanel = (tab: Tab) => {
        switch (tab) {
            case "simulate":
                return condition.labModel ? (
                    <SimulatePanel config={lab.config} setConfig={setConfig} shareUrl={shareUrl} />
                ) : (
                    <NoModel condition={condition} onTab={selectTab} />
                );
            case "literature":
                return <LiteraturePanel condition={condition} />;
            case "trials":
                return <TrialsPanel condition={condition} />;
            case "drugs":
                return <DrugPanel condition={condition} />;
            case "genes":
                return <GenePanel condition={condition} />;
        }
    };

    return (
        <div className="flex min-h-screen flex-col">
            <Header />

            <main className="flex-1">
                <div className="border-b border-border">
                    <div className="mx-auto max-w-[1400px] px-4 pb-5 pt-7 sm:px-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div className="min-w-0">
                                <p className="label-caps">Research lab</p>
                                <h1 className="mt-2 text-2xl font-semibold tracking-tight">{condition.name}</h1>
                                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                                    {condition.labModel ? (
                                        <>
                                            <span className="text-foreground">{condition.labModel.label}</span> model, plus{" "}
                                            {databases.length} live research databases. Model outputs are predictions under
                                            your assumptions, not estimates for a real person.
                                        </>
                                    ) : (
                                        <>
                                            No simulation model for this condition — the Lab&rsquo;s {databases.length} live
                                            research databases still work for it.
                                        </>
                                    )}{" "}
                                    <Link to={`/conditions/${condition.id}`} className="text-primary hover:underline">
                                        Knowledge-base record →
                                    </Link>
                                </p>
                            </div>
                            <label className="flex shrink-0 flex-col gap-1.5">
                                <span className="label-caps">Condition</span>
                                <select
                                    value={condition.id}
                                    onChange={(e) => selectCondition(e.target.value)}
                                    className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground md:w-72"
                                >
                                    <optgroup label="Simulation model + live data">
                                        {modelledConditions.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Live data only">
                                        {diseases
                                            .filter((d) => !d.labModel)
                                            .sort((a, b) => a.name.localeCompare(b.name))
                                            .map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                    </optgroup>
                                </select>
                            </label>
                        </div>
                        {condition.labModel && (
                            <p className="mt-3 max-w-4xl border-l-2 border-primary/50 pl-3 text-xs leading-relaxed text-muted-foreground">
                                <span className="label-caps mr-1.5">Model covers</span>
                                {condition.labModel.scope}
                            </p>
                        )}
                    </div>
                </div>

                <div className="sticky top-14 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
                    <div
                        role="tablist"
                        aria-label="Lab workspace"
                        className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
                    >
                        {TABS.map((t) => {
                            const selected = t.id === lab.tab;
                            const Icon = t.icon;
                            const unavailable = t.id === "simulate" && !condition.labModel;
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
                                    className={cn(
                                        "relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm transition-colors",
                                        selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <Icon className={cn("h-4 w-4", unavailable && "opacity-50")} aria-hidden="true" />
                                    <span>{t.label}</span>
                                    <span className="hidden text-[11px] text-muted-foreground/80 xl:inline">
                                        {unavailable ? "No model for this condition" : t.sources}
                                    </span>
                                    {selected && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6">
                    {TABS.filter((t) => lab.visited.includes(t.id)).map((t) => (
                        <div
                            key={`${t.id}:${condition.id}`}
                            id={`panel-${t.id}`}
                            role="tabpanel"
                            aria-labelledby={`tab-${t.id}`}
                            hidden={t.id !== lab.tab}
                        >
                            {renderPanel(t.id)}
                        </div>
                    ))}
                </div>
            </main>

            <Footer />
        </div>
    );
};

const NoModel = ({ condition, onTab }: { condition: Disease; onTab: (t: Tab) => void }) => (
    <section className="max-w-3xl space-y-5 py-2">
        <span className="label-caps inline-block border border-[hsl(var(--prov-extrapolated))]/40 px-2 py-1 text-[hsl(var(--prov-extrapolated))]">
            No simulation model
        </span>
        <h2 className="text-lg font-semibold">Nothing in the Lab simulates {condition.name.split(" (")[0].toLowerCase()}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
            A model binding needs published parameters for a progression pathway — an effect size, an absolute
            baseline rate, and a mechanism linking them — not just a description of the disease. This record
            doesn&rsquo;t have them in usable form, so there is no experiment to run. A panel of sliders would
            still produce output, and that output would look exactly like the modelled one. That is why it is
            absent.
        </p>
        <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
            {TABS.filter((t) => t.id !== "simulate").map((t) => (
                <button
                    key={t.id}
                    type="button"
                    onClick={() => onTab(t.id)}
                    className="flex items-start gap-3 bg-background p-4 text-left transition-colors hover:bg-card"
                >
                    <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>
                        <span className="block text-sm font-medium">{t.label}</span>
                        <span className="block text-xs text-muted-foreground">{t.sources}</span>
                    </span>
                </button>
            ))}
        </div>
        <p className="text-sm text-muted-foreground">
            Modelled today:{" "}
            {modelledConditions.map((c) => (
                <Link key={c.id} to={`/lab?condition=${c.id}`} className="text-primary hover:underline">
                    {c.labModel!.label}
                </Link>
            ))}
        </p>
    </section>
);

export default LabPage;
