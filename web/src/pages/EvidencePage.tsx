import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { categoryLabel, databases, type DatabaseCategory } from "@/data/sources/registry";
import {
    literature,
    mechanismNotes,
    openQuestions,
    trials,
    trialsSnapshotDate,
    trialsTotalMatching,
} from "@/data/evidence";
import { citations, doiUrl, pubmedUrl } from "@/sim/citations";

const categories = Object.keys(categoryLabel) as DatabaseCategory[];

const EvidencePage = () => (
    <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6">
            <header className="max-w-3xl">
                <p className="label-caps">Evidence layer</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                    Type 2 diabetes progression
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    The papers below are the ones the model stands on, plus the ones that
                    complicate it. Records were retrieved from PubMed and ClinicalTrials.gov during
                    the build rather than written from memory — a fabricated citation in a research
                    tool is worse than no citation.
                </p>
            </header>

            <section className="mt-12">
                <h2 className="text-base font-semibold">Why progression is modelled as a slope</h2>
                <div className="mt-5 grid gap-x-10 gap-y-6 md:grid-cols-3">
                    {mechanismNotes.map((m) => (
                        <div key={m.heading} className="border-t border-border pt-4">
                            <h3 className="text-sm font-medium">{m.heading}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                {m.body}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mt-14">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-base font-semibold">Literature</h2>
                    <span className="text-xs text-muted-foreground">
                        retrieved from PubMed · {literature.length} records
                    </span>
                </div>

                <ul className="mt-5 divide-y divide-border border-y border-border">
                    {literature.map((l) => (
                        <li key={l.pmid} className="py-5">
                            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                                <div className="min-w-0 max-w-3xl">
                                    <h3 className="text-sm font-medium leading-snug">{l.title}</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {l.authors} · <span className="italic">{l.journal}</span>{" "}
                                        <span className="tnum">{l.year}</span>
                                    </p>
                                </div>
                                <div className="flex shrink-0 gap-3 text-xs">
                                    <a
                                        href={pubmedUrl(l.pmid)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="tnum text-primary hover:underline"
                                    >
                                        PMID {l.pmid}
                                    </a>
                                    <a
                                        href={doiUrl(l.doi)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary hover:underline"
                                    >
                                        DOI
                                    </a>
                                </div>
                            </div>

                            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                                {l.relevance}
                            </p>

                            {l.feedsModel && (
                                <p className="mt-2.5 inline-block border border-[hsl(var(--prov-derived))]/35 px-2 py-0.5 text-xs text-[hsl(var(--prov-derived))]">
                                    Feeds the model — {l.feedsModel}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mt-14">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-base font-semibold">Active phase 3 trials</h2>
                    <span className="text-xs text-muted-foreground">
                        ClinicalTrials.gov · {trialsTotalMatching} recruiting phase 3 studies
                        matched · snapshot {trialsSnapshotDate}
                    </span>
                </div>

                <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="border-b border-border text-left">
                                <th className="label-caps py-2 font-medium">Trial</th>
                                <th className="label-caps py-2 font-medium">Sponsor</th>
                                <th className="label-caps py-2 text-right font-medium">Enrolment</th>
                                <th className="label-caps py-2 text-right font-medium">Sites</th>
                                <th className="label-caps py-2 text-right font-medium">
                                    Primary completion
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {trials.map((t) => (
                                <tr key={t.nctId} className="border-b border-border/60 align-top">
                                    <td className="max-w-md py-3 pr-4">
                                        <a
                                            href={`https://clinicaltrials.gov/study/${t.nctId}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="tnum text-xs text-primary hover:underline"
                                        >
                                            {t.nctId}
                                        </a>
                                        <p className="mt-1 leading-snug">{t.title}</p>
                                    </td>
                                    <td className="py-3 pr-4 text-muted-foreground">{t.sponsor}</td>
                                    <td className="tnum py-3 text-right">
                                        {t.enrollment.toLocaleString()}
                                    </td>
                                    <td className="tnum py-3 text-right">{t.sites}</td>
                                    <td className="tnum py-3 text-right text-muted-foreground">
                                        {t.primaryCompletion}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                    A static snapshot taken during the build, not a live feed.{" "}
                    <Link to="/lab?condition=diabetes&tab=trials" className="text-primary hover:underline">
                        Search the live registry in the Lab →
                    </Link>
                </p>
            </section>

            <section id="databases" className="mt-14 scroll-mt-20">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-base font-semibold">Live databases the Lab queries</h2>
                    <span className="tnum text-xs text-muted-foreground">
                        {databases.length} public APIs · called from your browser, no MedBase server
                    </span>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    The Lab&rsquo;s literature, trials, drug and gene panels read these sources live, for
                    every condition in the knowledge base. None of what they return feeds the simulator: a
                    search hit has not been read or appraised, so the model&rsquo;s parameters stay fixed to
                    the papers above. Each entry says what the source is trusted for and what it is not.
                </p>

                <div className="mt-6 space-y-8">
                    {categories.map((cat) => (
                        <div key={cat}>
                            <h3 className="label-caps border-b border-border pb-2">{categoryLabel[cat]}</h3>
                            <ul className="divide-y divide-border/60">
                                {databases
                                    .filter((d) => d.category === cat)
                                    .map((d) => (
                                        <li key={d.id} className="grid gap-x-10 gap-y-2 py-4 md:grid-cols-[240px_minmax(0,1fr)]">
                                            <div>
                                                <a
                                                    href={d.homepage}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-sm font-medium hover:text-primary hover:underline"
                                                >
                                                    {d.name}
                                                </a>
                                                <p className="mt-0.5 text-xs text-muted-foreground">{d.provider}</p>
                                                <a
                                                    href={d.docs}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="mt-1 inline-block text-xs text-primary hover:underline"
                                                >
                                                    API documentation
                                                </a>
                                            </div>
                                            <div className="max-w-3xl space-y-1.5 text-sm leading-relaxed">
                                                <p>{d.usedFor}</p>
                                                <p className="text-muted-foreground">
                                                    <span className="label-caps mr-1.5 text-[hsl(var(--prov-extrapolated))]">
                                                        Caveat
                                                    </span>
                                                    {d.caveat}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    <span className="label-caps mr-1.5">Limits</span>
                                                    {d.limits}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mt-14">
                <h2 className="text-base font-semibold">Open questions</h2>
                <div className="mt-5 space-y-7">
                    {openQuestions.map((q) => {
                        const c = q.citationId ? citations[q.citationId] : undefined;
                        return (
                            <article
                                key={q.question}
                                className="max-w-3xl border-t border-border pt-4"
                            >
                                <h3 className="text-sm font-medium text-balance">{q.question}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                    {q.why}
                                </p>
                                {c && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        {c.short} ·{" "}
                                        <a
                                            href={pubmedUrl(c.pmid)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="tnum text-primary hover:underline"
                                        >
                                            PMID {c.pmid}
                                        </a>
                                    </p>
                                )}
                            </article>
                        );
                    })}
                </div>
            </section>
        </main>

        <Footer />
    </div>
);

export default EvidencePage;
