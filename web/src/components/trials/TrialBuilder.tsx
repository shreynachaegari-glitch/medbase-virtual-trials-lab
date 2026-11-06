import type { ReactNode } from "react";
import { FlaskConical, Lock, Play, Plus, Sparkles, X } from "lucide-react";
import { armStyles, BACKGROUNDS, MECHANISMS, drugName } from "@/lib/trials/format";
import { armLabel, candidateArm, drugArm, MAX_ARMS, PRESETS, unitOf, type ArmDraft, type CandidateArmDraft, type DesignForm, type DrugArmDraft, type FieldErrors, type Preset } from "@/lib/trials/form";
import type { DrugsResponse } from "@/lib/trials/types";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/lab/primitives";
import { Field } from "./bits";

interface Props {
    form: DesignForm;
    onChange: (next: DesignForm) => void;
    errors: FieldErrors;
    drugs: DrugsResponse | null;
    busy: boolean;
    onRun: () => void;
    onPreset: (preset: Preset) => void;
    activePreset: Preset["id"] | null;
}

const numberProps = { type: "number", inputMode: "decimal", step: "any" } as const;

const Swatch = ({ color, dash }: { color: string; dash?: string }) => (
    <svg width="20" height="8" aria-hidden="true" className="shrink-0">
        <line x1="1" x2="19" y1="4" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
);

const PresetCard = ({ preset, active, onClick }: { preset: Preset; active: boolean; onClick: () => void }) => {
    const Icon = preset.id === "candidate" ? Sparkles : FlaskConical;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            data-testid={`preset-${preset.id}`}
            className={cn(
                "group flex min-w-0 flex-col items-start gap-1.5 bg-background p-4 text-left transition-colors hover:bg-card",
                active && "bg-card shadow-[inset_0_-2px_0_hsl(var(--foreground))]",
            )}
        >
            <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
                {preset.title}
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">{preset.blurb}</span>
        </button>
    );
};

const DrugRow = ({ arm, color, dash, drugs, errors, onPatch, onRemove }: { arm: DrugArmDraft; color: string; dash?: string; drugs: DrugsResponse | null; errors: FieldErrors; onPatch: (patch: Partial<DrugArmDraft>) => void; onRemove: () => void }) => {
    const info = drugs?.drugs.find((d) => d.drug === arm.drug);
    const names = drugs?.drugs.map((d) => d.drug) ?? [arm.drug];
    const mgError = errors[`${arm.id}.mg`];
    return (
        <li className="grid grid-cols-[1.25rem_minmax(0,1fr)_2rem] items-start gap-x-2 border-t border-[hsl(var(--rule))] py-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_8.5rem_2rem]">
            <span className="mt-4"><Swatch color={color} dash={dash} /></span>
            <Field label="Drug" htmlFor={`${arm.id}-drug`}>
                <select id={`${arm.id}-drug`} value={arm.drug} onChange={(e) => onPatch({ drug: e.target.value, mg: "" })} className="field-input">
                    {names.map((name) => <option key={name} value={name}>{drugName(name)}</option>)}
                </select>
            </Field>
            <Field
                label={`Dose, ${unitOf(arm.drug, drugs?.drugs)}`}
                htmlFor={`${arm.id}-mg`}
                error={mgError}
                hint={info ? `${info.min_mg} to ${info.max_mg}` : undefined}
                className="col-start-2 row-start-2 mt-2 sm:col-start-3 sm:row-start-1 sm:mt-0"
            >
                <input
                    id={`${arm.id}-mg`}
                    {...numberProps}
                    min={info?.min_mg}
                    max={info?.max_mg}
                    value={arm.mg}
                    onChange={(e) => onPatch({ mg: e.target.value })}
                    aria-invalid={Boolean(mgError)}
                    aria-describedby={mgError ? `${arm.id}-mg-error` : undefined}
                    className="field-input tnum"
                />
            </Field>
            <RemoveArm label={drugName(arm.drug)} onRemove={onRemove} />
        </li>
    );
};

const RemoveArm = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
    <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="mt-5 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
        <X className="h-4 w-4" aria-hidden="true" />
    </button>
);

const CANDIDATE_FIELDS: { key: "half_life_h" | "volume_l" | "emax" | "ec50_nmol" | "mg_per_day"; label: string; hint: string }[] = [
    { key: "half_life_h", label: "Half-life, hours", hint: "How fast it clears" },
    { key: "volume_l", label: "Volume, litres", hint: "How widely it spreads" },
    { key: "emax", label: "Emax", hint: "Largest effect at full exposure" },
    { key: "ec50_nmol", label: "EC50, nmol/L", hint: "Exposure for half that effect" },
    { key: "mg_per_day", label: "Dose, mg/day", hint: "Taken every day" },
];

