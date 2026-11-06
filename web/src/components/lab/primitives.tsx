import { useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import type { RemoteState } from "@/hooks/useRemote";
import { SourceError } from "@/data/sources/http";
import type { DatabaseInfo } from "@/data/sources/registry";
import { cn } from "@/lib/utils";

/* ------------------------------------ controls ------------------------------------ */

export const Segmented = <T extends string>({
    value,
    options,
    onChange,
    label,
    size = "sm",
}: {
    value: T;
    options: readonly { id: T; label: ReactNode; disabled?: boolean; title?: string }[];
    onChange: (v: T) => void;
    label: string;
    size?: "sm" | "xs";
}) => (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-card/50 p-0.5">
        {options.map((o) => (
            <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={value === o.id}
                disabled={o.disabled}
                title={o.title}
                onClick={() => onChange(o.id)}
                className={cn(
                    "rounded-[5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    size === "xs" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs",
                    value === o.id
                        ? "bg-secondary text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]"
                        : "text-muted-foreground hover:text-foreground",
                )}
            >
                {o.label}
            </button>
        ))}
    </div>
);

export const Chip = ({
    active,
    onClick,
    children,
    title,
}: {
    active?: boolean;
    onClick: () => void;
    children: ReactNode;
    title?: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-pressed={active}
        className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            active
                ? "border-foreground/80 bg-foreground text-background"
                : "border-input text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        )}
    >
        {children}
    </button>
);

export const ExternalLink = ({
    href,
    children,
    className,
}: {
    href: string;
    children: ReactNode;
    className?: string;
}) => (
    <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn("inline-flex items-baseline gap-0.5 text-primary hover:underline", className)}
    >
        {children}
        <ArrowUpRight className="h-3 w-3 shrink-0 translate-y-[1px] self-center opacity-70" aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
    </a>
);

/** A search box that submits on Enter or the button, never on every keystroke. */
export const SearchForm = ({
    value,
    onChange,
    onSubmit,
    placeholder,
    label,
    button = "Search",
    busy,
}: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    placeholder: string;
    label: string;
    button?: string;
    busy?: boolean;
}) => (
    <form
        role="search"
        className="flex min-w-0 flex-1 gap-2"
        onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
        }}
    >
        <label className="sr-only" htmlFor={`search-${label}`}>
            {label}
        </label>
        <input
            id={`search-${label}`}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground"
        />
        <button
            type="submit"
            disabled={!value.trim()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
            {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {button}
        </button>
    </form>
);

export const Disclosure = ({
    summary,
    children,
    defaultOpen,
    className,
}: {
    summary: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
    className?: string;
}) => (
    <details className={cn("group", className)} open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 -rotate-90 transition-transform group-open:rotate-0" aria-hidden="true" />
            {summary}
        </summary>
        <div className="mt-3">{children}</div>
    </details>
);

/** Long label text is clamped; the reader opts into the rest. */
export const Clamp = ({ text, lines = 4 }: { text: string; lines?: number }) => {
    const [open, setOpen] = useState(false);
    const long = text.length > lines * 110;
    return (
        <div>
            <p
                className="text-sm leading-relaxed text-muted-foreground"
                style={!open && long ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}
            >
                {text}
            </p>
            {long && (
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="mt-1 text-xs text-primary hover:underline"
                >
                    {open ? "Show less" : "Show more"}
                </button>
            )}
        </div>
    );
};

/* ------------------------------------ remote state ------------------------------------ */

const errorCopy = (error: unknown, source: string) => {
    if (error instanceof SourceError) {
        switch (error.kind) {
            case "network":
                return `Couldn't reach ${source}. That can be a dropped connection, the service being down, a browser extension blocking it, or ${source} refusing requests from other websites.`;
            case "timeout":
                return `${source} didn't answer within 15 seconds.`;
            case "rate-limit":
                return `${source} is rate-limiting requests from your network. Wait a minute and retry.`;
            case "parse":
                return `${source} answered with something this page couldn't read — its API may have changed.`;
            case "not-found":
                return `${source} has no matching record.`;
            default:
                return `${source} returned an error: ${error.message}`;
        }
    }
    return `Something went wrong reading from ${source}.`;
};

export const LoadingRows = ({ rows = 4, label }: { rows?: number; label: string }) => (
    <div role="status" aria-live="polite" className="space-y-3 py-2">
        <span className="sr-only">Loading {label}…</span>
        {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="space-y-2 border-b border-border/60 pb-3">
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-secondary/70" />
            </div>
        ))}
    </div>
);

export const ErrorNotice = ({
    error,
    source,
    onRetry,
    fallbackHref,
    children,
}: {
    error: unknown;
    source: string;
    onRetry: () => void;
    fallbackHref?: string;
    children?: ReactNode;
}) => (
    <div role="alert" className="rounded-md border border-[hsl(var(--prov-extrapolated))]/35 bg-[hsl(var(--prov-extrapolated))]/[0.06] p-4">
        <p className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
            <span>{errorCopy(error, source)}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-6 text-xs">
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-foreground hover:underline">
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Retry
            </button>
            {fallbackHref && <ExternalLink href={fallbackHref}>Run this search on {source}</ExternalLink>}
        </div>
        {children && <div className="mt-4 pl-6">{children}</div>}
    </div>
);

export const RemoteView = <T,>({
    state,
    source,
    onRetry,
    fallbackHref,
    loading,
    children,
}: {
    state: RemoteState<T>;
    source: string;
    onRetry: () => void;
    fallbackHref?: string;
    loading?: ReactNode;
    children: (data: T) => ReactNode;
}) => {
    if (state.status === "idle") return null;
    if (state.status === "loading") return <>{loading ?? <LoadingRows label={source} />}</>;
    if (state.status === "error") {
        return <ErrorNotice error={state.error} source={source} onRetry={onRetry} fallbackHref={fallbackHref} />;
    }
    return <>{children(state.data)}</>;
};

/** Attribution under every live result: where it came from, when, and the caveat that travels with it. */
export const SourceLine = ({ db, at, className }: { db: DatabaseInfo; at?: Date; className?: string }) => (
    <p className={cn("text-[11px] leading-relaxed text-muted-foreground", className)}>
        Live from{" "}
        <a href={db.homepage} target="_blank" rel="noreferrer" className="text-foreground/80 hover:underline">
            {db.name}
        </a>{" "}
        · {db.provider}
        {at && (
            <>
                {" "}
                · retrieved <time dateTime={at.toISOString()} className="tnum">{at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </>
        )}
        <span className="block text-muted-foreground/80">{db.caveat}</span>
    </p>
);

export const EmptyState = ({ children }: { children: ReactNode }) => (
    <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        {children}
    </p>
);
