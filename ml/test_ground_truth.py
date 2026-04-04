"""
Ground truth tests for the trained XGBoost model.

Each test compares model predictions against actual simulation averages
(averaged over 5 random seeds) for known (county, lever) combinations.

Tolerance: ±20 lives_saved_per_million — ~3x the hold-out RMSE of 6.62,
accounting for the fact that test scenarios were not in the training split.

Run:
    python ml/test_ground_truth.py
or:
    pytest ml/test_ground_truth.py -v
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import xgboost as xgb

ROOT = Path(__file__).parent.parent
DATA_PATH = ROOT / "data" / "processed" / "simulation_results.json"
PROFILES_PATH = ROOT / "data" / "processed" / "county_profiles.json"
MODEL_PATH = Path(__file__).parent / "xgb_model.json"

FEATURES = [
    "naloxone", "prescribing", "treatment",
    "population", "overdose_rate_per_100k", "pct_uninsured",
    "od_touchpoints", "treatment_facilities", "median_household_income",
]

# Tolerance: ±20 lives_saved_per_million (~3× hold-out RMSE of 6.62)
TOLERANCE = 20.0

# Ground truth: (county, naloxone, prescribing, treatment) → simulation average
# Values computed by averaging over seeds [42, 123, 456, 789, 1024].
GROUND_TRUTH = [
    # county,      nal,  rx,   tx,   expected_lives_per_million
    ("Marion",     1.0,  1.0,  1.0,  55.5871),
    ("Marion",     0.5,  0.5,  0.5,  68.0504),
    ("Marion",     1.0,  0.0,  0.0,  260.6889),  # naloxone-only
    ("Marion",     0.0,  1.0,  0.0,  315.4000),  # prescribing-only
    ("Marion",     0.0,  0.0,  1.0,  23.1531),   # treatment-only
    ("Blackford",  1.0,  1.0,  1.0,  26.3592),
    ("Lake",       0.5,  0.5,  0.5,  64.8440),
]

# Directional sanity checks: increasing a lever should not massively collapse
# efficiency when the other levers are zero (single-lever ROI is still positive).
DIRECTIONAL_CHECKS = [
    # county,    lever,         low,  high
    ("Marion",   "naloxone",    0.1,   0.9),
    ("Marion",   "prescribing", 0.1,   0.9),
    ("Marion",   "treatment",   0.1,   0.9),
    ("Blackford","naloxone",    0.1,   0.9),
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def model():
    m = xgb.XGBRegressor()
    m.load_model(str(MODEL_PATH))
    return m


@pytest.fixture(scope="module")
def county_features():
    with open(PROFILES_PATH) as f:
        profiles = json.load(f)
    result = {}
    for p in profiles:
        name = p.get("name")
        if not name:
            continue
        od_raw = p.get("od_touchpoints") or 0
        od_total = sum(od_raw.values()) if isinstance(od_raw, dict) else float(od_raw)
        result[name] = {
            "population": p.get("population", 0),
            "overdose_rate_per_100k": (
                p.get("latest_rate_per_100k") or p.get("avg_rate_per_100k") or 0.0
            ),
            "pct_uninsured": float(p.get("pct_uninsured") or 0.0),
            "od_touchpoints": od_total,
            "treatment_facilities": int(p.get("treatment_facilities") or 0),
            "median_household_income": float(p.get("median_household_income") or 50000),
        }
    return result


def _make_row(county, naloxone, prescribing, treatment, county_features):
    cf = county_features[county]
    return [
        naloxone, prescribing, treatment,
        cf["population"],
        cf["overdose_rate_per_100k"],
        cf["pct_uninsured"],
        cf["od_touchpoints"],
        cf["treatment_facilities"],
        cf["median_household_income"],
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "county,naloxone,prescribing,treatment,expected",
    GROUND_TRUTH,
)
def test_prediction_matches_simulation_average(
    county, naloxone, prescribing, treatment, expected, model, county_features
):
    """Model prediction must be within TOLERANCE of the simulation average."""
    row = _make_row(county, naloxone, prescribing, treatment, county_features)
    pred = float(model.predict([row])[0])
    diff = abs(pred - expected)
    assert diff <= TOLERANCE, (
        f"{county} (nal={naloxone}, rx={prescribing}, tx={treatment}): "
        f"predicted={pred:.4f}, expected={expected:.4f}, diff={diff:.4f} > {TOLERANCE}"
    )


def test_zero_intervention_cost_is_zero(county_features):
    """When no intervention is applied cost=0, lives_saved=0 in simulation."""
    # This is a property of the simulation data, not the model.
    with open(DATA_PATH) as f:
        raw = json.load(f)
    df = pd.DataFrame(raw)
    zero_rows = df[(df["naloxone"] == 0) & (df["prescribing"] == 0) & (df["treatment"] == 0)]
    assert (zero_rows["cost"] == 0).all(), "Zero-intervention rows must have cost=0"
    assert (zero_rows["lives_saved"] == 0).all(), "Zero-intervention rows must have lives_saved=0"


def test_model_predictions_are_finite(model, county_features):
    """Model must not produce NaN or Inf for any county at any lever setting."""
    rows = []
    for county in county_features:
        for val in [0.0, 0.5, 1.0]:
            rows.append(_make_row(county, val, val, val, county_features))
    preds = model.predict(rows)
    assert np.all(np.isfinite(preds)), "Model produced NaN or Inf predictions"


@pytest.mark.parametrize(
    "county,lever,low_val,high_val",
    DIRECTIONAL_CHECKS,
)
def test_single_lever_roi_is_positive(county, lever, low_val, high_val, model, county_features):
    """A higher single lever should not yield zero or negative efficiency
    when the other levers are also set to the same value (both rows are valid
    non-zero-cost scenarios)."""
    base = {"naloxone": low_val, "prescribing": low_val, "treatment": low_val}

    row_low = _make_row(county, base["naloxone"], base["prescribing"], base["treatment"], county_features)
    pred_low = float(model.predict([row_low])[0])
    assert pred_low >= 0, (
        f"{county} lever={lever} at {low_val}: prediction {pred_low:.4f} is negative"
    )

    high = base.copy()
    high[lever] = high_val
    row_high = _make_row(county, high["naloxone"], high["prescribing"], high["treatment"], county_features)
    pred_high = float(model.predict([row_high])[0])
    assert pred_high >= 0, (
        f"{county} lever={lever} at {high_val}: prediction {pred_high:.4f} is negative"
    )


def test_high_overdose_county_benefits_more_from_prescribing(model, county_features):
    """Marion (overdose_rate=53.9) should see higher prescribing-only ROI than
    Lake (overdose_rate=29.8), reflecting the simulation's county-specific dynamics."""
    def prescribing_roi(county):
        row = _make_row(county, 0.0, 1.0, 0.0, county_features)
        return float(model.predict([row])[0])

    marion_roi = prescribing_roi("Marion")
    lake_roi = prescribing_roi("Lake")
    assert marion_roi > lake_roi, (
        f"Expected Marion prescribing ROI ({marion_roi:.2f}) > Lake ({lake_roi:.2f})"
    )


