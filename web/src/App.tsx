import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, Navigate, Routes, Route, useParams, type BrowserRouterProps } from "react-router-dom";
import Index from "@/pages/Index";
import ErrorBoundary from "@/components/ErrorBoundary";
import ScrollManager from "@/components/ScrollManager";
import TitleManager from "@/components/TitleManager";
import CopilotLauncher from "@/components/CopilotLauncher";
import { LangProvider } from "@/i18n";

// Each page past the landing page loads on first visit, so the landing page no longer ships
// the Lab's charts, database clients and simulation engine up front.
const ConditionPage = lazy(() => import("@/pages/ConditionPage"));
const LabPage = lazy(() => import("@/pages/LabPage"));
const TrialsPage = lazy(() => import("@/pages/TrialsPage"));
const CopilotPage = lazy(() => import("@/pages/CopilotPage"));
const AnatomyPage = lazy(() => import("@/pages/AnatomyPage"));
const EvidencePage = lazy(() => import("@/pages/EvidencePage"));
const MethodsPage = lazy(() => import("@/pages/MethodsPage"));
const FundingPage = lazy(() => import("@/pages/FundingPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/** Holds the page height while a route chunk loads, so the footer never flashes up. */
const PageFallback = () => (
    <div className="min-h-screen" role="status" aria-live="polite">
        <span className="sr-only">Loading page…</span>
    </div>
);

/**
 * Static hosts may open a page by its file name, and the public demo opens on the home page, which
 * explains the site. A static build asks for that with VITE_LANDING.
 */
const LANDING: string | undefined = import.meta.env.VITE_LANDING;

/** Static hosts return 404 for /trials on a refresh. Hash routes (/#/trials) work on any host. */
const Router = ({ children }: Pick<BrowserRouterProps, "children">) =>
    LANDING ? <HashRouter>{children}</HashRouter> : <BrowserRouter basename={import.meta.env.BASE_URL}>{children}</BrowserRouter>;
/** A static host serves this same page at /trials/ and the like, so a direct link still opens the page it names. */
const OPENED_ROUTE = /^\/(trials|copilot|home|lab|anatomy|evidence|methods|funding)(?:\/|\/index\.html)?$/;
const landingTarget = (): string => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const opened = window.location.pathname.slice(base.length).match(OPENED_ROUTE);
    return opened ? `/${opened[1]}${window.location.search}` : (LANDING as string);
};
const root = LANDING ? <Navigate to={landingTarget()} replace /> : <Index />;

/** Links saved from before the Learn page was merged into Anatomy still arrive at the record. */
const OldConditionLink = () => {
    const { id } = useParams();
    return <Navigate to={`/conditions/${id}`} replace />;
};

function App() {
    return (
        <ErrorBoundary>
            {/* import.meta.env.BASE_URL tracks vite.config.ts's `base` (e.g. "/medbase-motion/"
                on GitHub Pages, "/" in dev) so routes resolve correctly under either. */}
            <LangProvider>
            <Router>
                <ScrollManager />
                <TitleManager />
                <CopilotLauncher />
                <Suspense fallback={<PageFallback />}>
                    <Routes>
                        <Route path="/" element={root} />
                        <Route path="/index.html" element={root} />
                        <Route path="/home" element={<Index />} />
                        <Route path="/learn" element={<Navigate to="/anatomy" replace />} />
                        <Route path="/learn/:id" element={<OldConditionLink />} />
                        <Route path="/conditions/:id" element={<ConditionPage />} />
                        <Route path="/anatomy" element={<AnatomyPage />} />
                        <Route path="/lab" element={<LabPage />} />
                        <Route path="/trials" element={<TrialsPage />} />
                        <Route path="/trials/index.html" element={<TrialsPage />} />
                        <Route path="/copilot" element={<CopilotPage />} />
                        <Route path="/evidence" element={<EvidencePage />} />
                        <Route path="/methods" element={<MethodsPage />} />
                        <Route path="/funding" element={<FundingPage />} />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Suspense>
            </Router>
            </LangProvider>
        </ErrorBoundary>
    );
}

export default App;
