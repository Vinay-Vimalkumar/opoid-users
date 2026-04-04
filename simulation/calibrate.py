"""
Calibrate compartmental model parameters to match real CDC overdose death data.

Uses scipy.optimize to find transition rates (prescribing, misuse, OUD, overdose,
fatality, treatment_entry) that make the simulation reproduce observed annual
death counts from CDC VSRR and Drug Poisoning Mortality datasets.

Method: minimize squared error between simulated and observed annual deaths
using differential evolution (global optimizer — avoids local minima).

This is what makes the model scientifically credible: parameters are FIT to data,
not assumed.
"""

import csv
import json
import numpy as np
from scipy.optimize import differential_evolution, minimize
from pathlib import Path
from dataclasses import dataclass, asdict
from collections import defaultdict
import time


# ── Load real CDC data ──────────────────────────────────────────────────────────

PROJECT_DIR = Path(__file__).parent.parent

FIPS_TO_COUNTY = {
    "18097": "Marion", "18089": "Lake", "18003": "Allen", "18141": "St. Joseph",
    "18163": "Vanderburgh", "18157": "Tippecanoe", "18035": "Delaware",
    "18177": "Wayne", "18167": "Vigo", "18095": "Madison", "18019": "Clark",
    "18043": "Floyd", "18143": "Scott", "18093": "Lawrence", "18041": "Fayette",
    "18075": "Jay", "18009": "Blackford", "18165": "Vermillion", "18065": "Henry",
    "18053": "Grant",
}


