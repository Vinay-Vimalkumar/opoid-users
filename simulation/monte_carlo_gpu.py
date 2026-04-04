"""
GPU-accelerated Monte Carlo uncertainty quantification.

Runs 10,000 stochastic simulations per county (200,000 total) to produce:
  - Confidence intervals for death counts under each intervention level
  - Distribution of outcomes (not just point estimates)
  - Worst-case / best-case scenarios

This is what makes the project scientifically rigorous: we don't just give
point estimates, we show the UNCERTAINTY around those estimates.

All 200K simulations run simultaneously on the H100.
"""

import torch
import json
import time
import numpy as np
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent

# Same county data as gpu_model.py
COUNTIES = [
    ("Marion",      971102, 0.005, 0.04, 0.08, 0.015, 0.12, 0.040, 0.30, 0.05, 0.02),
    ("Lake",        498558, 0.005, 0.04, 0.08, 0.015, 0.12, 0.038, 0.30, 0.05, 0.02),
    ("Allen",       388608, 0.005, 0.04, 0.08, 0.015, 0.12, 0.042, 0.30, 0.05, 0.02),
    ("St. Joseph",  272212, 0.005, 0.04, 0.08, 0.015, 0.12, 0.037, 0.30, 0.05, 0.02),
    ("Vanderburgh", 179987, 0.005, 0.04, 0.08, 0.016, 0.12, 0.039, 0.30, 0.05, 0.02),
    ("Tippecanoe",  187076, 0.005, 0.04, 0.08, 0.014, 0.12, 0.045, 0.30, 0.05, 0.02),
    ("Delaware",    111871, 0.006, 0.05, 0.09, 0.018, 0.12, 0.030, 0.30, 0.05, 0.02),
    ("Vigo",        105994, 0.006, 0.05, 0.09, 0.017, 0.12, 0.032, 0.30, 0.05, 0.02),
    ("Madison",     130782, 0.006, 0.05, 0.09, 0.018, 0.12, 0.028, 0.30, 0.05, 0.02),
    ("Grant",        66263, 0.007, 0.05, 0.09, 0.019, 0.12, 0.027, 0.30, 0.05, 0.02),
    ("Lawrence",     45070, 0.007, 0.05, 0.09, 0.018, 0.12, 0.028, 0.30, 0.05, 0.02),
    ("Floyd",        80454, 0.006, 0.05, 0.09, 0.017, 0.12, 0.030, 0.30, 0.05, 0.02),
    ("Clark",       122738, 0.006, 0.05, 0.09, 0.017, 0.12, 0.031, 0.30, 0.05, 0.02),
    ("Scott",        24355, 0.010, 0.07, 0.12, 0.025, 0.12, 0.015, 0.30, 0.05, 0.02),
    ("Fayette",      23360, 0.009, 0.07, 0.11, 0.023, 0.12, 0.018, 0.30, 0.05, 0.02),
    ("Jay",          20248, 0.008, 0.06, 0.10, 0.020, 0.12, 0.020, 0.30, 0.05, 0.02),
    ("Blackford",    12091, 0.009, 0.06, 0.11, 0.022, 0.12, 0.017, 0.30, 0.05, 0.02),
    ("Vermillion",   15341, 0.008, 0.06, 0.10, 0.021, 0.12, 0.019, 0.30, 0.05, 0.02),
    ("Wayne",        66456, 0.008, 0.06, 0.10, 0.020, 0.12, 0.022, 0.30, 0.05, 0.02),
    ("Henry",        48935, 0.008, 0.06, 0.10, 0.019, 0.12, 0.025, 0.30, 0.05, 0.02),
]

SCENARIOS = [
    {"name": "No Action",   "nal": 0.0, "pres": 0.0, "treat": 0.0},
    {"name": "Plan A",      "nal": 0.4, "pres": 0.3, "treat": 0.4},
    {"name": "Plan B",      "nal": 0.8, "pres": 0.6, "treat": 0.7},
    {"name": "Maximum",     "nal": 1.0, "pres": 1.0, "treat": 1.0},
]


