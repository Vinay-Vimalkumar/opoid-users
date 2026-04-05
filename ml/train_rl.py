"""
Train a PPO agent on the OpioidPolicyEnv and generate comparison results.

Usage:
    python ml/train_rl.py

Outputs:
    ml/rl_agent.zip                         — trained PPO agent
    data/processed/rl_results.json          — pre-computed RL vs greedy comparison
                                              for all 20 counties at $2M budget
"""

import sys
import json
import itertools
from pathlib import Path

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.callbacks import EvalCallback

sys.path.insert(0, str(Path(__file__).parent.parent / "simulation"))
sys.path.insert(0, str(Path(__file__).parent))

from model import INDIANA_COUNTIES, COUNTY_MAP, Interventions, compute_cost
from rl_env import OpioidPolicyEnv
from optimize import find_optimal

AGENT_PATH   = Path(__file__).parent / "rl_agent"
RESULTS_PATH = Path(__file__).parent.parent / "data" / "processed" / "rl_results.json"
BUDGET       = 2_000_000


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(timesteps: int = 300_000) -> PPO:
    print(f"\n{'='*60}")
    print("Training RL Policy Agent (PPO)")
    print(f"Environment: OpioidPolicyEnv — 20 Indiana counties")
    print(f"Budget range: $500K – $5M (randomized per episode)")
    print(f"Timesteps: {timesteps:,}")
    print(f"{'='*60}\n")

    train_env = make_vec_env(
        lambda: OpioidPolicyEnv(county_name=None, total_budget=BUDGET, randomize_budget=True),
        n_envs=8,
    )
    eval_env = make_vec_env(
        lambda: OpioidPolicyEnv(county_name=None, total_budget=BUDGET, randomize_budget=False),
        n_envs=4,
    )

    model = PPO(
        "MlpPolicy",
        train_env,
        learning_rate=3e-4,
        n_steps=256,          # short episodes (5 steps each) → small n_steps fine
        batch_size=64,
        n_epochs=10,
        gamma=0.95,           # discount: future lives matter, but near-term more
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.01,        # mild exploration bonus
        policy_kwargs=dict(net_arch=[128, 128, 64]),
        verbose=1,
    )

    eval_cb = EvalCallback(
        eval_env,
        best_model_save_path=str(AGENT_PATH.parent),
        log_path=str(AGENT_PATH.parent / "rl_logs"),
        eval_freq=10_000,
        n_eval_episodes=40,
        deterministic=True,
        render=False,
        verbose=0,
    )

    model.learn(total_timesteps=timesteps, callback=eval_cb, progress_bar=True)

    # Save final model (use best_model if it exists)
    best = AGENT_PATH.parent / "best_model.zip"
    if best.exists():
        print(f"\nUsing best model from eval: {best}")
        model = PPO.load(str(best))
    else:
        model.save(str(AGENT_PATH))
        print(f"\nSaved agent to {AGENT_PATH}.zip")

    return model


# ---------------------------------------------------------------------------
# Greedy baseline (from existing optimizer)
# ---------------------------------------------------------------------------

def run_greedy(county_name: str, budget: float = BUDGET) -> dict:
    """Run the existing one-shot XGBoost optimizer for comparison."""
    result = find_optimal(county_name, budget, months=60)
    ivx = result.get("optimal_interventions") or {"naloxone": 0.5, "prescribing": 0.3, "treatment": 0.5}

    # Simulate the greedy policy uniformly over 5 years
    from model import run_scenario, run_baseline, COUNTY_MAP
    county = COUNTY_MAP[county_name]
    interventions = Interventions(
        ivx.get("naloxone", 0.5),
        ivx.get("prescribing", 0.3),
        ivx.get("treatment", 0.5),
    )
    bl = run_baseline(county, months=60, seed=42)
    sim = run_scenario(county, interventions, months=60, seed=42)
    total_lives_saved = max(0, bl.total_deaths - sim.total_deaths)

    # Split evenly by year for the chart
    yearly = []
    for y in range(5):
        start = y * 12
        end   = start + 11
        bl_d   = (bl.timeline[end]["cumulative_deaths"]
                  - bl.timeline[start]["cumulative_deaths"])
        sim_d  = (sim.timeline[end]["cumulative_deaths"]
                  - sim.timeline[start]["cumulative_deaths"])
        yearly.append({
            "year":                  y + 1,
            "naloxone":              round(ivx.get("naloxone", 0.5), 2),
            "prescribing":           round(ivx.get("prescribing", 0.3), 2),
            "treatment":             round(ivx.get("treatment", 0.5), 2),
            "budget_spent":          round(result.get("estimated_cost", budget) / 5),
            "deaths_this_year":      int(sim_d),
            "lives_saved_this_year": round(max(0, bl_d - sim_d), 1),
            "baseline_this_year":    round(bl_d, 1),
        })

    return {
        "total_lives_saved": total_lives_saved,
        "total_deaths":      sim.total_deaths,
        "baseline_deaths":   bl.total_deaths,
        "yearly_plan":       yearly,
        "cost":              round(result.get("estimated_cost", budget)),
    }


