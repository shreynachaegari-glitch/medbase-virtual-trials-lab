# Deploying the public demo as a static site

The public demo is a static site. The simulator runs in the visitor's browser, so there is no server to host or pay for. A Hugging Face static Space is the target, and any static host works.

## How a request is answered

The page decides once per load, and always shows the result:

| Label on the page | When | Where answers come from |
|---|---|---|
| **Live server** | same-origin `/api/health` answers within 2 s with `{"ok": true}` | the FastAPI server |
| **Running in your browser** | no server, and the bundle is present | a Web Worker running the real engine in Pyodide |
| **Saved run** | no server, and the worker can't start | files in `public/snapshots/`, labelled as saved |

In browser mode a saved file answers straight away if one exists, so Proof, Parameters and Safety don't wait for the engine. The engine is only asked when there is no file. Simulations always run in the worker, one at a time, and never on the main thread.

The worker starts downloading as soon as `/trials` opens, unless the browser asks to save data. Then it waits for the visitor to ask.

## The AI copilot

Set `VITE_LLM_PROXY` at build time to the proxy's address, as `scripts/deploy_static.sh` does. It holds no secret: the key stays on the proxy, and no key is ever in the browser. The worker then asks the proxy what to do and runs the tools itself, and the engine's guard has the last word on the reply. Without the variable, the assistant is the offline planner, as before.

The proxy only accepts the origins in its `ALLOWED_ORIGINS`, so a site at any other address gets 403 and falls back to the planner, with a note saying so.

## The 3D body

`public/hra/` holds Human Reference Atlas organs, built by `scripts/hra/build.mjs` (`cd web/scripts/hra && npm install && node build.mjs`). They are committed output, so a deploy doesn't need to rebuild them. `/learn` loads all 19 models, and `/trials` only loads 5, after a trial has run. Credit must stay visible: it is CC BY 4.0, and it is shown on the page and in `THIRD_PARTY_NOTICES.md`.

## The surrogate

`scripts/train_surrogate.py` writes `public/surrogate.json` after calibration. Until it exists, the explorer shows a not-trained state and no numbers.

## Build

From the project root:

```bash
.venv/bin/python scripts/make_browser_bundle.py        # public/engine/: engine code, labs, safety records, results
.venv/bin/python web/scripts/make_static_snapshots.py  # public/snapshots/: parameters, drugs, scenarios, safety
.venv/bin/python scripts/train_surrogate.py            # public/surrogate.json, after calibration
cd web && npm ci && npm run build:static               # writes web/dist/
```

Re-run the bundle script **after calibration and validation finish**, and after any change to `medlab/`. It copies `posterior.json` and `validation.json` when they exist, and `manifest.json` records which ones it found. The site shows what the manifest lists, so a stale bundle shows stale results.

`build:static` differs from `build` only by `VITE_LANDING=/trials`, which makes the site root open the lab.

## Publish to a Hugging Face static Space

Upload the **contents** of `web/dist/` to the root of the Space, with this `README.md` beside them:

```yaml
---
title: MedBase Virtual Trials
sdk: static
app_file: index.html
---
```

This serves the site at the root of the Space, which is what the default `base` of `/` expects. No build runs on Hugging Face, so nothing about their build environment can change the result.

Their docs also offer `app_build_command` with `app_file: dist/index.html`. It isn't recommended here: the build would need the generated `public/engine/` files in the repo, and I couldn't confirm whether the site would then be served from the root or from `/dist/`. If it is under a sub-path, build with `MEDBASE_BASE=/that/path/`.

## What was done for static hosting

- **`base`:** defaults to `/`. Set `MEDBASE_BASE` for a sub-path. Engine and snapshot URLs are resolved from `import.meta.env.BASE_URL`, never from the domain root. The worker chunk follows it too.
- **Hash routes:** a build with `VITE_LANDING` uses hash routes, so pages live at `/#/trials` and `/#/learn` and a refresh works on any host. A plain `/learn` on that build opens the lab. Share `/#/` links.
- **Real pages too:** a static host may not send unknown paths to the app. Each top-level route is written as a real page (`trials/`, `home/`, `lab/`, `learn/`, `anatomy/`, `evidence/`, `methods/`, `funding/`), and `404.html` is a copy of the app for hosts that honour it.
- **File-name URLs:** `/index.html` and `/trials/index.html` are routes too, because a host may open a page by its file name.
- **Root:** with `VITE_LANDING=/trials` the root opens the lab. The MedBase home page moves to `/home`, and the logo links there.
- **Worker:** built as an ES module (`worker.format: 'es'`), because it imports Pyodide from the CDN at run time.

## Limits to know

- **Deep links:** use hash links such as `/#/learn/tb`, which work on any host.
- **External dependency:** Pyodide and its packages come from `cdn.jsdelivr.net` at run time. If that is blocked, the page falls back to saved files and says why. Check that the Space allows it, by opening the published site and waiting for "Running in your browser" to reach ready.
- **File permissions:** `make_browser_bundle.py` copies results with their original mode, and earlier `results/posterior.json` was `0600`. If you serve `dist/` with a server running as another user, run `chmod -R a+rX dist` first.
- **Caching:** engine files have fixed names, so a browser may keep an old copy until its cache expires. After replacing a posterior, check in a private window.
- **Sealed data:** `make_browser_bundle.py` ships training-trial safety records only, and no held-out outcome. Check this is still true if it changes.

## After publishing, check

1. Open the root URL. It should land on the lab.
2. Open `/#/trials` directly in a new tab. It should load.
3. The badge should read "Running in your browser", and the progress should reach ready.
4. Open Safety and Proof during the download. They should work straight away.
5. Run the first preset. It should show a simulated result, or the plain message that calibration results are missing.
6. Open `/#/learn` and click an organ. The 3D body should load, with its credit visible.

## Testing it here

```bash
cd web
npm run build
MEDLAB_PYODIDE=1 npx playwright test pyodide   # real Pyodide, no API. Needs the network
```

To test routing on a host with no rewrites, build with `MEDBASE_OUT_DIR=<dir> npm run build:static`, serve `<dir>` with any plain file server, and run:

```bash
MEDLAB_STATIC=1 MEDLAB_BASE_URL=http://localhost:<port> npx playwright test static-host
```
