"""
Train XGBoost model on simulation results enriched with real CDC county data.

Input features:
  - Intervention levers: naloxone, prescribing, treatment
  - County demographics: population
  - Real CDC data: overdose_rate_per_100k, pct_uninsured, od_touchpoints,
                   treatment_facilities, median_household_income

Output: lives_saved_per_million_dollars
"""

import json
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent / "data" / "processed" / "simulation_results.json"
PROFILES_PATH = Path(__file__).parent.parent / "data" / "processed" / "county_profiles.json"
MODEL_PATH = Path(__file__).parent / "xgb_model.json"
FEATURE_IMPORTANCE_PATH = Path(__file__).parent / "feature_importance.json"


def load_county_features():
    """Load real-world county features from CDC profiles."""
    if not PROFILES_PATH.exists():
        print("WARNING: county_profiles.json not found, using population only")
        return {}

    with open(PROFILES_PATH) as f:
        profiles = json.load(f)

    features = {}
    for p in profiles:
        name = p.get("name")
        if not name:
            continue
        # od_touchpoints is a dict — sum all values for a single scalar
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


def load_data():
    """Load and merge simulation results with real county features."""
    with open(DATA_PATH) as f:
        raw = json.load(f)
    df = pd.DataFrame(raw)

    county_features = load_county_features()

    # Map real features onto simulation rows
    for col, default in [
        ("population", 0),
        ("overdose_rate_per_100k", 0.0),
        ("pct_uninsured", 0.0),
        ("od_touchpoints", 0),
        ("treatment_facilities", 0),
        ("median_household_income", 50000),
    ]:
        df[col] = df["county"].map(
            lambda name, c=col, d=default: county_features.get(name, {}).get(c, d)
        )

    # Aggregate over seeds (mean)
    group_cols = ["county", "naloxone", "prescribing", "treatment",
                  "population", "overdose_rate_per_100k", "pct_uninsured",
                  "od_touchpoints", "treatment_facilities", "median_household_income"]
    agg = df.groupby(group_cols).agg({
        "total_deaths": "mean",
        "total_overdoses": "mean",
        "total_treated": "mean",
        "lives_saved": "mean",
        "cost": "mean",
    }).reset_index()

    # Target: lives saved per million dollars
    agg["lives_saved_per_million"] = np.where(
        agg["cost"] > 0,
        agg["lives_saved"] / (agg["cost"] / 1_000_000),
        0.0
    )
    return agg


def train():
    print("Loading simulation data with real CDC county features...")
    df = load_data()
    print(f"Training on {len(df)} aggregated scenarios across {df['county'].nunique()} counties")

    features = [
        "naloxone", "prescribing", "treatment",
        "population", "overdose_rate_per_100k", "pct_uninsured",
        "od_touchpoints", "treatment_facilities", "median_household_income",
    ]
    target = "lives_saved_per_million"

    X = df[features].values
    y = df[target].values

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = xgb.XGBRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    print(f"RMSE: {rmse:.4f}")
    print(f"R²:   {r2:.4f}")

    importance = dict(zip(features, model.feature_importances_.tolist()))
    print(f"Feature importance:")
    for feat, imp in sorted(importance.items(), key=lambda x: -x[1]):
        print(f"  {feat}: {imp:.4f}")

    model.save_model(str(MODEL_PATH))
    with open(FEATURE_IMPORTANCE_PATH, "w") as f:
        json.dump(importance, f, indent=2)
    print(f"\nModel saved to {MODEL_PATH}")

    return model


if __name__ == "__main__":
    train()
