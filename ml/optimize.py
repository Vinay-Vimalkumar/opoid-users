"""
Find optimal intervention bundles per county given a budget constraint.
Grid search over intervention space using the trained XGBoost model.

Also provides optimize_portfolio() for multi-county budget allocation via
DP knapsack.
"""

import json
import itertools
import numpy as np
import xgboost as xgb
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "simulation"))
from model import COUNTY_MAP, INDIANA_COUNTIES, Interventions, compute_cost

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


def _vectorized_costs(combos: np.ndarray, population: int, months: int) -> np.ndarray:
    """Compute costs for all combos without Python loops."""
    n_ = combos[:, 0]
    p_ = combos[:, 1]
    t_ = combos[:, 2]
    monthly = (
        (n_ * population / 500) * 75
        + (p_ * 10) * 500_000 / months
        + (t_ * population * 0.001) * 10_000 / 12
    )
    return monthly * months


def _build_feature_matrix(combos: np.ndarray, cf: dict) -> np.ndarray:
    """Build 9-feature matrix for model.predict(), matching FEATURES order."""
    n = len(combos)
    return np.column_stack([
        combos,
        np.full(n, cf.get("population", 0)),
        np.full(n, cf.get("overdose_rate_per_100k", 0.0)),
        np.full(n, cf.get("pct_uninsured", 0.0)),
        np.full(n, cf.get("od_touchpoints", 0)),
        np.full(n, cf.get("treatment_facilities", 0)),
        np.full(n, cf.get("median_household_income", 50000)),
    ])


def optimize_portfolio(
    county_names: list,
    total_budget: float,
    months: int = 60,
    budget_steps: int = 50,
) -> dict:
    """
    Allocate total_budget across counties to maximize total estimated lives saved.

    Uses a DP knapsack over a discretized budget grid:
      - Precomputes lives_saved at each budget level for every county (ML model).
      - O(n_counties × budget_steps²) DP — fast for ≤ 20 counties, ≤ 100 steps.

    Returns per-county allocations plus a total lives saved estimate.
    """
    model = load_model()
    county_features = load_county_features()
    combos = np.array(list(itertools.product(LEVELS, repeat=3)))  # (9261, 3)

    step_size = total_budget / budget_steps
    budget_levels = np.arange(budget_steps + 1) * step_size  # 0, step, 2*step, ...

    n = len(county_names)
    # lives_table[i][j] = estimated lives saved for county i at budget j*step_size
    lives_table = np.zeros((n, budget_steps + 1))
    interventions_table = [[None] * (budget_steps + 1) for _ in range(n)]
    costs_table = np.zeros((n, budget_steps + 1))

    for i, name in enumerate(county_names):
        county = COUNTY_MAP[name]
        cf = county_features.get(name, {})

        combo_costs = _vectorized_costs(combos, county.population, months)
        X = _build_feature_matrix(combos, cf)
        scores = model.predict(X)
        total_lives = scores * (combo_costs / 1_000_000)

        for j, budget in enumerate(budget_levels):
            if budget == 0:
                continue
            mask = combo_costs <= budget
            if not mask.any():
                continue
            best_idx = int(np.argmax(total_lives[mask]))
            # map back to original combo index
            orig_idx = np.where(mask)[0][best_idx]
            lives_table[i][j] = float(total_lives[orig_idx])
            interventions_table[i][j] = {
                "naloxone": float(combos[orig_idx][0]),
                "prescribing": float(combos[orig_idx][1]),
                "treatment": float(combos[orig_idx][2]),
            }
            costs_table[i][j] = float(combo_costs[orig_idx])

    # DP knapsack: dp[i][b] = max lives using first i counties with b budget steps
    dp = np.zeros((n + 1, budget_steps + 1))
    choice = np.zeros((n + 1, budget_steps + 1), dtype=int)

    for i in range(1, n + 1):
        for b in range(budget_steps + 1):
            dp[i][b] = dp[i - 1][b]
            choice[i][b] = 0
            for k in range(1, b + 1):
                val = dp[i - 1][b - k] + lives_table[i - 1][k]
                if val > dp[i][b]:
                    dp[i][b] = val
                    choice[i][b] = k

    # Backtrack to find per-county allocation
    allocations = []
    unallocated = []
    b = budget_steps
    for i in range(n, 0, -1):
        k = choice[i][b]
        name = county_names[i - 1]
        if k > 0:
            allocations.append({
                "county": name,
                "allocated_budget": round(k * step_size, 2),
                "optimal_interventions": interventions_table[i - 1][k],
                "estimated_cost": round(costs_table[i - 1][k], 2),
                "estimated_lives_saved": round(lives_table[i - 1][k], 1),
            })
        else:
            unallocated.append(name)
        b -= k

    allocations.sort(key=lambda x: -x["estimated_lives_saved"])

    return {
        "total_budget": total_budget,
        "total_estimated_lives_saved": round(float(dp[n][budget_steps]), 1),
        "allocations": allocations,
        "zero_allocation_counties": unallocated,
    }


if __name__ == "__main__":
    result = find_optimal("Marion", 2_000_000)
    print(json.dumps(result, indent=2))
