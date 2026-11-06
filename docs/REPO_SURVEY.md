# Repo Survey (C)

Checked 2026-11-05 through the GitHub and GitLab APIs. "All public repos" cannot literally be used, and most medical repos are not simulators. Each entry below was either used for a stated job or rejected for a stated reason. Sreyesh's pasted master list is covered at the end.

## Used
| Project | Licence | Job |
|---|---|---|
| sys-bio/roadrunner (libRoadRunner) | Apache-style (GitHub reports NOASSERTION; confirm before redistributing) | independent solver for check V1 |
| BioModels BIOMD0000000341 (Topp 2000) | public model file | reference for V1 |
| dfm/emcee | MIT | MCMC calibration |
| statsmodels | BSD-3 | ANCOVA |
| scikit-learn, scipy, numpy, pandas | BSD | responders, numerics, data |
| FastAPI, httpx | MIT / BSD | API, source clients |
| shreynachaegari-glitch/medbase-motion | own | UI shell, provenance pattern |
| Own ResearchPulse | own | number-guard pattern |

## Data sources (no code reuse)
ClinicalTrials.gov API v2, NHANES 2017-March 2020, PubMed E-utilities, ChEMBL.

## Rejected for v1
| Project | Licence | Why not |
|---|---|---|
| jxx123/simglucose | MIT | type 1 only |
| AAU T2D simulator (GitLab) | no licence file found | MATLAB, no licence, so not reusable; last active 2024 |
| OSP Suite, Metformin-Model, Dapagliflozin model | GPLv2 | needs PK-Sim and .NET (not installed); useful as a published reference, not as a runtime dependency |
| OSP SGLT2i-hyperfiltration-model | GPLv2 | not checked further for v1; kidney haemodynamics, not glycaemia. Last pushed 2020 |
| sbi-dev/sbi | Apache-2.0 | likelihood is tractable, so emcee is simpler |
| PINTS, nlmixr2, mrgsolve | various, GPL for the R tools | no R here; emcee covers the need |
| EconML | NOASSERTION reported | a plain T-learner is enough for simulated data with known randomisation |
| NVIDIA-BioNeMo/nvQSP | other | needs a GPU |
| HanwenWang95/Wang_et_al_2020, Pfizer vpop repos | mixed | other diseases; useful as method references |

| NVIDIA Auto Ontology | Apache-2.0 per secondary coverage | Considered at Sreyesh's "if needed": a semantic layer so agents write correct SQL over enterprise warehouses. The lab has no warehouse and the assistant calls typed tools, never SQL. NVIDIA skills catalog grep for "ontology" recorded in the status log |

## Sreyesh's pasted list
| Group | Verdict |
|---|---|
| Synthea (Apache-2.0) | Rejected as patient source: its diabetes module is a rule-based state machine with no glucose or PK physiology. NHANES gives real joint distributions. Candidate later for FHIR-shaped demo records |
| OpenAPS oref0 (MIT) | Rejected: insulin-pump dosing logic for type 1 |
| PyHealth (MIT) | Rejected for v1: needs credentialed EHR data such as MIMIC |
| HAPI FHIR, Medplum (Apache-2.0) | Deferred: useful only if results must flow into an EHR |
| PubMed, ClinicalTrials.gov | Used |
| Cochrane, Embase, UpToDate, DynaMed, Medscape, Epocrates | Not used: subscription or no open API. Cochrane reviews can be cited by hand |
| OpenEMR, OpenMRS, Bahmni, GNU Health, GNUmed, HospitalRun, Fasten, Open Dental, OpenELIS, SENAITE | Not relevant: record and lab management, no simulation |
| MONAI, 3D Slicer, Orthanc, OHIF, ITK-SNAP, pydicom, DCMTK, Radiopaedia, DermNet | Not relevant: imaging. T2D trial endpoints here are lab values |
| CareKit, ResearchKit, CHT, cTAKES | Not relevant to simulation |
| awesome-* lists | Used as leads only (this is how AAU T2D was found) |
| Open Medical Skills marketplace | Not installed: unreviewed third-party agent skills in a medical context |
| Reddit communities | Not a data source; r/clinicalresearch could review the output later |
