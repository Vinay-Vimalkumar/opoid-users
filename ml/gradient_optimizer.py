"""
Gradient-based intervention optimizer using PyTorch autograd.

Instead of grid search (trying every combination), this uses a differentiable
simulation to compute gradients of deaths with respect to intervention levels,
then follows the gradient to find the optimal allocation under a budget constraint.

Method: Projected gradient descent with augmented Lagrangian.
  1. Forward pass: run differentiable simulation → total deaths
  2. Backward pass: compute ∂deaths/∂interventions via autograd
  3. Update: step interventions in the direction that reduces deaths most
  4. Project: clamp to [0,1] and scale down if over budget
  5. Repeat for 300 steps with multi-restart to avoid local minima

Why this beats grid search:
  - Grid search with 11 levels × 3 interventions = 1,331 evaluations
  - Gradient descent converges in ~100 steps with 5 restarts = 500 evaluations
  - AND it finds solutions between grid points (continuous, not discrete)
"""

import torch
import json
import numpy as np
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent


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
    Fully differentiable compartmental model. All transitions use expected values
    so gradients flow cleanly through the 60-month simulation.
    """
    eff_prescribing = prescribing_rate * (1.0 - 0.6 * prescribing_reduction)
    eff_fatality = fatality_rate * (1.0 - 0.5 * naloxone)
    eff_treatment_entry = treatment_entry_rate * (1.0 + treatment_access)
    eff_treatment_success = torch.clamp(
        torch.tensor(treatment_success_rate) * (1.0 + 0.3 * treatment_access), max=1.0
    )

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


def compute_individual_costs(nal, pres, treat, population, months=60):
    """Return per-intervention costs (for analysis) and total."""
    naloxone_cost = (nal * population / 500) * 75 * months
    prescribing_cost = pres * 10 * 500_000
    treatment_cost = treat * population * 0.001 * (10_000 / 12) * months
    return naloxone_cost, prescribing_cost, treatment_cost


def compute_cost(nal, pres, treat, population, months=60):
    """Total cost (differentiable)."""
    a, b, c = compute_individual_costs(nal, pres, treat, population, months)
    return a + b + c


def project_to_budget(nal, pres, treat, population, budget, months=60):
    """Project intervention levels to satisfy budget constraint while staying in [0,1]."""
    nal_v = torch.clamp(nal, 0, 1).item()
    pres_v = torch.clamp(pres, 0, 1).item()
    treat_v = torch.clamp(treat, 0, 1).item()

    cost = compute_cost(
        torch.tensor(nal_v), torch.tensor(pres_v), torch.tensor(treat_v),
        population, months
    ).item()

    if cost <= budget:
        return nal_v, pres_v, treat_v

    # Scale down proportionally to fit budget
    scale = budget / cost * 0.99  # slight margin
    return nal_v * scale, pres_v * scale, treat_v * scale


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
    n_restarts: int = 5,
    steps_per_restart: int = 300,
    lr: float = 0.005,
):
    """
    Find optimal intervention allocation via multi-restart projected gradient descent.

    Uses multiple random starting points to avoid local minima, then picks the
    best feasible solution.
    """
    # Baseline (no intervention)
    with torch.no_grad():
        baseline_deaths = differentiable_simulation(
            population, prescribing_rate, misuse_rate, oud_rate, overdose_rate,
            torch.tensor(0.0), torch.tensor(0.0), torch.tensor(0.0),
            fatality_rate, treatment_entry_rate, months=months,
        ).item()

    best_overall_deaths = float("inf")
    best_overall_params = (0.0, 0.0, 0.0)
    trajectory = []

    # Different starting points to break symmetry
    start_points = [
        (0.8, 0.1, 0.1),   # naloxone-heavy
        (0.1, 0.8, 0.1),   # prescribing-heavy
        (0.1, 0.1, 0.8),   # treatment-heavy
        (0.5, 0.3, 0.2),   # mixed
        (0.2, 0.2, 0.6),   # treatment-leaning
    ]

    for restart, (init_n, init_p, init_t) in enumerate(start_points):
        nal = torch.tensor(init_n, requires_grad=True)
        pres = torch.tensor(init_p, requires_grad=True)
        treat = torch.tensor(init_t, requires_grad=True)

        opt = torch.optim.Adam([nal, pres, treat], lr=lr)
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=steps_per_restart)

        best_deaths = float("inf")
        best_params = (init_n, init_p, init_t)

        for step in range(steps_per_restart):
            opt.zero_grad()

            nal_c = torch.clamp(nal, 0, 1)
            pres_c = torch.clamp(pres, 0, 1)
            treat_c = torch.clamp(treat, 0, 1)

            deaths = differentiable_simulation(
                population, prescribing_rate, misuse_rate, oud_rate, overdose_rate,
                nal_c, pres_c, treat_c,
                fatality_rate, treatment_entry_rate, months=months,
            )

            cost = compute_cost(nal_c, pres_c, treat_c, population, months)

            # Augmented Lagrangian: deaths + heavy penalty for over-budget
            budget_ratio = cost / budget
            if budget_ratio > 1.0:
                penalty = 1000.0 * (budget_ratio - 1.0) ** 2 * baseline_deaths
            else:
                penalty = torch.tensor(0.0)

            loss = deaths + penalty
            loss.backward()
            opt.step()
            sched.step()

            # Project to feasible region
            with torch.no_grad():
                pn, pp, pt = project_to_budget(nal, pres, treat, population, budget, months)
                nal.data = torch.tensor(pn)
                pres.data = torch.tensor(pp)
                treat.data = torch.tensor(pt)

                # Evaluate projected solution
                proj_deaths = differentiable_simulation(
                    population, prescribing_rate, misuse_rate, oud_rate, overdose_rate,
                    torch.tensor(pn), torch.tensor(pp), torch.tensor(pt),
                    fatality_rate, treatment_entry_rate, months=months,
                ).item()

                if proj_deaths < best_deaths:
                    best_deaths = proj_deaths
                    best_params = (pn, pp, pt)

            if restart == 0 and step % 30 == 0:
                trajectory.append({
                    "step": step, "deaths": round(proj_deaths),
                    "cost": round(cost.item()),
                    "naloxone": round(pn, 3), "prescribing": round(pp, 3),
                    "treatment": round(pt, 3),
                })

        if best_deaths < best_overall_deaths:
            best_overall_deaths = best_deaths
            best_overall_params = best_params

    # Final result
    nal_f, pres_f, treat_f = best_overall_params
    final_cost = compute_cost(
        torch.tensor(nal_f), torch.tensor(pres_f), torch.tensor(treat_f),
        population, months
    ).item()
    lives_saved = baseline_deaths - best_overall_deaths

    # Cost breakdown
    nc, pc, tc = compute_individual_costs(
        torch.tensor(nal_f), torch.tensor(pres_f), torch.tensor(treat_f),
        population, months
    )

    # Sensitivity analysis at optimal point
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
        "naloxone": round(-nal_t.grad.item(), 1),
        "prescribing": round(-pres_t.grad.item(), 1),
        "treatment": round(-treat_t.grad.item(), 1),
    }

    # Cost-effectiveness: lives saved per $1M for each lever
    cost_effectiveness = {}
    for lever, grad, lever_cost in [
        ("naloxone", -nal_t.grad.item(), nc.item()),
        ("prescribing", -pres_t.grad.item(), pc.item()),
        ("treatment", -treat_t.grad.item(), tc.item()),
    ]:
        if lever_cost > 0:
            cost_effectiveness[lever] = round(grad / lever_cost * 1_000_000, 1)
        else:
            cost_effectiveness[lever] = 0

    return {
        "county": county_name,
        "budget": budget,
        "population": population,
        "baseline_deaths": round(baseline_deaths),
        "optimized_deaths": round(best_overall_deaths),
        "lives_saved": round(lives_saved),
        "lives_saved_per_million_dollars": round(lives_saved / max(final_cost, 1) * 1_000_000, 1),
        "optimal_interventions": {
            "naloxone": round(nal_f, 3),
            "prescribing_reduction": round(pres_f, 3),
            "treatment_access": round(treat_f, 3),
        },
        "cost_breakdown": {
            "naloxone": round(nc.item()),
            "prescribing": round(pc.item()),
            "treatment": round(tc.item()),
            "total": round(final_cost),
        },
        "budget_utilization_pct": round(final_cost / budget * 100, 1),
        "sensitivity": sensitivity,
        "cost_effectiveness_lives_per_million": cost_effectiveness,
        "interpretation": {
            "naloxone": f"Each 10% increase saves ~{abs(sensitivity['naloxone'])*0.1:.0f} lives",
            "prescribing": f"Each 10% increase saves ~{abs(sensitivity['prescribing'])*0.1:.0f} lives",
            "treatment": f"Each 10% increase saves ~{abs(sensitivity['treatment'])*0.1:.0f} lives",
        },
        "optimization_trajectory": trajectory,
    }


def run_all_counties():
    """Optimize interventions for all counties and compare."""
    cal_path = PROJECT_DIR / "data" / "processed" / "calibration_results.json"
    if cal_path.exists():
        with open(cal_path) as f:
            cal_data = json.load(f)
        county_params = {c["county"]: c["fitted_params"] for c in cal_data}
        populations = {c["county"]: c["population"] for c in cal_data}
        print("Using CALIBRATED parameters")
    else:
        print("ERROR: No calibrated parameters found. Run simulation/calibrate.py first.")
        return None

    budgets = [500_000, 1_000_000, 2_000_000, 5_000_000]
    all_results = {}

    for budget in budgets:
        print(f"\n{'='*70}")
        print(f"Budget: ${budget:,.0f}")
        print(f"{'='*70}")

        results = []
        for county_name in sorted(county_params.keys()):
            params = county_params[county_name]
            pop = populations[county_name]

            result = optimize_interventions(
                county_name=county_name, budget=budget, population=pop, **params,
            )
            results.append(result)

            opt = result["optimal_interventions"]
            print(f"  {county_name:12s}: {result['lives_saved']:4d} saved | "
                  f"nal={opt['naloxone']:.2f} pres={opt['prescribing_reduction']:.2f} "
                  f"treat={opt['treatment_access']:.2f} | "
                  f"${result['cost_breakdown']['total']:>10,.0f} | "
                  f"{result['lives_saved_per_million_dollars']:.0f} lives/$M")

        all_results[f"budget_{budget}"] = results

        total_saved = sum(r["lives_saved"] for r in results)
        total_cost = sum(r["cost_breakdown"]["total"] for r in results)
        print(f"\n  TOTAL: {total_saved:,} lives saved, ${total_cost:,.0f} cost")

    out_dir = PROJECT_DIR / "data" / "processed"
    with open(out_dir / "gradient_optimization_results.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nSaved to {out_dir / 'gradient_optimization_results.json'}")

    return all_results


if __name__ == "__main__":
    run_all_counties()
