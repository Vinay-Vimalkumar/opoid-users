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

    best_score = -1
    best_combo = None
    best_cost = 0

    for n, p, t in itertools.product(LEVELS, repeat=3):
        interventions = Interventions(float(n), float(p), float(t))
        cost = compute_cost(interventions, county.population, months)
        if cost > budget:
            continue

        X = np.array([[n, p, t, county.population]])
        score = model.predict(X)[0]
        if score > best_score:
            best_score = score
            best_combo = {"naloxone": float(n), "prescribing": float(p), "treatment": float(t)}
            best_cost = cost

    # Estimate actual lives saved
    lives_saved = best_score * (best_cost / 1_000_000) if best_combo else 0

    return {
        "county": county_name,
        "budget": budget,
        "optimal_interventions": best_combo,
        "estimated_cost": round(float(best_cost), 2),
        "lives_saved_per_million": round(float(best_score), 2),
        "estimated_lives_saved": round(float(lives_saved), 1),
    }


if __name__ == "__main__":
    result = find_optimal("Marion", 2_000_000)
    print(json.dumps(result, indent=2))
