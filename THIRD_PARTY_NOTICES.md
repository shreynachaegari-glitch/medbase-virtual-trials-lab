# Third-party notices and credits

## Project credit
The web interface in `web/` comes from MedBase by Team Aegis: M Anitha (mentor), N Sreyesh (project lead), P Satwik (UI and UX lead), Sai Vardhan (front end), Sai Venkat (back end). Source: github.com/shreynachaegari-glitch/medbase-motion.

## Data
| Source | Use | Terms |
|---|---|---|
| NHANES 2017-March 2020, US CDC NCHS | Lab values for virtual patients | Public use, de-identified. Analysts must not attempt re-identification. |
| ClinicalTrials.gov API v2, US NLM | Trial results used for calibration and validation; adverse events | Public registry. Sponsors are responsible for the posted results. |
| openFDA drug labels | Pharmacokinetic values | Public. Not for clinical decisions. |
| BioModels BIOMD0000000341 (Topp 2000), BIOMD0000000379 (Dalla Man 2007) | Model cross-check and glucose volume | See each BioModels entry. |
| BodyParts3D anatomy models in `web/public/anatomy` | Existing MedBase anatomy explorer | Carried over from MedBase; see `web/scripts/anatomy/README.md`. |
| Human Reference Atlas 3D reference objects, HuBMAP Consortium, v1.3, in `web/public/hra` | The 3D body on Learn and the simulated organ response on Virtual Trials | CC BY 4.0. Created from National Library of Medicine Visible Human data. Changed by this project: parts joined per organ, simplified, quantized and compressed (`web/scripts/hra/build.mjs`). Source: https://github.com/hubmapconsortium/ccf-releases |
| Allen Human Reference Atlas 3D (`Allen_M_Brain`, distributed in the HRA release), `web/public/hra/brain.glb` | The brain in the 3D body | CC BY 4.0, RRID:SCR_017764. Changed by this project as above. |

## Published methods implemented from the literature
Topp 2000 (glucose, insulin, beta-cell model); Nathan 2008 (ADAG); Overgaard 2019 (semaglutide PK scaling); Ferrannini 2014 and 2015 (SGLT2 response and energy balance); Hundal 2000 (metformin glucose production); Hall 2011 (weight dynamics); Inker 2021 (CKD-EPI); Hainmueller 2012 (entropy balancing); Hempe 2002 (glycation gap).

## Software
numpy, scipy, pandas, scikit-learn, statsmodels (BSD); emcee, FastAPI, pydantic (MIT); httpx (BSD); anthropic SDK (MIT); libRoadRunner for testing (Apache-style; GitHub reports NOASSERTION, so confirm before redistributing). Web dependencies are listed in `web/package.json`.

Other projects were reviewed and not used; the reasons are in `docs/REPO_SURVEY.md`.
