"""
Generate all simulation scenarios and run them.
20 counties × 5 levels per lever × 5 seeds = 12,500 scenarios.
Results saved to data/processed/simulation_results.json
"""

import json
import itertools
import time
from pathlib import Path
from model import INDIANA_COUNTIES, Interventions, run_scenario, run_baseline

LEVELS = [0.0, 0.25, 0.5, 0.75, 1.0]
SEEDS = [42, 123, 456, 789, 1024]
MONTHS = 60
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "processed" / "simulation_results.json"


def generate_all():
    print(f"Generating scenarios: {len(INDIANA_COUNTIES)} counties × {len(LEVELS)}^3 combos × {len(SEEDS)} seeds")
    total = len(INDIANA_COUNTIES) * len(LEVELS) ** 3 * len(SEEDS)
    print(f"Total scenarios: {total}")

    # First compute baselines per county per seed
    baselines = {}
    for county in INDIANA_COUNTIES:
        for seed in SEEDS:
            bl = run_baseline(county, months=MONTHS, seed=seed)
            baselines[(county.name, seed)] = bl.total_deaths

    results = []
    start = time.time()
    count = 0

    for county in INDIANA_COUNTIES:
        for naloxone, prescribing, treatment in itertools.product(LEVELS, repeat=3):
            for seed in SEEDS:
                interventions = Interventions(naloxone, prescribing, treatment)
                result = run_scenario(county, interventions, months=MONTHS, seed=seed)
                baseline_deaths = baselines[(county.name, seed)]
                result.lives_saved = max(0, baseline_deaths - result.total_deaths)

                # Store compact result (no full timeline for disk space)
                results.append({
                    "county": result.county,
                    "naloxone": naloxone,
                    "prescribing": prescribing,
                    "treatment": treatment,
                    "seed": seed,
                    "total_deaths": result.total_deaths,
                    "total_overdoses": result.total_overdoses,
                    "total_treated": result.total_treated,
                    "lives_saved": result.lives_saved,
                    "cost": result.cost,
                })
                count += 1

                if count % 2500 == 0:
                    elapsed = time.time() - start
                    print(f"  {count}/{total} scenarios ({elapsed:.1f}s)")

    elapsed = time.time() - start
    print(f"Done! {count} scenarios in {elapsed:.1f}s")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f)
    print(f"Saved to {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    generate_all()