def load_mortality_data():
    """Load CDC model-based death rates (2003-2021) per county per year."""
    filepath = PROJECT_DIR / "data" / "raw" / "cdc_drug_poisoning_mortality.csv"
    data = {}  # county -> [(year, rate_per_100k, population), ...]

    with open(filepath, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            fips = row.get("FIPS", "").strip()
            if fips not in FIPS_TO_COUNTY:
                continue
            county = FIPS_TO_COUNTY[fips]
            year = int(row["Year"])
            rate = float(row["Model-based Death Rate"])
            pop = int(row["Population"].replace(",", ""))
            # Convert rate to estimated annual deaths
            annual_deaths = rate * pop / 100_000

            if county not in data:
                data[county] = []
            data[county].append((year, annual_deaths, pop, rate))

    # Sort by year
    for county in data:
        data[county].sort(key=lambda x: x[0])

    return data


def load_vsrr_data():
    """Load VSRR provisional monthly death counts (2020-2025)."""
    filepath = PROJECT_DIR / "data" / "raw" / "cdc_county_overdose.csv"
    data = defaultdict(lambda: defaultdict(int))  # county -> year -> annual deaths
    months_seen = defaultdict(lambda: defaultdict(set))

    with open(filepath, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            fips = row.get("FIPS", "").strip()
            if fips not in FIPS_TO_COUNTY:
                continue
            county = FIPS_TO_COUNTY[fips]
            try:
                year = int(row["Year"])
                month = int(row["Month"])
            except (ValueError, KeyError):
                continue

            deaths_str = row.get("Provisional Drug Overdose Deaths", "").strip()
            if deaths_str and deaths_str.isdigit():
                data[county][year] += int(deaths_str)
            else:
                data[county][year] += 5  # suppressed = midpoint estimate

            months_seen[county][year].add(month)

    # Only keep years with all 12 months of data
    clean = {}
    for county in data:
        clean[county] = {}
        for year in data[county]:
            if len(months_seen[county][year]) >= 12:
                clean[county][year] = data[county][year]

    return clean


# ── Simulation for calibration ──────────────────────────────────────────────────

def simulate_annual_deaths(
    population: int,
    prescribing_rate: float,
    misuse_rate: float,
    oud_rate: float,
    overdose_rate: float,
    fatality_rate: float,
    treatment_entry_rate: float,
    treatment_success_rate: float = 0.30,
    relapse_rate: float = 0.05,
    recovery_exit_rate: float = 0.02,
    years: int = 19,  # 2003-2021
    seed: int = 42,
):
    """
    Run deterministic simulation (expected values, no stochastic noise)
    and return annual death counts.

    Uses expected values instead of random draws for calibration stability.
    """
    # Initial compartments
    prescribed = population * 0.04
    misuse = population * 0.008
    oud = population * 0.005
    treatment = population * 0.001
    recovered = population * 0.002
    general = population - prescribed - misuse - oud - treatment - recovered

    annual_deaths_list = []

    for year_idx in range(years):
        year_deaths = 0

        for month in range(12):
            # Deterministic transitions (expected values)
            new_prescribed = general * prescribing_rate
            new_misuse = prescribed * misuse_rate
            new_oud = misuse * oud_rate
            new_overdose = oud * overdose_rate
            new_deaths = new_overdose * fatality_rate
            survived = new_overdose - new_deaths
            new_treatment = oud * treatment_entry_rate
            new_recovered = treatment * treatment_success_rate
            new_relapse = recovered * relapse_rate
            new_stable_exit = recovered * recovery_exit_rate

            # Update compartments
            general = max(0, general - new_prescribed + new_stable_exit)
            prescribed = max(0, prescribed + new_prescribed - new_misuse)
            misuse = max(0, misuse + new_misuse - new_oud)
            oud = max(0, oud + new_oud - new_overdose - new_treatment + survived + new_relapse)
            treatment = max(0, treatment + new_treatment - new_recovered)
            recovered = max(0, recovered + new_recovered - new_relapse - new_stable_exit)

            year_deaths += new_deaths

        annual_deaths_list.append(year_deaths)

    return annual_deaths_list


# ── Calibration objective ───────────────────────────────────────────────────────

def calibration_objective(params, observed_deaths, population, years_observed):
    """
    Objective function: sum of squared relative errors between
    simulated and observed annual deaths.

    params = [prescribing_rate, misuse_rate, oud_rate, overdose_rate,
              fatality_rate, treatment_entry_rate]
    """
    prescribing_rate, misuse_rate, oud_rate, overdose_rate, fatality_rate, treatment_entry_rate = params

    simulated = simulate_annual_deaths(
        population=population,
        prescribing_rate=prescribing_rate,
        misuse_rate=misuse_rate,
        oud_rate=oud_rate,
        overdose_rate=overdose_rate,
        fatality_rate=fatality_rate,
        treatment_entry_rate=treatment_entry_rate,
        years=len(observed_deaths),
    )

    # Weighted SSE — weight recent years more heavily (they matter more for prediction)
    total_error = 0
    for i, (sim, obs) in enumerate(zip(simulated, observed_deaths)):
        weight = 1.0 + 0.1 * i  # later years weighted more
        # Relative squared error to handle scale differences across counties
        rel_error = ((sim - obs) / max(obs, 1)) ** 2
        total_error += weight * rel_error

    return total_error


def calibrate_county(county_name, observed_data, population):
    """
    Calibrate model parameters for a single county using differential evolution.

    Returns optimized parameters and fit quality metrics.
    """
    observed_deaths = [d for _, d, _, _ in observed_data]

    # Parameter bounds: [prescribing, misuse, oud, overdose, fatality, treatment_entry]
    bounds = [
        (0.001, 0.020),   # prescribing_rate
        (0.01, 0.15),     # misuse_rate
        (0.02, 0.20),     # oud_rate
        (0.005, 0.050),   # overdose_rate
        (0.05, 0.25),     # fatality_rate
        (0.005, 0.080),   # treatment_entry_rate
    ]

    result = differential_evolution(
        calibration_objective,
        bounds,
        args=(observed_deaths, population, len(observed_deaths)),
        maxiter=500,
        tol=1e-8,
        seed=42,
        polish=True,  # refine with L-BFGS-B after DE
        workers=1,
    )

    # Extract fitted parameters
    fitted = {
        "prescribing_rate": round(result.x[0], 6),
        "misuse_rate": round(result.x[1], 6),
        "oud_rate": round(result.x[2], 6),
        "overdose_rate": round(result.x[3], 6),
        "fatality_rate": round(result.x[4], 6),
        "treatment_entry_rate": round(result.x[5], 6),
    }

    # Compute fit metrics
    simulated = simulate_annual_deaths(
        population=population, **fitted, years=len(observed_deaths)
    )

    # R² score
    obs = np.array(observed_deaths)
    sim = np.array(simulated)
    ss_res = np.sum((obs - sim) ** 2)
    ss_tot = np.sum((obs - np.mean(obs)) ** 2)
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0

    # MAPE
    mape = np.mean(np.abs((obs - sim) / np.maximum(obs, 1))) * 100

    return {
        "county": county_name,
        "population": population,
        "fitted_params": fitted,
        "r_squared": round(r_squared, 4),
        "mape_pct": round(mape, 2),
        "observed_deaths": [round(d, 1) for d in observed_deaths],
        "simulated_deaths": [round(d, 1) for d in simulated],
        "years": [y for y, _, _, _ in observed_data],
        "optimization_success": result.success,
        "objective_value": round(result.fun, 6),
    }


def run_calibration():
    """Calibrate all 20 counties and save results."""
    print("Loading CDC data...")
    mortality_data = load_mortality_data()
    vsrr_data = load_vsrr_data()

    print(f"Mortality data: {len(mortality_data)} counties (2003-2021)")
    print(f"VSRR data: {len(vsrr_data)} counties (2020-2025)")

    results = []
    t0 = time.time()

    for county_name in sorted(FIPS_TO_COUNTY.values()):
        if county_name not in mortality_data:
            print(f"  SKIP: {county_name} — no mortality data")
            continue

        obs = mortality_data[county_name]
        population = obs[-1][2]  # latest population

        print(f"\n  Calibrating {county_name} (pop: {population:,})...", end=" ", flush=True)
        ct = time.time()
        result = calibrate_county(county_name, obs, population)
        elapsed = time.time() - ct
        print(f"R²={result['r_squared']:.3f}, MAPE={result['mape_pct']:.1f}%, {elapsed:.1f}s")

        results.append(result)

    total_time = time.time() - t0
    print(f"\n{'='*60}")
    print(f"Calibration complete: {len(results)} counties in {total_time:.1f}s")

    # Summary stats
    r2_values = [r["r_squared"] for r in results]
    mape_values = [r["mape_pct"] for r in results]
    print(f"R² — mean: {np.mean(r2_values):.3f}, min: {np.min(r2_values):.3f}, max: {np.max(r2_values):.3f}")
    print(f"MAPE — mean: {np.mean(mape_values):.1f}%, max: {np.max(mape_values):.1f}%")

    # Save results
    out_dir = PROJECT_DIR / "data" / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(out_dir / "calibration_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved to {out_dir / 'calibration_results.json'}")

    # Also generate an updated INDIANA_COUNTIES list for model.py
    print("\n# Updated INDIANA_COUNTIES (paste into model.py):")
    for r in results:
        p = r["fitted_params"]
        print(f'    CountyParams("{r["county"]}", {r["population"]}, '
              f'prescribing_rate={p["prescribing_rate"]}, misuse_rate={p["misuse_rate"]}, '
              f'oud_rate={p["oud_rate"]}, overdose_rate={p["overdose_rate"]}, '
              f'fatality_rate={p["fatality_rate"]}, treatment_entry_rate={p["treatment_entry_rate"]}),')

    return results


if __name__ == "__main__":
    run_calibration()