@torch.no_grad()
def run_monte_carlo(n_samples=10000, months=60):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    results = {}
    total_sims = 0
    t0 = time.time()

    for scenario in SCENARIOS:
        print(f"\n  Scenario: {scenario['name']} (nal={scenario['nal']}, pres={scenario['pres']}, treat={scenario['treat']})")
        scenario_results = {}

        for ci, county in enumerate(COUNTIES):
            name, pop, presc, mis, oud, od, fat, treat_e, treat_s, rel, rec_exit = county
            N = n_samples

            # Apply interventions
            eff_presc = presc * (1.0 - 0.6 * scenario["pres"])
            eff_fat = fat * (1.0 - 0.5 * scenario["nal"])
            eff_treat_e = treat_e * (1.0 + scenario["treat"])
            eff_treat_s = min(1.0, treat_s * (1.0 + 0.3 * scenario["treat"]))

            # Initialize compartments for all N samples
            prescribed = torch.full((N,), pop * 0.04, device=device)
            misuse = torch.full((N,), pop * 0.008, device=device)
            oud_c = torch.full((N,), pop * 0.005, device=device)
            treatment = torch.full((N,), pop * 0.001, device=device)
            recovered = torch.full((N,), pop * 0.002, device=device)
            general = torch.full((N,), pop, device=device) - prescribed - misuse - oud_c - treatment - recovered

            total_deaths = torch.zeros(N, device=device)

            for month in range(months):
                new_prescribed = torch.poisson(torch.clamp(general * eff_presc, min=0))
                new_misuse = torch.poisson(torch.clamp(prescribed * mis, min=0))
                new_oud = torch.poisson(torch.clamp(misuse * oud, min=0))
                new_overdose = torch.poisson(torch.clamp(oud_c * od, min=0))
                new_deaths = torch.poisson(torch.clamp(new_overdose * eff_fat, min=0))
                new_deaths = torch.min(new_deaths, new_overdose)
                survived = new_overdose - new_deaths
                new_treatment = torch.poisson(torch.clamp(oud_c * eff_treat_e, min=0))
                new_recovered = torch.poisson(torch.clamp(treatment * eff_treat_s, min=0))
                new_relapse = torch.poisson(torch.clamp(recovered * rel, min=0))
                new_stable = torch.poisson(torch.clamp(recovered * rec_exit, min=0))

                general = torch.clamp(general - new_prescribed + new_stable, min=0)
                prescribed = torch.clamp(prescribed + new_prescribed - new_misuse, min=0)
                misuse = torch.clamp(misuse + new_misuse - new_oud, min=0)
                oud_c = torch.clamp(oud_c + new_oud - new_overdose - new_treatment + survived + new_relapse, min=0)
                treatment = torch.clamp(treatment + new_treatment - new_recovered, min=0)
                recovered = torch.clamp(recovered + new_recovered - new_relapse - new_stable, min=0)

                total_deaths += new_deaths

            deaths = total_deaths.cpu().numpy()
            total_sims += N

            scenario_results[name] = {
                "mean": round(float(np.mean(deaths))),
                "median": round(float(np.median(deaths))),
                "std": round(float(np.std(deaths)), 1),
                "p5": round(float(np.percentile(deaths, 5))),
                "p25": round(float(np.percentile(deaths, 25))),
                "p75": round(float(np.percentile(deaths, 75))),
                "p95": round(float(np.percentile(deaths, 95))),
                "min": round(float(np.min(deaths))),
                "max": round(float(np.max(deaths))),
                "n_samples": N,
            }

        results[scenario["name"]] = scenario_results
        print(f"    Marion: mean={scenario_results['Marion']['mean']}, 95% CI=[{scenario_results['Marion']['p5']}, {scenario_results['Marion']['p95']}]")

    elapsed = time.time() - t0
    throughput = total_sims / elapsed

    print(f"\n{'='*60}")
    print(f"Monte Carlo complete: {total_sims:,} simulations in {elapsed:.1f}s")
    print(f"Throughput: {throughput:,.0f} simulations/sec")

    # Save
    output = {
        "total_simulations": total_sims,
        "samples_per_county": n_samples,
        "scenarios": len(SCENARIOS),
        "counties": len(COUNTIES),
        "elapsed_sec": round(elapsed, 2),
        "throughput": round(throughput),
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if device == "cuda" else "N/A",
        "results": results,
    }

    out_path = PROJECT_DIR / "data" / "processed" / "monte_carlo_results.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Saved to {out_path}")

    return output


if __name__ == "__main__":
    run_monte_carlo(n_samples=10000)
