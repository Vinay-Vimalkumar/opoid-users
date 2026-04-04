"""
Train XGBoost model on simulation results.
Input features: naloxone, prescribing, treatment, county_population
Output: lives_saved_per_million_dollars
"""

import json
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import joblib
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent / "data" / "processed" / "simulation_results.json"
MODEL_PATH = Path(__file__).parent / "xgb_model.json"
FEATURE_IMPORTANCE_PATH = Path(__file__).parent / "feature_importance.json"

# County populations for feature engineering
COUNTY_POPS = {
    "Marion": 977203, "Lake": 498700, "Allen": 379299, "St. Joseph": 271826,
    "Vanderburgh": 181451, "Tippecanoe": 193391, "Delaware": 114135, "Wayne": 65884,
    "Vigo": 107848, "Madison": 128500, "Clark": 119256, "Floyd": 78522,
    "Scott": 24181, "Lawrence": 45370, "Fayette": 23102, "Jay": 20436,
    "Blackford": 11758, "Vermillion": 15498, "Henry": 47972, "Grant": 65769,
}


def load_data():
    with open(DATA_PATH) as f:
        raw = json.load(f)
    df = pd.DataFrame(raw)
    df["population"] = df["county"].map(COUNTY_POPS)
    # Aggregate over seeds (mean)
    agg = df.groupby(["county", "naloxone", "prescribing", "treatment", "population"]).agg({
        "total_deaths": "mean",
        "total_overdoses": "mean",
        "total_treated": "mean",
        "lives_saved": "mean",
        "cost": "mean",
    }).reset_index()
    # Compute target: lives saved per million dollars
    agg["lives_saved_per_million"] = np.where(
        agg["cost"] > 0,
        agg["lives_saved"] / (agg["cost"] / 1_000_000),
        0.0
    )
    return agg


def train():
    print("Loading simulation data...")
    df = load_data()
    print(f"Training on {len(df)} aggregated scenarios")

    features = ["naloxone", "prescribing", "treatment", "population"]
    target = "lives_saved_per_million"

    X = df[features].values
    y = df[target].values

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = xgb.XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    print(f"RMSE: {rmse:.4f}")
    print(f"R²:   {r2:.4f}")

    # Feature importance
    importance = dict(zip(features, model.feature_importances_.tolist()))
    print(f"Feature importance: {importance}")

    # Save
    model.save_model(str(MODEL_PATH))
    with open(FEATURE_IMPORTANCE_PATH, "w") as f:
        json.dump(importance, f, indent=2)
    print(f"Model saved to {MODEL_PATH}")

    return model


if __name__ == "__main__":
    train()
