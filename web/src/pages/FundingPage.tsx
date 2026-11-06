import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { funders } from "@/data/funding";

const FundingPage = () => (
    <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6">
            <header className="max-w-3xl">
                <p className="label-caps">Funding</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                    Where modelling work of this kind gets funded
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    A short, opinionated starting list rather than a directory. Each entry says why
                    it is relevant to in-silico disease modelling specifically, since that is
                    narrower than health research funding in general.
                </p>
            </header>

            <ul className="mt-10 divide-y divide-border border-y border-border">
                {funders.map((f) => (
                    <li key={f.name} className="py-6">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                            <h2 className="text-sm font-medium">
                                <a
                                    href={f.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:text-primary hover:underline"
                                >
                                    {f.name}
                                </a>
                            </h2>
                            <span className="label-caps shrink-0">{f.region}</span>
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">{f.focus}</p>
                        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                            {f.relevance}
                        </p>
                    </li>
                ))}
            </ul>

            <p className="mt-6 max-w-3xl text-xs text-muted-foreground">
                Hand-curated, and the links were not machine-verified in this build. Programme
                names and eligibility change frequently — confirm against the funder&rsquo;s own
                site before relying on anything here.
            </p>
        </main>

        <Footer />
    </div>
);

export default FundingPage;
