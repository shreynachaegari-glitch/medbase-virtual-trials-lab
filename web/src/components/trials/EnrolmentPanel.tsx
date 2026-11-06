import { TriangleAlert } from "lucide-react";
import { fmtNum } from "@/lib/trials/format";
import type { Enrolment } from "@/lib/trials/types";

const MATCHED: { key: string; label: string; unit: string; digits: number }[] = [
    { key: "a1c", label: "HbA1c", unit: "%", digits: 2 },
    { key: "fpg", label: "Fasting glucose", unit: "mg/dL", digits: 1 },
    { key: "weight", label: "Weight", unit: "kg", digits: 1 },
    { key: "age", label: "Age", unit: "y", digits: 1 },
    { key: "egfr", label: "eGFR", unit: "", digits: 1 },
];

/** The API decides what counts as thin, and says so in `enrolment.thin_pool`. */
export const ThinPoolCaution = ({ enrolment, label }: { enrolment: Enrolment; label?: string }) =>
    enrolment.thin_pool ? (
        <p role="note" data-testid="thin-pool" className="flex items-start gap-2 rounded-md border border-[hsl(var(--prov-extrapolated))]/50 bg-[hsl(var(--prov-extrapolated))]/10 p-3 text-xs leading-relaxed">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />
            <span>
                <strong className="font-semibold">Thin pool{label ? ` at ${label}` : ""}.</strong> Only {enrolment.eligible_real_participants} real participants fit these criteria, so this virtual population repeats a small group. Treat the result as a rough sketch.
            </span>
        </p>
    ) : null;

/** Who the virtual patients were built from. */
export const EnrolmentPanel = ({ enrolment, nPerArm }: { enrolment: Enrolment; nPerArm?: number }) => {
    const { eligible_real_participants: eligible, effective_sample_size: ess } = enrolment;
    return (
        <section aria-label="Enrolment report" className="rounded-md border border-border p-4" data-testid="enrolment-panel">
            <h3 className="label-caps">Enrolment report</h3>
            <dl className="tnum mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs">
                <dt className="font-sans text-muted-foreground">Eligible real participants (NHANES)</dt>
                <dd className="self-end text-right text-sm font-medium">{eligible}</dd>
                <dt className="font-sans text-muted-foreground">Effective sample size</dt>
                <dd className="self-end text-right text-sm font-medium">{ess}</dd>
            </dl>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                After survey weighting, the pool carries about as much information as {ess} independent people.
                {nPerArm !== undefined && nPerArm > ess ? ` At ${nPerArm} per arm, virtual patients outnumber that, so intervals can look tighter than the data supports.` : ""}
            </p>
            <div className="mt-3"><ThinPoolCaution enrolment={enrolment} /></div>
            <h4 className="label-caps mt-3">Simulated cohort means</h4>
            <dl className="tnum mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                {MATCHED.filter((m) => enrolment.matched[m.key] !== undefined).map((m) => (
                    <div key={m.key} className="contents">
                        <dt className="font-sans text-muted-foreground">{m.label}</dt>
                        <dd className="text-right">{fmtNum(enrolment.matched[m.key], m.digits)}{m.unit && ` ${m.unit}`}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
};
