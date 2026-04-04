"""
Find optimal intervention bundles per county given a budget constraint.
Grid search over intervention space using the trained XGBoost model.
"""

import json
import itertools
import numpy as np
import xgboost as xgb
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "simulation"))
from model import COUNTY_MAP, Interventions, compute_cost

MODEL_PATH = Path(__file__).parent / "xgb_model.json"
LEVELS = np.arange(0, 1.05, 0.05)  # finer grid for optimization


def load_model():
    model = xgb.XGBRegressor()
    model.load_model(str(MODEL_PATH))
    return model


def find_optimal(county_name: str, budget: float, months: int = 60):
    """Find the intervention bundle that maximizes lives saved within budget."""
    model = load_model()
    county = COUNTY_MAP[county_name]

    # Build all candidate combos as a matrix and batch-predict
    combos = np.array(list(itertools.product(LEVELS, repeat=3)))  # (N, 3)
    costs = np.array([
        compute_cost(Interventions(float(n), float(p), float(t)), county.population, months)
        for n, p, t in combos
    ])

    mask = costs <= budget
    if not mask.any():
        return {
            "county": county_name,
            "budget": budget,
            "optimal_interventions": None,
            "estimated_cost": 0,
            "lives_saved_per_million": 0,
            "estimated_lives_saved": 0,
        }

    valid_combos = combos[mask]
    valid_costs = costs[mask]
    X = np.column_stack([valid_combos, np.full(len(valid_combos), county.population)])
    scores = model.predict(X)

    best_idx = int(np.argmax(scores))
    best_score = float(scores[best_idx])
    best_cost = float(valid_costs[best_idx])
    n, p, t = valid_combos[best_idx]
    best_combo = {"naloxone": float(n), "prescribing": float(p), "treatment": float(t)}

    lives_saved = best_score * (best_cost / 1_000_000)

    return {
        "county": county_name,
        "budget": budget,
        "optimal_interventions": best_combo,
        "estimated_cost": round(best_cost, 2),
        "lives_saved_per_million": round(best_score, 2),
        "estimated_lives_saved": round(lives_saved, 1),
    }


if __name__ == "__main__":
    result = find_optimal("Marion", 2_000_000)
    print(json.dumps(result, indent=2))
