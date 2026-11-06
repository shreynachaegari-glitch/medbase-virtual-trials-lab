import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, Navigate, Routes, Route, type BrowserRouterProps } from "react-router-dom";
import Index from "@/pages/Index";
import ErrorBoundary from "@/components/ErrorBoundary";
import ScrollManager from "@/components/ScrollManager";
import Chatbot from "@/components/Chatbot";
import { LangProvider } from "@/i18n";
import { AuthProvider } from "@/components/ResearcherAuth";

// Each page past the landing page loads on first visit, so the landing page no longer ships
// the Lab's charts, database clients and simulation engine up front.
const LearnPage = lazy(() => import("@/pages/LearnPage"));
const ConditionPage = lazy(() => import("@/pages/ConditionPage"));
const LabPage = lazy(() => import("@/pages/LabPage"));
const TrialsPage = lazy(() => import("@/pages/TrialsPage"));
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
 * Static hosts may open a page by its file name, and the public demo should open on the lab, which
 * a static build asks for with VITE_LANDING. The MedBase home page stays reachable at /home.
 */
const LANDING: string | undefined = import.meta.env.VITE_LANDING;

/** Static hosts return 404 for /trials on a refresh. Hash routes (/#/trials) work on any host. */
const Router = ({ children }: Pick<BrowserRouterProps, "children">) =>
    LANDING ? <HashRouter>{children}</HashRouter> : <BrowserRouter basename={import.meta.env.BASE_URL}>{children}</BrowserRouter>;
const root = LANDING ? <Navigate to={LANDING} replace /> : <Index />;

function App() {
    return (
        <ErrorBoundary>
            {/* import.meta.env.BASE_URL tracks vite.config.ts's `base` (e.g. "/medbase-motion/"
                on GitHub Pages, "/" in dev) so routes resolve correctly under either. */}
            <LangProvider>
            <AuthProvider>
            <Router>
                <ScrollManager />
                <Chatbot />
                <Suspense fallback={<PageFallback />}>
                    <Routes>
                        <Route path="/" element={root} />
                        <Route path="/index.html" element={root} />
                        <Route path="/home" element={<Index />} />
                        <Route path="/learn" element={<LearnPage />} />
                        <Route path="/learn/:id" element={<ConditionPage />} />
                        <Route path="/anatomy" element={<AnatomyPage />} />
                        <Route path="/lab" element={<LabPage />} />
                        <Route path="/trials" element={<TrialsPage />} />
                        <Route path="/trials/index.html" element={<TrialsPage />} />
                        <Route path="/evidence" element={<EvidencePage />} />
                        <Route path="/methods" element={<MethodsPage />} />
                        <Route path="/funding" element={<FundingPage />} />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Suspense>
            </Router>
            </AuthProvider>
            </LangProvider>
        </ErrorBoundary>
    );
}

export default App;
