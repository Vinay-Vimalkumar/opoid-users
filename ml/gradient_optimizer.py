"""
Gradient-based intervention optimizer using PyTorch autograd.

Instead of grid search (trying every combination), this uses the differentiable
surrogate model to compute gradients of lives_saved with respect to intervention
levels, then follows the gradient uphill to find the optimal allocation.

This is a REAL use of deep learning for optimization:
  1. Forward pass: predict deaths for current intervention levels
  2. Backward pass: compute ∂deaths/∂interventions
  3. Update: adjust interventions in the direction that reduces deaths most
  4. Project: enforce budget constraint and [0,1] bounds
  5. Repeat until converged

Why this matters: grid search with 11 levels × 3 interventions = 1,331 evaluations.
Gradient descent converges in ~50 steps. And it finds solutions between grid points.
"""

import torch
import torch.nn as nn
import json
import numpy as np
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent


# ── Differentiable simulation (for when surrogate model isn't available) ──────

def differentiable_simulation(
    population: float,
    prescribing_rate: float,
    misuse_rate: float,
    oud_rate: float,
    overdose_rate: float,
    naloxone: torch.Tensor,
    prescribing_reduction: torch.Tensor,
    treatment_access: torch.Tensor,
    fatality_rate: float = 0.12,
    treatment_entry_rate: float = 0.03,
    treatment_success_rate: float = 0.30,
    relapse_rate: float = 0.05,
    recovery_exit_rate: float = 0.02,
    months: int = 60,
):
    """
    Fully differentiable compartmental model using PyTorch tensors.

    All transitions use expected values (no stochastic sampling) so gradients
    flow cleanly through the entire 60-month simulation.

    Returns total_deaths as a differentiable scalar.
    """
    # Apply intervention effects (differentiable)
    eff_prescribing = prescribing_rate * (1.0 - 0.6 * prescribing_reduction)
    eff_fatality = fatality_rate * (1.0 - 0.5 * naloxone)
    eff_treatment_entry = treatment_entry_rate * (1.0 + treatment_access)
    eff_treatment_success = torch.clamp(
        torch.tensor(treatment_success_rate) * (1.0 + 0.3 * treatment_access), max=1.0
    )

    # Initialize compartments as tensors
    prescribed = torch.tensor(population * 0.04)
    misuse = torch.tensor(population * 0.008)
    oud = torch.tensor(population * 0.005)
    treatment = torch.tensor(population * 0.001)
    recovered = torch.tensor(population * 0.002)
    general = torch.tensor(population) - prescribed - misuse - oud - treatment - recovered

    total_deaths = torch.tensor(0.0)

    for month in range(months):
        new_prescribed = general * eff_prescribing
        new_misuse = prescribed * misuse_rate
        new_oud = misuse * oud_rate
        new_overdose = oud * overdose_rate
        new_deaths = new_overdose * eff_fatality
        survived = new_overdose - new_deaths
        new_treatment = oud * eff_treatment_entry
        new_recovered = treatment * eff_treatment_success
        new_relapse = recovered * relapse_rate
        new_stable_exit = recovered * recovery_exit_rate

        general = torch.clamp(general - new_prescribed + new_stable_exit, min=0)
        prescribed = torch.clamp(prescribed + new_prescribed - new_misuse, min=0)
        misuse = torch.clamp(misuse + new_misuse - new_oud, min=0)
        oud = torch.clamp(oud + new_oud - new_overdose - new_treatment + survived + new_relapse, min=0)
        treatment = torch.clamp(treatment + new_treatment - new_recovered, min=0)
        recovered = torch.clamp(recovered + new_recovered - new_relapse - new_stable_exit, min=0)

        total_deaths = total_deaths + new_deaths

    return total_deaths


def compute_cost(naloxone, prescribing, treatment, population, months=60):
    """Differentiable cost function."""
    kits_per_month = (naloxone * population) / 500
    naloxone_cost = kits_per_month * 75 * months
    prescribing_cost = prescribing * 10 * 500_000
    treatment_cost = treatment * population * 0.001 * (10_000 / 12) * months
    return naloxone_cost + prescribing_cost + treatment_cost


