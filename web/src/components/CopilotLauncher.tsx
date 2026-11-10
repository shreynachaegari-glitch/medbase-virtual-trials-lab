import { Link, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";

/** From any other page, one click to the full-screen AI copilot. Virtual Trials and the copilot page already show it. */
const CopilotLauncher = () => {
    const { pathname } = useLocation();
    if (pathname.startsWith("/trials") || pathname.startsWith("/copilot")) return null;
    return (
        <Link
            to="/copilot"
            data-testid="copilot-launcher"
            className="fixed bottom-4 right-4 z-50 inline-flex min-h-11 items-center gap-2 rounded-full border border-[hsl(var(--primary))]/60 bg-background/90 px-4 text-sm font-medium shadow-[0_12px_32px_-12px_hsl(217_91%_60%/0.7)] backdrop-blur transition-[transform,background-color] duration-150 ease-out hover:bg-secondary active:scale-[0.97]"
        >
            <Sparkles className="h-4 w-4 text-[hsl(217_91%_72%)]" aria-hidden="true" />
            Ask the AI copilot
        </Link>
    );
};

export default CopilotLauncher;
