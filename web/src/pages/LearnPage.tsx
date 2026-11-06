import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { categories, diseases } from "@/data/knowledge";
import { BodyAtlas } from "@/components/atlas/BodyAtlas";
import { cn } from "@/lib/utils";

const LearnPage = () => {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<string | null>(null);

    const results = useMemo(() => {
        const q = query.toLowerCase().trim();
        return diseases.filter((d) => {
            const matchesCategory = !category || d.category === category;
            const matchesQuery =
                !q ||
                d.name.toLowerCase().includes(q) ||
                d.category.toLowerCase().includes(q) ||
                d.keywords.some((k) => k.toLowerCase().includes(q));
            return matchesCategory && matchesQuery;
        });
    }, [query, category]);

    return (
        <div className="flex min-h-screen flex-col">
            <Header />

            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6">
                <header className="max-w-3xl">
                    <p className="label-caps">Knowledge base</p>
                    <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                        Learn the condition before you model it
                    </h1>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                        Plain-language reference records on {diseases.length} conditions, each
                        citing the public health sources it draws on. Written for students and
                        anyone learning the ground before touching the simulation side.
                    </p>
                </header>

                <BodyAtlas />

                <div className="mt-10 flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center">
                    <div className="flex-1">
                        <label htmlFor="condition-search" className="sr-only">
                            Search conditions
                        </label>
                        <input
                            id="condition-search"
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by name, symptom or category…"
                            className="h-10 w-full rounded border border-input bg-card px-3 text-sm placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            onClick={() => setCategory(null)}
                            className={cn(
                                "rounded border px-2.5 py-1 text-xs transition-colors",
                                category === null
                                    ? "border-foreground bg-foreground text-background"
                                    : "border-input text-muted-foreground hover:text-foreground",
                            )}
                        >
                            All
                        </button>
                        {categories.map((c) => (
                            <button
                                key={c}
                                onClick={() => setCategory(c === category ? null : c)}
                                className={cn(
                                    "rounded border px-2.5 py-1 text-xs transition-colors",
                                    category === c
                                        ? "border-foreground bg-foreground text-background"
                                        : "border-input text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </div>

                {results.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                        No condition matches “{query}”. Try a symptom or a category instead.
                    </p>
                ) : (
                    <ul className="divide-y divide-border">
                        {results.map((d) => (
                            <li key={d.id}>
                                <Link
                                    to={`/learn/${d.id}`}
                                    className="group flex flex-col gap-2 py-5 sm:flex-row sm:items-baseline sm:gap-6"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                            <h2 className="text-sm font-medium group-hover:text-primary">
                                                {d.name}
                                            </h2>
                                            <span className="label-caps">{d.category}</span>
                                            {d.labModel && (
                                                <span className="border border-[hsl(var(--prov-derived))]/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[hsl(var(--prov-derived))]">
                                                    Simulable in lab
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                                            {d.description}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground group-hover:text-primary">
                                        Read →
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                <p className="mt-10 max-w-3xl border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
                    Educational reference only. These records summarise public health guidance for
                    learning purposes — they are not a diagnosis, not a treatment plan, and not a
                    substitute for a clinician.
                </p>
            </main>

            <Footer />
        </div>
    );
};

export default LearnPage;
