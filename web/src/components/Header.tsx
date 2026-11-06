import { useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthButton } from "@/components/ResearcherAuth";
import { LANGS, useLang, type LangId } from "@/i18n";

const nav = [
    { to: "/learn", label: "Learn" },
    { to: "/anatomy", label: "Anatomy" },
    { to: "/lab", label: "Lab" },
    { to: "/trials", label: "Virtual Trials" },
    { to: "/evidence", label: "Evidence" },
    { to: "/methods", label: "Methods" },
    { to: "/funding", label: "Funding" },
];

const Header = () => {
    const { pathname } = useLocation();
    const { t, lang, setLang } = useLang();
    const picker = (
        <select
            value={lang}
            onChange={(e) => setLang(e.target.value as LangId)}
            aria-label={t("Language")}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
            {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                    {l.label}
                </option>
            ))}
        </select>
    );
    const [open, setOpen] = useState(false);

    return (
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
                <Link to={import.meta.env.VITE_LANDING ? "/home" : "/"} className="flex items-baseline gap-2" onClick={() => setOpen(false)}>
                    <span className="text-[15px] font-semibold tracking-tight">MedBase</span>
                    <span className="label-caps hidden sm:inline lg:hidden xl:inline">Virtual Laboratory</span>
                </Link>

                <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
                    {nav.map((item) => {
                        const active = pathname.startsWith(item.to);
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={cn(
                                    "relative px-3 py-1.5 text-sm transition-colors",
                                    active
                                        ? "text-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {t(item.label)}
                                {/* Moves only on navigation — state indication, not decoration. */}
                                {active && (
                                    <motion.span
                                        layoutId="nav-active"
                                        className="absolute inset-x-1 -bottom-[13px] h-px bg-foreground"
                                        transition={{
                                            type: "spring",
                                            duration: 0.35,
                                            bounce: 0.15,
                                        }}
                                    />
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="hidden items-center gap-2 lg:flex">{picker}<AuthButton /></div>

                {/* The links do not fit beside the wordmark on a phone, so they fold into a menu. */}
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-controls="mobile-nav"
                    aria-label={open ? "Close menu" : "Open menu"}
                    className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
                >
                    {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
                </button>
            </div>

            {open && (
                <nav
                    id="mobile-nav"
                    aria-label="Main"
                    className="border-t border-border px-2 pb-3 pt-2 lg:hidden"
                    onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                >
                    <div className="flex items-center gap-2 px-1 pb-2">{picker}<AuthButton /></div>
                    {nav.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setOpen(false)}
                            className={({ isActive }) =>
                                cn(
                                    "block rounded-md px-3 py-2.5 text-sm",
                                    isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                                )
                            }
                        >
                            {t(item.label)}
                        </NavLink>
                    ))}
                </nav>
            )}
        </header>
    );
};

export default Header;
