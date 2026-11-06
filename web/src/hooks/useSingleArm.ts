import { useState } from "react";
import { buildDesign, withSingleArm, type CandidateArmDraft, type DesignForm, type TrialBody } from "@/lib/trials/form";
import type { Drug, DrugsResponse } from "@/lib/trials/types";

export interface SingleArm {
    /** A drug name, or the id of a hypothetical candidate from the builder. */
    choice: string;
    setChoice: (choice: string) => void;
    mg: string;
    setMg: (mg: string) => void;
    drug: Drug | null;
    candidates: CandidateArmDraft[];
    choices: string[];
    body: TrialBody;
    invalid: boolean;
}

const builderDose = (form: DesignForm, drug: string) =>
    form.arms.find((arm) => arm.kind === "drug" && arm.drug === drug && arm.mg.trim() !== "");

/**
 * Power and who-responds accept exactly one active arm. The reader picks it here; weeks, eGFR and
 * the rest of the design still come from the trial builder.
 */
export const useSingleArm = (form: DesignForm, drugs: DrugsResponse | null): SingleArm => {
    const first = form.arms[0];
    const [picked, setPicked] = useState<string | null>(null);
    const [edited, setEdited] = useState<string | null>(null);

    const candidates = form.arms.filter((arm): arm is CandidateArmDraft => arm.kind === "candidate");
    const names = drugs?.drugs.map((d) => d.drug) ?? [];
    const firstChoice = first?.kind === "drug" ? first.drug : (first?.id ?? names[0] ?? "");
    const choices = [...new Set([...names, ...candidates.map((c) => c.id), ...(firstChoice ? [firstChoice] : [])])];
    const choice = picked !== null && choices.includes(picked) ? picked : firstChoice;

    const candidate = candidates.find((c) => c.id === choice) ?? null;
    const drug = drugs?.drugs.find((d) => d.drug === choice) ?? null;
    const fromBuilder = builderDose(form, choice);
    const defaultMg = fromBuilder?.kind === "drug" ? fromBuilder.mg : drug ? String(drug.min_mg) : "";
    const mg = edited ?? defaultMg;

    const { bodies, errors } = buildDesign(form);
    const armErrors = Object.keys(errors).some((key) => key !== "arms" && !key.includes("."));
    const armBody: TrialBody["arms"][number] | null = candidate
        ? (buildDesign({ ...form, arms: [candidate] }).bodies[0].arms[0] ?? null)
        : choice && mg.trim() !== "" && Number.isFinite(Number(mg))
          ? { drug: choice, mg: Number(mg) }
          : null;

    return {
        choice,
        setChoice: (next) => {
            setPicked(next);
            setEdited(null);
        },
        mg,
        setMg: setEdited,
        drug,
        candidates,
        choices,
        body: withSingleArm(bodies[0], armBody ?? { drug: choice, mg: 0 }),
        invalid: armBody === null || armErrors,
    };
};
