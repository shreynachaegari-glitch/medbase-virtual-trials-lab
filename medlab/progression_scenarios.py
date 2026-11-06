"""Named, auditable experiment templates for the T2D model."""

from __future__ import annotations

from dataclasses import dataclass

from .progression import SimulationConfig


@dataclass(frozen=True)
class Scenario:
    id: str
    title: str
    description: str
    evidence_class: str
    config: SimulationConfig


SCENARIOS: dict[str, Scenario] = {
    "published-figure7-reference": Scenario(
        id="published-figure7-reference",
        title="Published Figure 7 reference trajectory",
        description=(
            "Reproduces the authors' human Figure 7 parameter preset, including the modeled "
            "insulin-sensitivity target transition at day 1100."
        ),
        evidence_class="published_model_reference",
        config=SimulationConfig(),
    ),
    "no-sensitivity-recovery-control": Scenario(
        id="no-sensitivity-recovery-control",
        title="No sensitivity-recovery control",
        description=(
            "Keeps the pre-transition insulin-sensitivity target after day 1100. "
            "This is a computational control, not a clinical untreated arm."
        ),
        evidence_class="exploratory_model_control",
        config=SimulationConfig(target_si_after=0.18),
    ),
    "earlier-sensitivity-transition": Scenario(
        id="earlier-sensitivity-transition",
        title="Earlier sensitivity transition",
        description=(
            "Moves the model's insulin-sensitivity transition to day 730 while keeping "
            "the Figure 7 target values. Timing is an exploratory perturbation."
        ),
        evidence_class="exploratory_model_perturbation",
        config=SimulationConfig(intervention_day=730),
    ),
    "later-sensitivity-transition": Scenario(
        id="later-sensitivity-transition",
        title="Later sensitivity transition",
        description=(
            "Moves the model's insulin-sensitivity transition to day 1460 while keeping "
            "the Figure 7 target values. Timing is an exploratory perturbation."
        ),
        evidence_class="exploratory_model_perturbation",
        config=SimulationConfig(intervention_day=1460),
    ),
}


def get_scenario(scenario_id: str) -> Scenario:
    try:
        return SCENARIOS[scenario_id]
    except KeyError as exc:
        raise ValueError(f"Unknown scenario: {scenario_id}") from exc
