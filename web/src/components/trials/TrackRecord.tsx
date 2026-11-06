import type { TrackRecord as Record_ } from "@/lib/trials/types";
import { fmtNum } from "@/lib/trials/format";

/** Shows beside a simulated result how this drug did in the blind test, including its misses. */
export const TrackRecord = ({ records }: { records?: Record<string, Record_> }) => {
    const entries = Object.entries(records ?? {}).filter(([, record]) => record.available);
    if (entries.length === 0) return null;
    return (
        <section aria-label="Blind test record for these drugs" className="my-4 rounded-md border border-border p-4" data-testid="track-record">
            <h3 className="text-sm font-medium">How these drugs did in the blind test</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{entries[0][1].note}</p>
            <ul className="mt-3 space-y-3">
                {entries.map(([arm, record]) => (
                    <li key={arm} className="text-sm">
                        <p className="font-medium">{arm}</p>
                        <ul className="mt-1 space-y-1">
                            {record.by_trial?.map((trial) => (
                                <li key={trial.trial} className="flex flex-wrap items-baseline gap-x-2 text-muted-foreground" data-testid="track-record-trial">
                                    <span className={trial.held_up ? "font-medium text-foreground" : "font-medium text-destructive"}>{trial.held_up ? "Held up" : "Missed"}</span>
                                    <span>
                                        {trial.trial}, {trial.weeks} weeks, {trial.results} results: {trial.mean_error < 0 ? "over-predicted" : "under-predicted"} the HbA1c benefit by{" "}
                                        <span className="tnum">{fmtNum(Math.abs(trial.mean_error))}</span> on average
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
        </section>
    );
};
