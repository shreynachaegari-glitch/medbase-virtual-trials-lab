"""S2: posterior predictive check on the TRAIN trials. Uses no held-out data."""
import json
from pathlib import Path

import numpy as np

from medlab import calibrate, params

names, draws, digest = calibrate.load_posterior()
cal = calibrate.Calibration()
rng = np.random.default_rng(11)
chosen = rng.choice(len(draws), size=60, replace=False)
values = {i: [] for i in range(len(cal.targets))}
uge = {mg: [] for mg, _ in calibrate.LABEL_UGE}
for d in chosen:
    p = params.with_theta(dict(zip(names, draws[d])))
    runs = cal.predict(p)
    for i, target in enumerate(cal.targets):
        values[i].append(cal.predicted_change(runs, target))
    for (mg, _), (predicted, _) in zip(calibrate.LABEL_UGE, cal.label_uge(p)):
        uge[mg].append(predicted)
rows = []
for i, target in enumerate(cal.targets):
    v = np.array(values[i])
    rows.append({"trial": target.trial, "arm": target.arm, "reference": target.reference, "endpoint": target.endpoint,
                 "observed": round(target.observed, 3), "observed_se": round(target.se, 3), "predicted": round(float(v.mean()), 3),
                 "interval95": [round(float(x), 3) for x in np.percentile(v, [2.5, 97.5])], "error": round(float(v.mean() - target.observed), 3)})
out = {"posterior_sha256": digest, "targets": rows,
       "label_uge": [{"mg": mg, "observed_g_day": obs, "predicted_g_day": round(float(np.mean(uge[mg])), 1)} for mg, obs in calibrate.LABEL_UGE],
       "note": "These trials were used for fitting, so this shows fit, not predictive skill."}
Path("results/train_fit.json").write_text(json.dumps(out, indent=1))
for r in rows:
    print(f"{r['trial']:15s} {r['arm'][:22]:22s} {r['endpoint']:7s} obs {r['observed']:+7.2f} pred {r['predicted']:+7.2f} err {r['error']:+6.2f}")
print(out["label_uge"])
