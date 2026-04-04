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
# Parameters are differentiated by county type to reflect real epidemiological patterns:
#   - Rural high-impact counties have higher prescribing/misuse/OUD/overdose rates and lower treatment access
#   - Mid-size counties have moderately elevated rates
#   - Large urban counties have near-default rates but better treatment access
INDIANA_COUNTIES = [
    # --- Large urban counties: near-default rates, better treatment access ---
    CountyParams("Marion", 971102,
                 prescribing_rate=0.005, misuse_rate=0.04, oud_rate=0.08,
                 overdose_rate=0.015, treatment_entry_rate=0.040),
    CountyParams("Lake", 498558,
                 prescribing_rate=0.005, misuse_rate=0.04, oud_rate=0.08,
                 overdose_rate=0.015, treatment_entry_rate=0.038),
    CountyParams("Allen", 388608,
                 prescribing_rate=0.005, misuse_rate=0.04, oud_rate=0.08,
                 overdose_rate=0.015, treatment_entry_rate=0.042),
    CountyParams("St. Joseph", 272212,
                 prescribing_rate=0.005, misuse_rate=0.04, oud_rate=0.08,
                 overdose_rate=0.015, treatment_entry_rate=0.037),
    CountyParams("Vanderburgh", 179987,
                 prescribing_rate=0.005, misuse_rate=0.04, oud_rate=0.08,
                 overdose_rate=0.016, treatment_entry_rate=0.039),
    CountyParams("Tippecanoe", 187076,
                 prescribing_rate=0.005, misuse_rate=0.04, oud_rate=0.08,
                 overdose_rate=0.014, treatment_entry_rate=0.045),

    # --- Mid-size counties: moderately elevated rates ---
    CountyParams("Delaware", 111871,
                 prescribing_rate=0.006, misuse_rate=0.05, oud_rate=0.09,
                 overdose_rate=0.018, treatment_entry_rate=0.030),
    CountyParams("Vigo", 105994,
                 prescribing_rate=0.006, misuse_rate=0.05, oud_rate=0.09,
                 overdose_rate=0.017, treatment_entry_rate=0.032),
    CountyParams("Madison", 130782,
                 prescribing_rate=0.006, misuse_rate=0.05, oud_rate=0.09,
                 overdose_rate=0.018, treatment_entry_rate=0.028),
    CountyParams("Grant", 66263,
                 prescribing_rate=0.007, misuse_rate=0.05, oud_rate=0.09,
                 overdose_rate=0.019, treatment_entry_rate=0.027),
    CountyParams("Lawrence", 45070,
                 prescribing_rate=0.007, misuse_rate=0.05, oud_rate=0.09,
                 overdose_rate=0.018, treatment_entry_rate=0.028),
    CountyParams("Floyd", 80454,
                 prescribing_rate=0.006, misuse_rate=0.05, oud_rate=0.09,
                 overdose_rate=0.017, treatment_entry_rate=0.030),
    CountyParams("Clark", 122738,
                 prescribing_rate=0.006, misuse_rate=0.05, oud_rate=0.09,
                 overdose_rate=0.017, treatment_entry_rate=0.031),

    # --- Rural high-impact counties: highest rates, least treatment access ---
    CountyParams("Scott", 24355,
                 prescribing_rate=0.010, misuse_rate=0.07, oud_rate=0.12,
                 overdose_rate=0.025, treatment_entry_rate=0.015),
    CountyParams("Fayette", 23360,
                 prescribing_rate=0.009, misuse_rate=0.07, oud_rate=0.11,
                 overdose_rate=0.023, treatment_entry_rate=0.018),
    CountyParams("Jay", 20248,
                 prescribing_rate=0.008, misuse_rate=0.06, oud_rate=0.10,
                 overdose_rate=0.020, treatment_entry_rate=0.020),
    CountyParams("Blackford", 12091,
                 prescribing_rate=0.009, misuse_rate=0.06, oud_rate=0.11,
                 overdose_rate=0.022, treatment_entry_rate=0.017),
    CountyParams("Vermillion", 15341,
                 prescribing_rate=0.008, misuse_rate=0.06, oud_rate=0.10,
                 overdose_rate=0.021, treatment_entry_rate=0.019),
    CountyParams("Wayne", 66456,
                 prescribing_rate=0.008, misuse_rate=0.06, oud_rate=0.10,
                 overdose_rate=0.020, treatment_entry_rate=0.022),
    CountyParams("Henry", 48935,
                 prescribing_rate=0.008, misuse_rate=0.06, oud_rate=0.10,
                 overdose_rate=0.019, treatment_entry_rate=0.025),
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
