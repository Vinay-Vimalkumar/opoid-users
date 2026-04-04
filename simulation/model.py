"""
Stochastic compartmental model for opioid dynamics.

Compartments per county per time step (1 month):
  General Pop → Prescribed → Misuse → OUD → Overdose → Death or Survived
                                        ↓
                                    Treatment → Recovered → (relapse back to OUD)

Three intervention levers (each 0.0–1.0):
  - naloxone_access: reduces overdose fatality rate by up to 50%
  - prescribing_reduction: reduces new prescriptions by up to 60%
  - treatment_access: doubles treatment entry rate, +30% treatment success
"""

import numpy as np
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class CountyParams:
    name: str
    population: int
    # Base rates (monthly)
    prescribing_rate: float = 0.005       # fraction of gen pop getting new prescriptions
    misuse_rate: float = 0.04             # fraction of prescribed who misuse
    oud_rate: float = 0.08                # fraction of misusers developing OUD
    overdose_rate: float = 0.015          # fraction of OUD who overdose per month
    fatality_rate: float = 0.12           # fraction of overdoses that are fatal
    treatment_entry_rate: float = 0.03    # fraction of OUD entering treatment
    treatment_success_rate: float = 0.30  # fraction completing treatment
    relapse_rate: float = 0.05            # fraction of recovered relapsing per month
    recovery_exit_rate: float = 0.02      # fraction of recovered leaving the system (stable)


@dataclass
class Interventions:
    naloxone_access: float = 0.0          # 0-1, how much naloxone is deployed
    prescribing_reduction: float = 0.0    # 0-1, how much prescribing is reduced
    treatment_access: float = 0.0         # 0-1, how much treatment is expanded


@dataclass
class SimResult:
    county: str
    interventions: dict
    seed: int
    months: int
    timeline: dict  # month -> compartment snapshot
    total_deaths: int
    total_overdoses: int
    total_treated: int
    lives_saved: int  # vs baseline (must compute baseline separately)
    cost: float


def compute_cost(interventions: Interventions, population: int, months: int) -> float:
    """Compute total cost of interventions over the simulation period."""
    monthly_cost = 0.0
    # Naloxone: $75/kit, assume 1 kit per 500 people per month at full deployment
    kits_per_month = (interventions.naloxone_access * population) / 500
    monthly_cost += kits_per_month * 75
    # Prescribing reduction: $500K per 10% reduction (one-time, amortized)
    monthly_cost += (interventions.prescribing_reduction * 10) * 500_000 / months
    # Treatment: $10K/slot/year, slots = treatment_access * population * 0.001
    slots = interventions.treatment_access * population * 0.001
    monthly_cost += slots * 10_000 / 12
    return monthly_cost * months