# ---------------------------------------------------------------------------
# RL agent rollout
# ---------------------------------------------------------------------------

def run_rl_agent(model: PPO, county_name: str, budget: float = BUDGET) -> dict:
    """Roll out the trained agent deterministically for one county."""
    env = OpioidPolicyEnv(
        county_name=county_name,
        total_budget=budget,
        randomize_budget=False,
    )
    obs, _ = env.reset(seed=42)

    yearly_plan        = []
    total_lives_saved  = 0.0
    total_deaths       = 0
    total_baseline     = 0.0

    for _ in range(5):
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, done, _, info = env.step(action)

        yearly_plan.append({
            "year":                  info["year"],
            "naloxone":              round(float(info["naloxone"]), 2),
            "prescribing":           round(float(info["prescribing"]), 2),
            "treatment":             round(float(info["treatment"]), 2),
            "budget_spent":          round(float(info["budget_spent"])),
            "budget_remaining":      round(float(info["budget_remaining"])),
            "deaths_this_year":      int(info["deaths_this_year"]),
            "lives_saved_this_year": round(float(info["lives_saved_this_year"]), 1),
            "baseline_this_year":    round(float(info["baseline_this_year"]), 1),
        })
        total_lives_saved += info["lives_saved_this_year"]
        total_deaths      += info["deaths_this_year"]
        total_baseline    += info["baseline_this_year"]

    return {
        "total_lives_saved": round(total_lives_saved, 1),
        "total_deaths":      total_deaths,
        "baseline_deaths":   round(total_baseline, 1),
        "budget_used":       round(budget - env._budget_remaining),
        "yearly_plan":       yearly_plan,
    }


# ---------------------------------------------------------------------------
# Generate comparison results for all 20 counties
# ---------------------------------------------------------------------------

def generate_comparison(model: PPO):
    print(f"\n{'='*60}")
    print("Generating RL vs Greedy comparison — all 20 counties")
    print(f"Budget: ${BUDGET:,.0f}")
    print(f"{'='*60}\n")

    results = {}
    for county in INDIANA_COUNTIES:
        name = county.name
        print(f"  {name}...", end=" ", flush=True)

        rl     = run_rl_agent(model, name, BUDGET)
        greedy = run_greedy(name, BUDGET)

        improvement = 0.0
        if greedy["total_lives_saved"] > 0:
            improvement = round(
                (rl["total_lives_saved"] - greedy["total_lives_saved"])
                / greedy["total_lives_saved"] * 100,
                1,
            )

        results[name] = {
            "county":          name,
            "population":      county.population,
            "budget":          BUDGET,
            "rl":              rl,
            "greedy":          greedy,
            "improvement_pct": improvement,
            "extra_lives":     round(rl["total_lives_saved"] - greedy["total_lives_saved"], 1),
        }
        print(f"RL={rl['total_lives_saved']:.1f} lives, "
              f"Greedy={greedy['total_lives_saved']:.1f} lives, "
              f"improvement={improvement:+.1f}%")

    # Summary stats
    avg_improvement = np.mean([r["improvement_pct"] for r in results.values()])
    total_extra     = sum(r["extra_lives"] for r in results.values())

    summary = {
        "avg_improvement_pct": round(float(avg_improvement), 1),
        "total_extra_lives":   round(float(total_extra), 1),
        "budget":              BUDGET,
        "counties_analyzed":   len(results),
    }

    output = {"summary": summary, "counties": results}
    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(RESULTS_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Average improvement: {avg_improvement:+.1f}%")
    print(f"Total extra lives saved across all counties: {total_extra:+.1f}")
    print(f"Results saved to {RESULTS_PATH}")
    print(f"{'='*60}\n")

    return output


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--timesteps", type=int, default=300_000,
                        help="PPO training timesteps (default 300K)")
    parser.add_argument("--skip-train", action="store_true",
                        help="Skip training and load existing agent")
    args = parser.parse_args()

    if args.skip_train:
        best = AGENT_PATH.parent / "best_model.zip"
        path = str(best) if best.exists() else str(AGENT_PATH)
        print(f"Loading existing agent from {path}")
        model = PPO.load(path)
    else:
        model = train(args.timesteps)

    generate_comparison(model)
    print("Done.")
