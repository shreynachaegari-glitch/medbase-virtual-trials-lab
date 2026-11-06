import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Mic, Send, Volume2, X } from "lucide-react";
import { speak, useLang } from "@/i18n";
import { diseases, searchDiseases } from "@/data/knowledge";
import { cn } from "@/lib/utils";

/**
 * A scripted helper, not an AI model: it answers from the MedBase library by keyword match and
 * points to pages. It never gives medical advice or recommends treatment.
 */
interface Msg {
    from: "bot" | "user";
    text: string;
    /** Translation key for text that must follow the interface language, such as the greeting. */
    key?: string;
    links?: { to: string; label: string }[];
}

const GREETING: Msg = { from: "bot", text: "", key: "greeting" };

const QUICK = ["Browse conditions", "How does the Lab work?", "Researcher sign-in", "Region, soil and food info"];

const reply = (input: string, t: (k: string) => string): Msg => {
    const q = input.toLowerCase();
    if (/^(hi|hello|hey)\b/.test(q)) return { from: "bot", text: "Hello! Ask about a condition, or about the Lab." };
    if (q.includes("browse") || q.includes("all conditions"))
        return {
            from: "bot",
            text: `The library covers ${diseases.length} conditions, from infectious diseases like TB and cholera to bone and heart conditions.`,
            links: [{ to: "/learn", label: "Open Learn" }],
        };
    if (q.includes("lab") || q.includes("simulat"))
        return {
            from: "bot",
            text: "The Lab is a virtual research workspace: run a simulation where a published model exists, and search literature, trials, drugs and genes. The only simulation model today covers type 2 diabetes progression. Other conditions have reference data only.",
            links: [
                { to: "/lab", label: "Open the Lab" },
                { to: "/methods", label: "How it works" },
            ],
        };
    if (q.includes("sign") || q.includes("researcher") || q.includes("login"))
        return {
            from: "bot",
            text: "Use Demo sign-in in the header and enter a name. It shows a placeholder ID in this browser. It is a demo: nothing is verified, it does not prove who you are, and the Lab works without it.",
        };
    if (/(region|soil|temperature|food|climate|weather)/.test(q))
        return {
            from: "bot",
            text: "Open a condition page and look for the Environment and region section. It covers regional effects, temperature, soil and food. It is filled in for TB, bone TB, dengue, malaria, typhoid, cholera, osteomyelitis and osteoporosis so far.",
            links: [{ to: "/learn", label: "Open Learn" }],
        };
    const hits = searchDiseases(input.replace(/[?.!]/g, ""));
    if (hits.length) {
        const d = hits[0];
        return {
            from: "bot",
            text: `${d.name}: ${d.description}${t("englishOnly") ? "\n" + t("englishOnly") : ""}`,
            links: [
                { to: `/learn/${d.id}`, label: `Read about ${d.name.split(" (")[0]}` },
                { to: `/lab?condition=${d.id}&tab=literature`, label: "Find research" },
            ],
        };
    }
    return {
        from: "bot",
        text: t("notFound"),
    };
};

type Recognition = { lang: string; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void };

const Chatbot = () => {
    const { t, speech } = useLang();
    const [listening, setListening] = useState(false);
    const [note, setNote] = useState("");
    const [open, setOpen] = useState(false);
    const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
    const [draft, setDraft] = useState("");
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [msgs, open]);

    const send = (text: string, shown?: string) => {
        const q = text.trim();
        if (!q) return;
        setMsgs((m) => [...m, { from: "user", text: shown ?? q }, reply(q, t)]);
        setDraft("");
        setNote("");
    };

    const say = (text: string) => {
        if (!speak(text, speech)) setNote("No voice for this language is installed on this device.");
        else setNote("");
    };

    const listen = () => {
        const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
            (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
        if (!Ctor) {
            setNote("Voice input is not supported in this browser. Try Chrome or Edge.");
            return;
        }
        const rec = new Ctor();
        rec.lang = speech;
        rec.onresult = (e) => send(e.results[0][0].transcript);
        rec.onend = () => setListening(false);
        rec.onerror = () => {
            setListening(false);
            setNote("Could not hear that. Check microphone permission and try again.");
        };
        setListening(true);
        rec.start();
    };
    const submit = (e: FormEvent) => {
        e.preventDefault();
        send(draft);
    };

    return (
        <div className="fixed right-4 z-50 flex flex-col items-end gap-3" style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            {open && (
                <div
                    role="dialog"
                    aria-label="MedBase helper"
                    className="flex h-[26rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
                    onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                >
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                        <div>
                            <p className="text-sm font-medium">{t("MedBase helper")}</p>
                            <p className="text-[11px] text-muted-foreground">{t("Scripted guide, not an AI model")}</p>
                        </div>
                        <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
                        {msgs.map((m, i) => (
                            <div key={i} className={cn("flex", m.from === "user" ? "justify-end" : "justify-start")}>
                                <div
                                    className={cn(
                                        "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                                        m.from === "user" ? "bg-foreground text-background" : "bg-secondary text-foreground",
                                    )}
                                >
                                    <p className="whitespace-pre-line">{m.key ? t(m.key) : m.text}</p>
                                    {m.from === "bot" && (
                                        <button type="button" onClick={() => say(m.key ? t(m.key) : m.text)} aria-label={t("Read aloud")} title={t("Read aloud")} className="mt-1 text-muted-foreground hover:text-foreground">
                                            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    )}
                                    {m.links && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {m.links.map((l) => (
                                                <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="text-xs text-primary underline">
                                                    {l.label}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {msgs.length === 1 && (
                            <div className="flex flex-wrap gap-2">
                                {QUICK.map((q) => (
                                    <button key={q} type="button" onClick={() => send(q, t(q))} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-secondary">
                                        {t(q)}
                                    </button>
                                ))}
                            </div>
                        )}
                        {note && <p className="text-xs text-muted-foreground" role="status">{note}</p>}
                        <div ref={endRef} />
                    </div>
                    <form onSubmit={submit} className="flex gap-2 border-t border-border p-2">
                        <input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder={t("Type a message")}
                            aria-label="Message"
                            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                        <button type="button" onClick={listen} aria-label={t("Speak")} title={t("Speak")} className={cn("rounded-md border border-border px-3", listening && "bg-secondary")}>
                            <Mic className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="submit" aria-label="Send" className="rounded-md bg-foreground px-3 text-background">
                            <Send className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </form>
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? "Close chat" : "Open chat"}
                aria-expanded={open}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg"
            >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </button>
        </div>
    );
};

export default Chatbot;