def optimize_interventions(
    county_name: str,
    budget: float,
    population: int,
    prescribing_rate: float = 0.005,
    misuse_rate: float = 0.04,
    oud_rate: float = 0.08,
    overdose_rate: float = 0.015,
    fatality_rate: float = 0.12,
    treatment_entry_rate: float = 0.03,
    months: int = 60,
    lr: float = 0.01,
    steps: int = 200,
):
    """
    Find optimal intervention allocation via gradient descent.

    Uses Lagrangian relaxation for the budget constraint:
      minimize  deaths(naloxone, prescribing, treatment)
      subject to  cost(naloxone, prescribing, treatment) ≤ budget
                  0 ≤ naloxone, prescribing, treatment ≤ 1
    """
    # Intervention parameters (requires_grad=True for autograd)
    naloxone = torch.tensor(0.3, requires_grad=True)
    prescribing = torch.tensor(0.3, requires_grad=True)
    treatment_access = torch.tensor(0.3, requires_grad=True)

    # Lagrange multiplier for budget constraint
    lam = torch.tensor(1.0, requires_grad=True)

    optimizer = torch.optim.Adam([naloxone, prescribing, treatment_access], lr=lr)
    lam_optimizer = torch.optim.Adam([lam], lr=lr * 0.1)

    # First compute baseline (no intervention)
    with torch.no_grad():
        baseline_deaths = differentiable_simulation(
            population, prescribing_rate, misuse_rate, oud_rate, overdose_rate,
            torch.tensor(0.0), torch.tensor(0.0), torch.tensor(0.0),
            fatality_rate, treatment_entry_rate, months=months,
        )

    best_deaths = float("inf")
    best_params = None
    trajectory = []

    for step in range(steps):
        optimizer.zero_grad()
        lam_optimizer.zero_grad()

        # Clamp to [0, 1]
        nal_c = torch.clamp(naloxone, 0, 1)
        pres_c = torch.clamp(prescribing, 0, 1)
        treat_c = torch.clamp(treatment_access, 0, 1)

        # Forward: compute deaths
        deaths = differentiable_simulation(
            population, prescribing_rate, misuse_rate, oud_rate, overdose_rate,
            nal_c, pres_c, treat_c,
            fatality_rate, treatment_entry_rate, months=months,
        )

        # Budget constraint
        cost = compute_cost(nal_c, pres_c, treat_c, population, months)
        constraint_violation = (cost - budget) / budget  # normalized

        # Lagrangian: minimize deaths + lambda * max(0, cost - budget)
        penalty = torch.clamp(lam, min=0) * torch.clamp(constraint_violation, min=0)
        lagrangian = deaths + penalty * budget * 0.01

        # Backward
        lagrangian.backward()

        # Update interventions (minimize deaths)
        optimizer.step()

        # Update lambda (maximize penalty for constraint violation)
        # Dual ascent: increase lambda when constraint is violated
        with torch.no_grad():
            if constraint_violation.item() > 0:
                lam.data += 0.1 * constraint_violation.item()
            else:
                lam.data *= 0.95  # relax when feasible

        # Track best feasible solution
        with torch.no_grad():
            current_cost = cost.item()
            current_deaths = deaths.item()
            if current_cost <= budget * 1.01 and current_deaths < best_deaths:
                best_deaths = current_deaths
                best_params = (nal_c.item(), pres_c.item(), treat_c.item())

            if step % 20 == 0:
                trajectory.append({
                    "step": step,
                    "deaths": round(current_deaths),
                    "cost": round(current_cost),
                    "naloxone": round(nal_c.item(), 3),
                    "prescribing": round(pres_c.item(), 3),
                    "treatment": round(treat_c.item(), 3),
                    "feasible": current_cost <= budget,
                })

    if best_params is None:
        # Fallback: use final params even if slightly over budget
        best_params = (
            torch.clamp(naloxone, 0, 1).item(),
            torch.clamp(prescribing, 0, 1).item(),
            torch.clamp(treatment_access, 0, 1).item(),
        )
        best_deaths = deaths.item()

    # Final computation
    nal_f, pres_f, treat_f = best_params
    final_cost = compute_cost(
        torch.tensor(nal_f), torch.tensor(pres_f), torch.tensor(treat_f),
        population, months
    ).item()
    lives_saved = baseline_deaths.item() - best_deaths

    # Sensitivity analysis: compute gradient at optimal point
    nal_t = torch.tensor(nal_f, requires_grad=True)
    pres_t = torch.tensor(pres_f, requires_grad=True)
    treat_t = torch.tensor(treat_f, requires_grad=True)

    deaths_at_opt = differentiable_simulation(
        population, prescribing_rate, misuse_rate, oud_rate, overdose_rate,
        nal_t, pres_t, treat_t,
        fatality_rate, treatment_entry_rate, months=months,
    )
    deaths_at_opt.backward()

    sensitivity = {
        "naloxone": round(-nal_t.grad.item(), 1),  # negative gradient = lives saved per unit increase
        "prescribing": round(-pres_t.grad.item(), 1),
        "treatment": round(-treat_t.grad.item(), 1),
    }

    result = {
        "county": county_name,
        "budget": budget,
        "population": population,
        "baseline_deaths": round(baseline_deaths.item()),
        "optimized_deaths": round(best_deaths),
        "lives_saved": round(lives_saved),
        "lives_saved_per_million_dollars": round(lives_saved / max(final_cost, 1) * 1_000_000, 1),
        "optimal_interventions": {
            "naloxone": round(nal_f, 3),
            "prescribing_reduction": round(pres_f, 3),
            "treatment_access": round(treat_f, 3),
        },
        "estimated_cost": round(final_cost),
        "budget_utilization_pct": round(final_cost / budget * 100, 1),
        "sensitivity_analysis": sensitivity,
        "interpretation": {
            "naloxone": f"Each 10% increase in naloxone saves ~{abs(sensitivity['naloxone'])*0.1:.0f} additional lives",
            "prescribing": f"Each 10% increase in prescribing reduction saves ~{abs(sensitivity['prescribing'])*0.1:.0f} additional lives",
            "treatment": f"Each 10% increase in treatment access saves ~{abs(sensitivity['treatment'])*0.1:.0f} additional lives",
        },
        "optimization_trajectory": trajectory,
    }

    return result


