import { Ban, Flag, ScanSearch } from "lucide-react";
import type { ResultCaveats } from "@/lib/trials/types";

type Props = { caveats: Pick<ResultCaveats, "label_flags" | "validation_scope" | "not_modelled"> };

/**
 * What the API says this particular result cannot tell you. Flags come first and loudest. What is
 * not modelled is always shown, for every run, because it is true of every run.
 */
export const CaveatsPanel = ({ caveats }: Props) => (
    <section aria-label="Limits of this result" className="space-y-3" data-testid="caveats-panel">
        {caveats.label_flags.length > 0 && (
            <div data-testid="label-flags" className="rounded-md border-2 border-[hsl(var(--prov-extrapolated))] bg-[hsl(var(--prov-extrapolated))]/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold"><Flag className="h-3.5 w-3.5 text-[hsl(var(--prov-extrapolated))]" aria-hidden="true" />Flag for this run</p>
                <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed">
                    {caveats.label_flags.map((flag) => <li key={flag}>{flag}</li>)}
                </ul>
            </div>
        )}
        {caveats.validation_scope.length > 0 && (
            <div data-testid="validation-scope" className="rounded-md border border-[hsl(var(--prov-extrapolated))]/50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold"><ScanSearch className="h-3.5 w-3.5" aria-hidden="true" />Outside what validation tested</p>
                <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                    {caveats.validation_scope.map((note) => <li key={note}>{note}</li>)}
                </ul>
            </div>
        )}
        <div data-testid="not-modelled" className="rounded-md border border-border p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold"><Ban className="h-3.5 w-3.5" aria-hidden="true" />Not modelled</p>
            <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {caveats.not_modelled.map((note) => <li key={note}>{note}</li>)}
            </ul>
        </div>
    </section>
);