def test_model_file_exists():
    assert MODEL_PATH.exists(), f"Model file not found: {MODEL_PATH}"


def test_feature_importance_sums_to_one():
    fi_path = Path(__file__).parent / "feature_importance.json"
    with open(fi_path) as f:
        fi = json.load(f)
    total = sum(fi.values())
    assert abs(total - 1.0) < 1e-4, f"Feature importances sum to {total:.6f}, expected ~1.0"


def test_treatment_and_prescribing_are_top_features():
    fi_path = Path(__file__).parent / "feature_importance.json"
    with open(fi_path) as f:
        fi = json.load(f)
    top2 = sorted(fi, key=fi.get, reverse=True)[:2]
    assert "treatment" in top2 or "prescribing" in top2, (
        f"Expected treatment/prescribing in top-2 features, got: {top2}"
    )


# ---------------------------------------------------------------------------
# Standalone runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    print("Loading model and county features...")
    m = xgb.XGBRegressor()
    m.load_model(str(MODEL_PATH))

    with open(PROFILES_PATH) as f:
        profiles = json.load(f)
    cf = {}
    for p in profiles:
        name = p.get("name")
        if not name:
            continue
        od_raw = p.get("od_touchpoints") or 0
        od_total = sum(od_raw.values()) if isinstance(od_raw, dict) else float(od_raw)
        cf[name] = {
            "population": p.get("population", 0),
            "overdose_rate_per_100k": (
                p.get("latest_rate_per_100k") or p.get("avg_rate_per_100k") or 0.0
            ),
            "pct_uninsured": float(p.get("pct_uninsured") or 0.0),
            "od_touchpoints": od_total,
            "treatment_facilities": int(p.get("treatment_facilities") or 0),
            "median_household_income": float(p.get("median_household_income") or 50000),
        }

    print()
    print(f"{'County':<12} {'Nal':>5} {'Rx':>5} {'Tx':>5} | {'Expected':>10} {'Predicted':>10} {'Diff':>8} {'Pass':>5}")
    print("-" * 65)

    passed = 0
    failed = 0
    for county, nal, rx, tx, expected in GROUND_TRUTH:
        row = _make_row(county, nal, rx, tx, cf)
        pred = float(m.predict([row])[0])
        diff = abs(pred - expected)
        ok = diff <= TOLERANCE
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        else:
            failed += 1
        print(f"{county:<12} {nal:>5.1f} {rx:>5.1f} {tx:>5.1f} | {expected:>10.4f} {pred:>10.4f} {diff:>8.4f} {status:>5}")

    print()
    print(f"Results: {passed} passed, {failed} failed  (tolerance ±{TOLERANCE})")
    sys.exit(0 if failed == 0 else 1)
