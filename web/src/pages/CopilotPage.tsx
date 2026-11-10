import Header from "@/components/Header";
import { AssistantPanel } from "@/components/trials/AssistantPanel";
import { EngineBanner } from "@/components/trials/EngineStatus";
import { useRemote } from "@/hooks/useRemote";
import { api } from "@/lib/trials/api";

/** The copilot on its own page, laid out like a chat assistant: the conversation centred, the composer pinned below. */
const CopilotPage = () => {
    const health = useRemote("health", (signal) => api.health(signal));
    const healthData = health.state.status === "success" ? health.state.data : null;
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <Header />
            <main className="relative flex-1">
                <div className="aurora pointer-events-none fixed inset-x-0 top-0 h-[28rem] overflow-hidden" aria-hidden="true" />
                <div className="relative mx-auto w-full max-w-3xl px-4 sm:px-6">
                    <div className="pt-3 empty:hidden"><EngineBanner /></div>
                    <AssistantPanel health={healthData} variant="page" />
                </div>
            </main>
        </div>
    );
};

export default CopilotPage;
