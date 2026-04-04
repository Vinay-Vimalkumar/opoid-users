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
PROFILES_PATH = Path(__file__).parent.parent / "data" / "processed" / "county_profiles.json"
LEVELS = np.arange(0, 1.05, 0.05)  # finer grid for optimization

# Feature order must match train_model.py
FEATURES = [
    "naloxone", "prescribing", "treatment",
    "population", "overdose_rate_per_100k", "pct_uninsured",
    "od_touchpoints", "treatment_facilities", "median_household_income",
]


def load_model():
    model = xgb.XGBRegressor()
    model.load_model(str(MODEL_PATH))
    return model


def load_county_features():
    """Load real-world county features from county_profiles.json."""
    if not PROFILES_PATH.exists():
        return {}
    with open(PROFILES_PATH) as f:
        profiles = json.load(f)
    features = {}
    for p in profiles:
        name = p.get("name") or p.get("county")
        if not name:
            continue
        od_raw = p.get("od_touchpoints") or 0
        od_total = sum(od_raw.values()) if isinstance(od_raw, dict) else float(od_raw)
        features[name] = {
            "population": p.get("population", 0),
            "overdose_rate_per_100k": p.get("latest_rate_per_100k") or p.get("avg_rate_per_100k") or 0.0,
            "pct_uninsured": float(p.get("pct_uninsured") or 0.0),
            "od_touchpoints": od_total,
            "treatment_facilities": int(p.get("treatment_facilities") or 0),
            "median_household_income": float(p.get("median_household_income") or 50000),
        }
    return features


def find_optimal(county_name: str, budget: float, months: int = 60):
    """Find the intervention bundle that maximizes lives saved within budget."""
    model = load_model()
    county = COUNTY_MAP[county_name]
    county_features = load_county_features()

    cf = county_features.get(county_name, {})
    population = cf.get("population", county.population)
    overdose_rate_per_100k = cf.get("overdose_rate_per_100k", 0.0)
    pct_uninsured = cf.get("pct_uninsured", 0.0)
    od_touchpoints = cf.get("od_touchpoints", 0)
    treatment_facilities = cf.get("treatment_facilities", 0)
    median_household_income = cf.get("median_household_income", 50000)

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

    # Build full 9-feature matrix matching train_model.py feature order
    n_valid = len(valid_combos)
    X = np.column_stack([
        valid_combos,
        np.full(n_valid, population),
        np.full(n_valid, overdose_rate_per_100k),
        np.full(n_valid, pct_uninsured),
        np.full(n_valid, od_touchpoints),
        np.full(n_valid, treatment_facilities),
        np.full(n_valid, median_household_income),
    ])
    scores = model.predict(X)

    # Maximize total lives saved (score × cost), not efficiency (score alone)
    total_lives = scores * (valid_costs / 1_000_000)
    best_idx = int(np.argmax(total_lives))
    best_score = float(scores[best_idx])
    best_cost = float(valid_costs[best_idx])
    n, p, t = valid_combos[best_idx]
    best_combo = {"naloxone": float(n), "prescribing": float(p), "treatment": float(t)}

    lives_saved = float(total_lives[best_idx])

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