def run_scenario(
    county: CountyParams,
    interventions: Interventions,
    months: int = 60,
    seed: int = 42,
) -> SimResult:
    """Run a single stochastic simulation scenario."""
    rng = np.random.default_rng(seed)

    # Initial compartments (estimated from population)
    prescribed = int(county.population * 0.04)
    misuse = int(county.population * 0.008)
    oud = int(county.population * 0.005)
    treatment = int(county.population * 0.001)
    recovered = int(county.population * 0.002)
    general = county.population - prescribed - misuse - oud - treatment - recovered

    # Apply intervention effects to rates
    eff_prescribing_rate = county.prescribing_rate * (1 - 0.6 * interventions.prescribing_reduction)
    eff_fatality_rate = county.fatality_rate * (1 - 0.5 * interventions.naloxone_access)
    eff_treatment_entry = county.treatment_entry_rate * (1 + interventions.treatment_access)
    eff_treatment_success = min(1.0, county.treatment_success_rate * (1 + 0.3 * interventions.treatment_access))

    total_deaths = 0
    total_overdoses = 0
    total_treated = 0
    timeline = {}

    for month in range(months):
        # Stochastic transitions (binomial draws)
        new_prescribed = rng.binomial(max(general, 0), min(eff_prescribing_rate, 1.0))
        new_misuse = rng.binomial(max(prescribed, 0), min(county.misuse_rate, 1.0))
        new_oud = rng.binomial(max(misuse, 0), min(county.oud_rate, 1.0))
        new_overdose = rng.binomial(max(oud, 0), min(county.overdose_rate, 1.0))
        new_deaths = rng.binomial(max(new_overdose, 0), min(eff_fatality_rate, 1.0))
        survived = new_overdose - new_deaths
        new_treatment = rng.binomial(max(oud, 0), min(eff_treatment_entry, 1.0))
        new_recovered = rng.binomial(max(treatment, 0), min(eff_treatment_success, 1.0))
        new_relapse = rng.binomial(max(recovered, 0), min(county.relapse_rate, 1.0))
        new_stable_exit = rng.binomial(max(recovered, 0), min(county.recovery_exit_rate, 1.0))

        # Update compartments
        general = general - new_prescribed + new_stable_exit
        prescribed = prescribed + new_prescribed - new_misuse
        misuse = misuse + new_misuse - new_oud
        oud = oud + new_oud - new_overdose - new_treatment + survived + new_relapse
        treatment = treatment + new_treatment - new_recovered
        recovered = recovered + new_recovered - new_relapse - new_stable_exit

        # Clamp to non-negative
        general = max(general, 0)
        prescribed = max(prescribed, 0)
        misuse = max(misuse, 0)
        oud = max(oud, 0)
        treatment = max(treatment, 0)
        recovered = max(recovered, 0)

        total_deaths += new_deaths
        total_overdoses += new_overdose
        total_treated += new_treatment

        timeline[month] = {
            "general": general,
            "prescribed": prescribed,
            "misuse": misuse,
            "oud": oud,
            "treatment": treatment,
            "recovered": recovered,
            "deaths_this_month": int(new_deaths),
            "overdoses_this_month": int(new_overdose),
            "cumulative_deaths": total_deaths,
        }

    cost = compute_cost(interventions, county.population, months)

    return SimResult(
        county=county.name,
        interventions=asdict(interventions),
        seed=seed,
        months=months,
        timeline=timeline,
        total_deaths=int(total_deaths),
        total_overdoses=int(total_overdoses),
        total_treated=int(total_treated),
        lives_saved=0,  # computed after comparing to baseline
        cost=round(cost, 2),
    )


# County data: top 20 Indiana counties by overdose impact
INDIANA_COUNTIES = [
    CountyParams("Marion", 977203),
    CountyParams("Lake", 498700),
    CountyParams("Allen", 379299),
    CountyParams("St. Joseph", 271826),
    CountyParams("Vanderburgh", 181451),
    CountyParams("Tippecanoe", 193391),
    CountyParams("Delaware", 114135),
    CountyParams("Wayne", 65884),
    CountyParams("Vigo", 107848),
    CountyParams("Madison", 128500),
    CountyParams("Clark", 119256),
    CountyParams("Floyd", 78522),
    CountyParams("Scott", 24181),
    CountyParams("Lawrence", 45370),
    CountyParams("Fayette", 23102),
    CountyParams("Jay", 20436),
    CountyParams("Blackford", 11758),
    CountyParams("Vermillion", 15498),
    CountyParams("Henry", 47972),
    CountyParams("Grant", 65769),
]

COUNTY_MAP = {c.name: c for c in INDIANA_COUNTIES}


def run_baseline(county: CountyParams, months: int = 60, seed: int = 42) -> SimResult:
    """Run baseline scenario with no interventions."""
    return run_scenario(county, Interventions(), months=months, seed=seed)


if __name__ == "__main__":
    # Quick test
    marion = COUNTY_MAP["Marion"]
    baseline = run_baseline(marion)
    print(f"Marion County baseline: {baseline.total_deaths} deaths over {baseline.months} months")

    result = run_scenario(marion, Interventions(0.8, 0.5, 0.7))
    print(f"Marion County with interventions: {result.total_deaths} deaths")
    print(f"Intervention cost: ${result.cost:,.0f}")
