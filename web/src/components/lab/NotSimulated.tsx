import { Link } from "react-router-dom";
import { Disclosure } from "./primitives";
import { cn } from "@/lib/utils";

const copy = {
    gene: {
        title: "Why there is no gene or pathway simulation here",
        what: "Simulating a variant means claiming a causal chain from variant to molecular function to physiology to clinical outcome, and for most variants that chain is not quantified — effect sizes come from association studies, which do not license simulation.",
        needs: [
            "Variant-level effect estimates with a defined causal direction, not association odds ratios",
            "A pathway model with quantified parameters, not a diagram",
            "An explicit statement of penetrance and its dependence on background and environment",
            "A way to propagate the very large uncertainty on each of the above to the output",
        ],
    },
} as const;

/** Drug simulation lives on its own page, so this note says what that page covers and what it doesn't. */
const DRUG_MODELLED = [
    "Dose to exposure to effect on glucose for semaglutide, empagliflozin, sitagliptin and metformin, in randomised trials against placebo",
    "A hypothetical candidate you define, always labelled hypothetical",
    "HbA1c, fasting glucose, weight and urinary glucose, in virtual patients built from real NHANES labs",
    "Dropout, and uncertainty in the model's calibrated parameters",
];

const DRUG_NOT_MODELLED = [
    "Hypoglycaemia: its risk rises with sulfonylureas or insulin, and it is not simulated",
    "Adverse effects: side-effect rates there are reported from real trials, not simulated",
    "Cardiovascular and other long-term outcomes",
    "Any individual person: there is no way to enter your own labs, and it is not medical advice",
    "Other drugs, insulin dosing, and conditions other than type 2 diabetes",
];

const DrugNote = ({ className }: { className?: string }) => (
    <div className={cn("border-t border-border pt-5", className)}>
        <Disclosure summary="Where drugs are simulated, and what is left out">
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                    This panel retrieves reference data and stops there. Nothing on it feeds a simulator. Simulated type 2
                    diabetes drug trials are on the{" "}
                    <Link to="/trials" className="text-primary underline underline-offset-2">
                        Virtual Trials page
                    </Link>
                    , which shows how its predictions compared with real trials, including every miss.
                </p>
                <p className="label-caps">What is modelled there</p>
                <ul className="space-y-1.5">
                    {DRUG_MODELLED.map((n) => (
                        <li key={n} className="flex gap-2">
                            <span className="text-border">—</span>
                            <span>{n}</span>
                        </li>
                    ))}
                </ul>
                <p className="label-caps">What is not</p>
                <ul className="space-y-1.5">
                    {DRUG_NOT_MODELLED.map((n) => (
                        <li key={n} className="flex gap-2">
                            <span className="text-border">—</span>
                            <span>{n}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </Disclosure>
    </div>
);

/**
 * The drug and gene panels show retrieved reference data. This note says, next to that data,
 * why none of it is turned into a simulation here: sliders on these panels would produce output
 * that looks exactly like a modelled area's, which is the reason they are absent.
 */
export const NotSimulated = ({ area, className }: { area: "drug" | keyof typeof copy; className?: string }) => {
    if (area === "drug") return <DrugNote className={className} />;
    const c = copy[area];
    return (
        <div className={cn("border-t border-border pt-5", className)}>
            <Disclosure summary={c.title}>
                <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
                    <p>{c.what}</p>
                    <p className="label-caps">What an honest version would require</p>
                    <ul className="space-y-1.5">
                        {c.needs.map((n) => (
                            <li key={n} className="flex gap-2">
                                <span className="text-border">—</span>
                                <span>{n}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs">
                        So this panel retrieves reference data and stops there. Nothing on it feeds the simulator.
                    </p>
                </div>
            </Disclosure>
        </div>
    );
};