const CandidateRow = ({ arm, mechanisms, errors, onPatch, onRemove }: { arm: CandidateArmDraft; mechanisms: string[]; errors: FieldErrors; onPatch: (patch: Partial<CandidateArmDraft>) => void; onRemove: () => void }) => (
    <li data-testid="candidate-form" className="my-2 rounded-md border border-dashed border-foreground/40 bg-card/40 p-3">
        <div className="flex items-center justify-between gap-2">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Swatch color="var(--arm-candidate)" dash="3 4" />
                <span className="label-caps rounded-sm border border-dashed border-foreground/60 px-1.5 py-0.5 text-foreground">Hypothetical</span>
                Not a real molecule
            </p>
            <button type="button" onClick={onRemove} aria-label={`Remove ${arm.name || "candidate"}`} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            These starting values are placeholders, not data. The result only shows what the model does with what you assume.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
            <Field label="Name" htmlFor={`${arm.id}-name`} className="col-span-2 md:col-span-1">
                <input id={`${arm.id}-name`} maxLength={40} value={arm.name} onChange={(e) => onPatch({ name: e.target.value })} className="field-input" />
            </Field>
            <Field label="Mechanism" htmlFor={`${arm.id}-mechanism`} className="col-span-2 md:col-span-2 xl:col-span-1">
                <select id={`${arm.id}-mechanism`} value={arm.mechanism} onChange={(e) => onPatch({ mechanism: e.target.value })} className="field-input">
                    {mechanisms.map((m) => <option key={m} value={m}>{MECHANISMS[m] ?? m}</option>)}
                </select>
            </Field>
            {CANDIDATE_FIELDS.map((f) => {
                const error = errors[`${arm.id}.${f.key}`];
                return (
                    <Field key={f.key} label={f.label} htmlFor={`${arm.id}-${f.key}`} hint={f.hint} error={error}>
                        <input
                            id={`${arm.id}-${f.key}`}
                            {...numberProps}
                            min="0"
                            value={arm[f.key]}
                            onChange={(e) => onPatch({ [f.key]: e.target.value })}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? `${arm.id}-${f.key}-error` : undefined}
                            className="field-input tnum"
                        />
                    </Field>
                );
            })}
        </div>
    </li>
);

const Column = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
    <fieldset className={cn("min-w-0 bg-background p-4", className)}>
        <legend className="sr-only">{title}</legend>
        <p className="label-caps mb-3" aria-hidden="true">{title}</p>
        {children}
    </fieldset>
);

