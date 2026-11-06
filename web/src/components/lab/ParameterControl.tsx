import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { ProvenanceTag } from "@/components/Provenance";
import { snap } from "@/sim/experiment";
import type { ParamSpec } from "@/sim/params";
import { cn } from "@/lib/utils";

/**
 * Slider plus a typed value. The slider is for exploring; the number field is for entering the
 * exact value a protocol calls for. Both snap to the parameter's step and range.
 */
const ParameterControl = ({
    spec,
    value,
    onChange,
}: {
    spec: ParamSpec;
    value: number;
    onChange: (v: number) => void;
}) => {
    const [draft, setDraft] = useState<string | null>(null);
    const changed = Math.abs(value - spec.value) > 1e-12;
    // Shown at the slider's own precision, so 8 reads as "8.0" when the step is 0.1.
    const shown = value.toFixed((String(spec.step).split(".")[1] ?? "").length);

    const commit = () => {
        if (draft !== null) {
            const n = Number(draft);
            if (draft.trim() !== "" && Number.isFinite(n)) onChange(snap(spec, n));
        }
        setDraft(null);
    };

    return (
        <div>
            <div className="flex items-center justify-between gap-3">
                <label htmlFor={spec.id} className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span
                        className={cn(
                            "inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-opacity",
                            changed ? "bg-primary opacity-100" : "opacity-0",
                        )}
                        aria-hidden="true"
                    />
                    <span className="truncate">{spec.label}</span>
                    {changed && <span className="sr-only">(changed from default)</span>}
                </label>
                <div className="flex shrink-0 items-center gap-1">
                    {changed && (
                        <button
                            type="button"
                            onClick={() => onChange(spec.value)}
                            title={`Reset to ${spec.value} ${spec.unit}`}
                            aria-label={`Reset ${spec.label} to ${spec.value}`}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                            <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        </button>
                    )}
                    <input
                        type="number"
                        inputMode="decimal"
                        aria-label={`${spec.label} value in ${spec.unit}`}
                        value={draft ?? shown}
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setDraft(null);
                        }}
                        className="tnum h-7 w-[4.5rem] rounded border border-transparent bg-transparent px-1.5 text-right text-sm font-medium hover:border-input focus:border-input focus:bg-card [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="w-12 text-xs text-muted-foreground">{spec.unit}</span>
                </div>
            </div>
            <input
                id={spec.id}
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value}
                onChange={(e) => onChange(snap(spec, Number(e.target.value)))}
                className="mt-2"
                aria-valuetext={`${shown} ${spec.unit}`}
            />
            <div className="tnum mt-1 flex justify-between text-[10px] text-muted-foreground/70" aria-hidden="true">
                <span>{spec.min}</span>
                <span>{spec.max}</span>
            </div>
            <ProvenanceTag provenance={spec.provenance} className="mt-1" />
        </div>
    );
};

export default ParameterControl;
