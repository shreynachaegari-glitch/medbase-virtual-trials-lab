"""Does the neural surrogate earn its place? Runs guided and plain search on the same goals and counts simulator runs.

Run: python scripts/eval_designer.py   writes results/designer_eval.json
"""
import json
import statistics
import time
from multiprocessing import Pool
from pathlib import Path

from medlab import designer

GOALS = [(drug, effect, weeks) for drug, effects in {"semaglutide": (0.5, 1.0, 1.5), "empagliflozin": (0.3, 0.5, 0.7), "sitagliptin": (0.3, 0.5, 0.7), "metformin": (0.5, 0.8, 1.1)}.items() for effect in effects for weeks in (16, 26, 52)]


def one(goal_args: tuple) -> dict:
    goal = designer.Goal(goal_args[0], goal_args[1], goal_args[2])
    row = {"drug": goal.drug, "target_effect": goal.target_effect, "weeks": goal.weeks}
    for label, flag in (("guided", True), ("plain", False)):
        started = time.perf_counter()
        result = designer.design_study(goal, use_surrogate=flag)
        design = result["simulated_design"]
        row[label] = {"simulator_runs": result["simulator_runs"], "seconds": round(time.perf_counter() - started, 1), "dose_mg": design["dose_mg"] if design else None, "effect": design["expected_effect"] if design else None}
    return row


def main() -> None:
    with Pool(10) as pool:
        rows = pool.map(one, GOALS)
    both = [r for r in rows if r["guided"]["dose_mg"] and r["plain"]["dose_mg"]]
    agreement = [abs(r["guided"]["dose_mg"] - r["plain"]["dose_mg"]) / r["plain"]["dose_mg"] for r in both]
    same_outcome = sum(bool(r["guided"]["dose_mg"]) == bool(r["plain"]["dose_mg"]) for r in rows)
    guided, plain = sum(r["guided"]["simulator_runs"] for r in rows), sum(r["plain"]["simulator_runs"] for r in rows)
    summary = {"goals": len(rows), "same_feasibility_verdict": same_outcome, "both_found_a_design": len(both),
               "total_simulator_runs_guided": guided, "total_simulator_runs_plain": plain, "fewer_runs_share": round(1 - guided / plain, 3),
               "mean_runs_guided": round(guided / len(rows), 2), "mean_runs_plain": round(plain / len(rows), 2),
               "median_dose_difference": round(statistics.median(agreement), 3) if agreement else None, "largest_dose_difference": round(max(agreement), 3) if agreement else None,
               "goals_where_guided_used_more_runs": sum(r["guided"]["simulator_runs"] > r["plain"]["simulator_runs"] for r in rows)}
    Path("results/designer_eval.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=1))
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
