import { Link } from "react-router-dom";
import type { SingleArm } from "@/hooks/useSingleArm";
import type { DesignForm } from "@/lib/trials/form";
import { drugName, egfrLabel } from "@/lib/trials/format";
import type { DrugsResponse } from "@/lib/trials/types";
import { Field } from "./bits";

/** One drug against placebo, because that is all these analyses accept. */
export const ArmPicker = ({ form, drugs, single, id }: { form: DesignForm; drugs: DrugsResponse | null; single: SingleArm; id: string }) => {
    const candidate = single.candidates.find((c) => c.id === single.choice) ?? null;
    const unit = single.drug?.unit ?? "";
    return (
        <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-3">
                <Field label="Drug to test against placebo" htmlFor={id} className="w-full max-w-xs">
                    <select id={id} value={single.choice} onChange={(e) => single.setChoice(e.target.value)} className="field-input">
                        {single.choices.map((choice) => {
                            const c = single.candidates.find((x) => x.id === choice);
                            return <option key={choice} value={choice}>{c ? `${c.name} (hypothetical)` : drugName(choice)}</option>;
                        })}
                    </select>
                </Field>
                {!candidate && (
                    <Field
                        label={`Dose${unit ? `, ${unit}` : ""}`}
                        htmlFor={`${id}-mg`}
                        hint={single.drug ? `${single.drug.min_mg} to ${single.drug.max_mg}` : undefined}
                        className="w-32"
                    >
                        <input id={`${id}-mg`} type="number" step="any" inputMode="decimal" min={single.drug?.min_mg} max={single.drug?.max_mg} value={single.mg} onChange={(e) => single.setMg(e.target.value)} className="field-input tnum" />
                    </Field>
                )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
                {form.weeks || "?"} weeks · {egfrLabel(single.body.egfr_min, single.body.egfr_max)}, from the{" "}
                <Link to={{ search: "?tab=trial" }} className="text-primary underline underline-offset-2">trial builder</Link>.
                {drugs === null ? " The drug list isn't available right now." : ""}
            </p>
        </div>
    );
};
