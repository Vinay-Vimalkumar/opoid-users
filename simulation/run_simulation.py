"""
Run all simulation scenarios locally and write simulation_results.json.
20 counties x 125 intervention combos x 5 seeds = 12,500 scenarios.
"""

import json
import itertools
import time
from pathlib import Path

from model import INDIANA_COUNTIES, Interventions, run_scenario, run_baseline

LEVELS = [0.0, 0.25, 0.5, 0.75, 1.0]
SEEDS = [42, 123, 456, 789, 1024]
MONTHS = 60
OUT_PATH = Path(__file__).parent.parent / "data" / "processed" / "simulation_results.json"


def main():
    all_results = []
    total_start = time.time()

    for county in INDIANA_COUNTIES:
        print(f"  {county.name} ...", end=" ", flush=True)
        t0 = time.time()

        baselines = {seed: run_baseline(county, months=MONTHS, seed=seed).total_deaths for seed in SEEDS}

        for naloxone, prescribing, treatment in itertools.product(LEVELS, repeat=3):
            for seed in SEEDS:
                result = run_scenario(
                    county,
                    Interventions(naloxone, prescribing, treatment),
                    months=MONTHS,
                    seed=seed,
                )
                all_results.append({
                    "county": result.county,
                    "naloxone": naloxone,
                    "prescribing": prescribing,
                    "treatment": treatment,
                    "seed": seed,
                    "total_deaths": result.total_deaths,
                    "total_overdoses": result.total_overdoses,
                    "total_treated": result.total_treated,
                    "lives_saved": max(0, baselines[seed] - result.total_deaths),
                    "cost": result.cost,
                })

        print(f"{time.time() - t0:.1f}s")

    with open(OUT_PATH, "w") as f:
        json.dump(all_results, f)

    print(f"\nDone: {len(all_results)} scenarios in {time.time() - total_start:.1f}s")
    print(f"Saved to {OUT_PATH}")


if __name__ == "__main__":
    main()
