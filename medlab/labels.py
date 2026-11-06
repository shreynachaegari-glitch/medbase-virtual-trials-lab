"""Facts from FDA labels the lab must never lose sight of: warnings, kidney rules and dose limits.

Short summaries with their source. `check` is a phrase from the label text, which a test confirms
against the downloaded label, so a summary cannot drift from its source unnoticed.
"""
from __future__ import annotations

SOURCES = {
    "semaglutide": "FDA label, Ozempic (openFDA set 42bdd912-2393-44c4-b7e0-47672ca28991)",
    "empagliflozin": "FDA label, Jardiance (openFDA set 1782b947-4a72-4feb-a488-1469d9af82bd)",
    "sitagliptin": "FDA label, Januvia (openFDA set 194c3718-5eb5-4cf5-85d0-2bb1ed8293b8)",
    "metformin": "FDA label, metformin (openFDA set 27f603ec-25e6-4270-a7a3-34a64a76f7ef)",
}

WARNINGS = {
    "semaglutide": [
        {"term": "thyroid C-cell tumors", "kind": "boxed warning", "check": "RISK OF THYROID C-CELL TUMORS", "text": "Thyroid C-cell tumors occurred in rodents. It is unknown whether this happens in humans."},
        {"term": "pancreatitis", "kind": "warning", "check": "Acute Pancreatitis", "text": "Acute pancreatitis has been observed with GLP-1 receptor agonists."},
        {"term": "retinopathy", "kind": "warning", "check": "Diabetic Retinopathy Complications", "text": "Diabetic retinopathy complications have been reported."},
        {"term": "hypoglycemia", "kind": "warning", "check": "increase the risk of hypoglycemia", "text": "Risk of low blood sugar rises when used with insulin or an insulin secretagogue."},
    ],
    "empagliflozin": [
        {"term": "ketoacidosis", "kind": "warning", "check": "Ketoacidosis", "text": "Ketoacidosis can occur, regardless of blood glucose level."},
        {"term": "volume depletion", "kind": "warning", "check": "Volume Depletion", "text": "Volume depletion is a risk, notably with impaired kidney function, older age or loop diuretics."},
        {"term": "urinary infection", "kind": "warning", "check": "Urosepsis and Pyelonephritis", "text": "Serious urinary infections, including urosepsis and pyelonephritis, can occur."},
        {"term": "genital infection", "kind": "warning", "check": "Genital Mycotic Infections", "text": "Genital fungal infections can occur."},
        {"term": "hypoglycemia", "kind": "warning", "check": "Hypoglycemia", "text": "Low blood sugar risk rises with insulin or an insulin secretagogue."},
    ],
    "sitagliptin": [
        {"term": "pancreatitis", "kind": "warning", "check": "pancreatitis", "text": "Acute pancreatitis has been reported after marketing, including fatal cases."},
        {"term": "heart failure", "kind": "warning", "check": "Heart failure", "text": "Heart failure has been observed with two other drugs in this class."},
        {"term": "hypersensitivity", "kind": "warning", "check": "Hypersensitivity Reactions", "text": "Serious allergic reactions have been reported, including anaphylaxis."},
        {"term": "hypoglycemia", "kind": "warning", "check": "Increased risk of hypoglycemia", "text": "Low blood sugar risk rises with insulin or an insulin secretagogue."},
    ],
    "metformin": [
        {"term": "lactic acidosis", "kind": "boxed warning", "check": "LACTIC ACIDOSIS", "text": "Lactic acidosis can occur and has caused deaths. Kidney impairment is a risk factor."},
        {"term": "vitamin B12 deficiency", "kind": "warning", "check": "Vitamin B 12 Deficiency", "text": "Metformin may lower vitamin B12 levels."},
        {"term": "hypoglycemia", "kind": "warning", "check": "Increased risk of hypoglycemia", "text": "Low blood sugar risk rises with insulin or an insulin secretagogue."},
    ],
}

# Modelled dose range, kept inside each drug's labelled range for type 2 diabetes.
DOSE_RANGE = {"semaglutide": (0.1, 2.0), "empagliflozin": (1.0, 25.0), "sitagliptin": (12.5, 100.0), "metformin": (250.0, 2550.0)}
REAL_NAMES = ("semaglutide", "ozempic", "wegovy", "rybelsus", "empagliflozin", "jardiance", "sitagliptin", "januvia", "metformin", "glucophage", "placebo", "insulin", "liraglutide", "tirzepatide", "dapagliflozin")

NOT_MODELLED = (
    "Hypoglycaemia is not modelled. Risk rises with sulfonylureas or insulin.",
    "Cardiovascular and kidney outcomes are not simulated.",
    "Serious adverse events are not simulated.",
)


def renal_review(drug: str, mg: float, egfr_low: float, egfr_high: float) -> tuple[str | None, list[str]]:
    """(reason this run is blocked or None, flags to show with the result) for an eGFR range."""
    flags: list[str] = []
    if drug == "metformin":
        if egfr_low < 30:
            return "Metformin is contraindicated below eGFR 30 per its label, so this lab does not simulate it there.", flags
        if egfr_low < 45:
            flags.append("Metformin label: starting is not recommended at eGFR 30 to 45. Lactic acidosis risk is not modelled here.")
    elif drug == "empagliflozin":
        if egfr_low < 30:
            return "Empagliflozin for glycaemic control is not recommended below eGFR 30 per its label, so this lab does not simulate it there.", flags
    elif drug == "sitagliptin" and egfr_low < 45 and mg > 50:
        flags.append("Sitagliptin label: dose is reduced to 50 mg at eGFR 30 to 45, and 25 mg below 30. This run uses a higher dose in part of that range.")
    if egfr_low < 30 and egfr_high >= 15 and not flags:
        flags.append("Few real participants and no validation exist below eGFR 30.")
    return None, flags


def validation_scope(drugs_in_run: list[str], egfr_low: float, has_candidate: bool) -> list[str]:
    """What the held-out test does not cover for this particular run."""
    notes = []
    if has_candidate:
        notes.append("A hypothetical molecule has no real data. Validation does not apply to it, and its result reflects the numbers entered.")
    if egfr_low < 60 and any(d != "empagliflozin" for d in drugs_in_run):
        notes.append("Kidney behaviour was tested only for empagliflozin at eGFR 30 to 90.")
    return notes
