"""
Run all scenarios for a single county (used by SLURM array jobs).
Each county runs 1331 combos × 10 seeds = 13,310 scenarios.
Total across 20 counties: 266,200 scenarios.
"""

import argparse
import json
import itertools
import time
from pathlib import Path
from model import INDIANA_COUNTIES, Interventions, run_scenario, run_baseline

# 11 levels: 0.0, 0.1, 0.2, ..., 1.0
LEVELS = [round(x * 0.1, 1) for x in range(11)]
SEEDS = [42, 123, 456, 789, 1024, 2048, 4096, 8192, 16384, 32768]
MONTHS = 60


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--county-index', type=int, required=True)
    parser.add_argument('--output', type=str, required=True)
    args = parser.parse_args()

    county = INDIANA_COUNTIES[args.county_index]
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Running scenarios for {county.name} (pop: {county.population})")
    start = time.time()

    # Baselines
    baselines = {}
    for seed in SEEDS:
        bl = run_baseline(county, months=MONTHS, seed=seed)
        baselines[seed] = bl.total_deaths

    results = []
    for naloxone, prescribing, treatment in itertools.product(LEVELS, repeat=3):
        for seed in SEEDS:
            interventions = Interventions(naloxone, prescribing, treatment)
            result = run_scenario(county, interventions, months=MONTHS, seed=seed)
            result.lives_saved = max(0, baselines[seed] - result.total_deaths)
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

    elapsed = time.time() - start
    out_file = output_dir / f"{county.name.replace(' ', '_').lower()}.json"
    with open(out_file, 'w') as f:
        json.dump(results, f)
    print(f"Done: {len(results)} scenarios in {elapsed:.1f}s → {out_file}")


if __name__ == '__main__':
    main()
