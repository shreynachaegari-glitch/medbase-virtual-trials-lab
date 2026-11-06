# Saved runs for /trials

`/trials` reads JSON files from `public/snapshots/` and labels what it takes from them **"Saved run"**, or **"Saved run, live simulator offline"** when nothing else is available. See `DEPLOY_STATIC.md` for when each mode applies.

`web/scripts/make_static_snapshots.py` generates the files that need no calibration, from the real engine code: `parameters.json`, `drugs.json`, `progression-scenarios.json` and `safety-*.json`. Everything else must come from real runs with the real, calibrated engine.

With no files, the page shows empty-state messages and no numbers. **Never put hand-written, fixture or pre-calibration numbers here.** `tests/fixtures/` holds invented values for UI tests only and must not be copied here.

**`scripts/make_snapshots.py` does not write these names yet.** It writes `safety_sema.json`, `safety_empa.json`, `trial.json`, `trial_candidate.json`, `trial_kidney.json` and `assistant.json`, which this page does not read. `validation.json`, `parameters.json`, `drugs.json`, `calibration.json`, `power.json` and `responders.json` already match. Its `trial_kidney` is one file, and the kidney preset needs two.

## Rules

- Each file is the unmodified JSON body of one API response, except `assistant-starters.json`.
- A file that is missing, not JSON, or the wrong shape counts as absent. Nothing is shown from it and nothing crashes.
- With a server, a saved run is only used when the server becomes unreachable. A live error, such as a 404 for validation not run, is reported as itself.
- With no server, a saved GET file answers first, so tabs work before the in-browser engine has loaded. Saved simulation runs are only used if the engine can't start.
- Regenerate all of these after any change to the posterior, the engine or the API. A saved file can go stale without any warning on the page.

## Files

The file name and request must match exactly. The three trial presets are matched by comparing the form with the preset, so an edited design gets a message and not a saved run.

### GET responses

| File | From |
|---|---|
| `validation.json` | `GET /api/validation`. The page also accepts the copy in `public/engine/` |
| `calibration.json` | `GET /api/calibration`. The page also reads these keys from `public/engine/posterior.json` |
| `parameters.json` | `GET /api/parameters` |
| `drugs.json` | `GET /api/drugs` |
| `safety-semaglutide.json` | `GET /api/safety/semaglutide` |
| `safety-empagliflozin.json` | `GET /api/safety/empagliflozin` |
| `safety-sitagliptin.json` | `GET /api/safety/sitagliptin` |
| `safety-metformin.json` | `GET /api/safety/metformin` |
| `progression-scenarios.json` | `GET /api/progression/scenarios` |

### POST responses

Every trial body below also has `"background": "any"`, `"dropout": 0`, `"n_per_arm": 200`.

| File | From | Body |
|---|---|---|
| `trial-sema-vs-empa-30wk.json` | `POST /api/trial` | `{"arms":[{"drug":"semaglutide","mg":1},{"drug":"empagliflozin","mg":25}],"weeks":30,"egfr_min":30,"egfr_max":400}` |
| `trial-kidney-egfr-30-60.json` | `POST /api/trial` | `{"arms":[{"drug":"empagliflozin","mg":25}],"weeks":26,"egfr_min":30,"egfr_max":60}` |
| `trial-kidney-egfr-90-plus.json` | `POST /api/trial` | `{"arms":[{"drug":"empagliflozin","mg":25}],"weeks":26,"egfr_min":90,"egfr_max":400}` |
| `trial-candidate.json` | `POST /api/trial` | `{"arms":[{"candidate":{"name":"Candidate X","mechanism":"hgp","half_life_h":24,"volume_l":70,"emax":0.3,"ec50_nmol":100,"mg_per_day":50}}],"weeks":26,"egfr_min":30,"egfr_max":400}` |
| `responders.json` | `POST /api/responders` | `{"arms":[{"drug":"semaglutide","mg":1}],"weeks":30,"egfr_min":30,"egfr_max":400}` |
| `power.json` | `POST /api/power` | `{"arms":[{"drug":"semaglutide","mg":1}],"weeks":30,"egfr_min":30,"egfr_max":400}` |
| `design-semaglutide.json` | `POST /api/design` | `{"drug":"semaglutide","target_effect":1.0,"weeks":26,"background":"any","target_power":0.8}` |
| `design-empagliflozin.json` | `POST /api/design` | same goal, `"drug":"empagliflozin"` |
| `design-sitagliptin.json` | `POST /api/design` | same goal, `"drug":"sitagliptin"` |
| `design-metformin.json` | `POST /api/design` | same goal, `"drug":"metformin"` |
| `progression-published-figure7-reference.json` | `POST /api/progression/run` | `{"scenario":"published-figure7-reference"}` |
| `progression-no-sensitivity-recovery-control.json` | `POST /api/progression/run` | `{"scenario":"no-sensitivity-recovery-control"}` |
| `progression-earlier-sensitivity-transition.json` | `POST /api/progression/run` | `{"scenario":"earlier-sensitivity-transition"}` |
| `progression-later-sensitivity-transition.json` | `POST /api/progression/run` | `{"scenario":"later-sensitivity-transition"}` |

Offline, the page opens `trial-sema-vs-empa-30wk.json` and `design-semaglutide.json` straight away, and the kidney preset needs both of its files. `responders.json` and `power.json` show whichever arm they were run for, whatever is selected in the tab, and the result names that arm.

`POST /api/responders` and `POST /api/power` accept exactly one arm, so the bodies above carry one.

### `assistant-starters.json`

The only file that isn't a raw response. It is an array, with one entry per starter question, answered by a real `POST /api/assistant`:

```json
[{ "question": "<starter text, exactly>", "reply": { "text": "", "source": "planner", "tool_calls": [{ "tool": "", "ok": true }], "guard_note": null, "sent_to_provider": false } }]
```

The starter questions, which must match exactly:

- `Compare semaglutide 1 mg and empagliflozin 25 mg over 30 weeks`
- `Does empagliflozin weaken in kidney disease?`
- `How accurate is this lab?`
- `Who responds to empagliflozin?`
- `What sample size would a sitagliptin trial need?`
- `What side effects were reported for semaglutide?`
- `Should I stop taking my metformin?`

Any other question, offline, gets a message saying no saved answer exists.

## Shapes

The fields the page reads are defined in `src/lib/trials/types.ts`. The minimum keys for a file to count as valid are the `guards` in `src/lib/trials/api.ts`.

## Example

```bash
API=http://localhost:8000; OUT=public/snapshots; mkdir -p "$OUT"
curl -sf "$API/api/validation" -o "$OUT/validation.json"
curl -sf -X POST "$API/api/trial" -H 'Content-Type: application/json' \
  -d '{"arms":[{"drug":"empagliflozin","mg":25}],"weeks":26,"n_per_arm":200,"background":"any","dropout":0,"egfr_min":30,"egfr_max":60}' \
  -o "$OUT/trial-kidney-egfr-30-60.json"
```

Rebuild afterwards (`npm run build`) so the files reach `dist/`. Check the body against `PRESETS` in `src/lib/trials/form.ts` if the presets ever change.