/** The trial protocol, as a ruled sheet. Stays editable while a run is in progress. */
export const TrialBuilder = ({ form, onChange, errors, drugs, busy, onRun, onPreset, activePreset }: Props) => {
    const set = <K extends keyof DesignForm>(key: K, value: DesignForm[K]) => onChange({ ...form, [key]: value });
    const patchArm = (id: string, patch: Partial<DrugArmDraft> | Partial<CandidateArmDraft>) =>
        onChange({ ...form, arms: form.arms.map((a) => (a.id === id ? ({ ...a, ...patch } as ArmDraft) : a)) });
    const removeArm = (id: string) => onChange({ ...form, arms: form.arms.filter((a) => a.id !== id) });
    const firstUnused = drugs?.drugs.find((d) => !form.arms.some((a) => a.kind === "drug" && a.drug === d.drug)) ?? drugs?.drugs[0];
    const full = form.arms.length >= MAX_ARMS;
    const labels = form.arms.map((a) => armLabel(a, (d) => unitOf(d, drugs?.drugs)));
    const styles = armStyles(labels);
    const mechanisms = drugs?.candidate_mechanisms ?? Object.keys(MECHANISMS);
    const numberField = (key: keyof DesignForm, label: string, opts: { hint?: string; min?: number; max?: number; className?: string } = {}) => {
        const error = errors[key];
        return (
            <Field label={label} htmlFor={`trial-${key}`} hint={opts.hint} error={error} className={opts.className}>
                <input
                    id={`trial-${key}`}
                    {...numberProps}
                    min={opts.min}
                    max={opts.max}
                    value={form[key] as string}
                    onChange={(e) => set(key, e.target.value as never)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `trial-${key}-error` : undefined}
                    className="field-input tnum"
                />
            </Field>
        );
    };

    return (
        <section aria-labelledby="builder-heading">
            <h2 id="builder-heading" className="text-lg font-semibold tracking-tight">Build a trial by hand</h2>
            <p className="mt-1 text-sm text-muted-foreground">Start from a question, or set the protocol yourself. Every arm runs against placebo.</p>

            <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3">
                {PRESETS.map((preset) => (
                    <PresetCard key={preset.id} preset={preset} active={activePreset === preset.id} onClick={() => onPreset(preset)} />
                ))}
            </div>

            {/* noValidate: limits belong to the API, and its own message should reach the reader. */}
            <form
                noValidate
                className="mt-4 overflow-hidden rounded-md border border-border"
                onSubmit={(e) => {
                    e.preventDefault();
                    onRun();
                }}
            >
                <div className="grid gap-px bg-border lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <Column title="Arms">
                        <ul>
                            <li className="flex items-center gap-2 pb-3 text-sm">
                                <Swatch color="var(--arm-placebo)" />
                                Placebo
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Lock className="h-3 w-3" aria-hidden="true" />
                                    always the control
                                </span>
                            </li>
                            {form.arms.map((arm, i) =>
                                arm.kind === "drug" ? (
                                    <DrugRow key={arm.id} arm={arm} color={styles[labels[i]].color} dash={styles[labels[i]].dash} drugs={drugs} errors={errors} onPatch={(p) => patchArm(arm.id, p)} onRemove={() => removeArm(arm.id)} />
                                ) : (
                                    <CandidateRow key={arm.id} arm={arm} mechanisms={mechanisms} errors={errors} onPatch={(p) => patchArm(arm.id, p)} onRemove={() => removeArm(arm.id)} />
                                ),
                            )}
                        </ul>
                        {errors.arms && <p className="mt-1 text-xs text-[hsl(var(--fail))]">{errors.arms}</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" disabled={full || !firstUnused} onClick={() => firstUnused && set("arms", [...form.arms, drugArm(firstUnused.drug, String(firstUnused.min_mg))])} className="btn-outline gap-1.5 !px-3 !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                                <Plus className="h-3 w-3" aria-hidden="true" />
                                Add a drug
                            </button>
                            <button type="button" disabled={full} onClick={() => set("arms", [...form.arms, candidateArm()])} className="btn-outline gap-1.5 !px-3 !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                                <Plus className="h-3 w-3" aria-hidden="true" />
                                Add a hypothetical candidate
                            </button>
                        </div>
                        {full && <p className="mt-2 text-xs text-muted-foreground">The simulator takes up to {MAX_ARMS} arms besides placebo.</p>}
                    </Column>

                    <Column title="Patients">
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                {numberField("egfr_min", "Lowest eGFR", { min: 15, max: 400 })}
                                {numberField("egfr_max", "Highest eGFR", { min: 15, max: 400 })}
                            </div>
                            <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-muted-foreground hover:text-foreground">
                                <input type="checkbox" checked={form.compare} onChange={(e) => set("compare", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
                                Also run a second eGFR range and compare the two
                            </label>
                            {form.compare && (
                                <div className="grid grid-cols-2 gap-3">
                                    {numberField("egfr2_min", "Second range, lowest", { min: 15, max: 400 })}
                                    {numberField("egfr2_max", "Second range, highest", { min: 15, max: 400 })}
                                </div>
                            )}
                            <div>
                                <p className="mb-1 text-xs text-muted-foreground" id="background-label">Background therapy</p>
                                <Segmented value={form.background} options={BACKGROUNDS} onChange={(v) => set("background", v)} label="Background therapy" />
                            </div>
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                                Virtual patients are built from real NHANES labs. There is no mode for entering your own.
                            </p>
                        </div>
                    </Column>

                    <Column title="Conduct">
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
                            {numberField("weeks", "Weeks", { min: 4, max: 156 })}
                            {numberField("n_per_arm", "Patients per arm", { min: 10, max: 500 })}
                            {numberField("dropout_pct", "Dropout what-if, %", { min: 0, max: 80, hint: "A what-if, not a measured quantity. Patients stop at a random week" })}
                        </div>
                    </Column>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/40 px-4 py-3">
                    <p className="min-w-0 text-xs text-muted-foreground">
                        {form.arms.length === 0 ? "Add an arm to run." : `Placebo against ${labels.join(", ")}.`}
                    </p>
                    <button type="submit" disabled={busy} className="btn-solid gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        {busy ? "Running…" : "Run simulated trial"}
                    </button>
                </div>
            </form>
        </section>
    );
};