def run_all_counties():
    """Optimize interventions for all counties and compare."""
    # Load calibrated parameters if available
    cal_path = PROJECT_DIR / "data" / "processed" / "calibration_results.json"
    if cal_path.exists():
        with open(cal_path) as f:
            cal_data = json.load(f)
        county_params = {c["county"]: c["fitted_params"] for c in cal_data}
        populations = {c["county"]: c["population"] for c in cal_data}
        print("Using CALIBRATED parameters")
    else:
        # Fallback to defaults
        from simulation.model import INDIANA_COUNTIES
        county_params = {}
        populations = {}
        for c in INDIANA_COUNTIES:
            county_params[c.name] = {
                "prescribing_rate": c.prescribing_rate,
                "misuse_rate": c.misuse_rate,
                "oud_rate": c.oud_rate,
                "overdose_rate": c.overdose_rate,
                "fatality_rate": c.fatality_rate,
                "treatment_entry_rate": c.treatment_entry_rate,
            }
            populations[c.name] = c.population
        print("Using DEFAULT parameters (run calibrate.py first for better results)")

    budgets = [500_000, 1_000_000, 2_000_000, 5_000_000]
    all_results = {}

    for budget in budgets:
        print(f"\n{'='*60}")
        print(f"Budget: ${budget:,.0f}")
        print(f"{'='*60}")

        results = []
        for county_name in sorted(county_params.keys()):
            params = county_params[county_name]
            pop = populations[county_name]

            result = optimize_interventions(
                county_name=county_name,
                budget=budget,
                population=pop,
                **params,
            )
            results.append(result)

            opt = result["optimal_interventions"]
            print(f"  {county_name:12s}: saved {result['lives_saved']:4d} lives | "
                  f"nal={opt['naloxone']:.2f} pres={opt['prescribing_reduction']:.2f} "
                  f"treat={opt['treatment_access']:.2f} | "
                  f"${result['estimated_cost']:>10,.0f} | "
                  f"{result['lives_saved_per_million_dollars']:.0f} lives/$M")

        all_results[f"budget_{budget}"] = results

        # Summary
        total_saved = sum(r["lives_saved"] for r in results)
        total_cost = sum(r["estimated_cost"] for r in results)
        print(f"\n  TOTAL: {total_saved} lives saved across all counties, "
              f"${total_cost:,.0f} total cost")

    # Save
    out_dir = PROJECT_DIR / "data" / "processed"
    with open(out_dir / "gradient_optimization_results.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nSaved to {out_dir / 'gradient_optimization_results.json'}")

    return all_results


if __name__ == "__main__":
    run_all_counties()
