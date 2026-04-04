"""
LSTM Time-Series Forecaster for Opioid Overdose Deaths.

Trained on REAL CDC data (2003-2021 model-based death rates + 2020-2024 provisional
counts) — NOT on simulation outputs. This makes the ML genuinely useful: it learns
patterns from reality, not from our own model.

Features per county per year:
  - Death rate per 100K (CDC model-based)
  - Population
  - Year-over-year change in death rate
  - Urban/rural classification (one-hot)
  - County-level baseline risk (mean rate 2003-2010)

Predicts: death rate per 100K for the next 1-3 years.

Architecture: Bidirectional LSTM with attention — captures both long-term trends
(the 2003-2016 slow rise) and sudden regime changes (2016-2021 fentanyl surge).
"""

import torch
import torch.nn as nn
import torch.optim as optim
import csv
import json
import numpy as np
import time
from pathlib import Path
from collections import defaultdict


PROJECT_DIR = Path(__file__).parent.parent

FIPS_TO_COUNTY = {
    "18097": "Marion", "18089": "Lake", "18003": "Allen", "18141": "St. Joseph",
    "18163": "Vanderburgh", "18157": "Tippecanoe", "18035": "Delaware",
    "18177": "Wayne", "18167": "Vigo", "18095": "Madison", "18019": "Clark",
    "18043": "Floyd", "18143": "Scott", "18093": "Lawrence", "18041": "Fayette",
    "18075": "Jay", "18009": "Blackford", "18165": "Vermillion", "18065": "Henry",
    "18053": "Grant",
}

URBAN_CATEGORIES = {
    "Large Central Metro": 0,
    "Large Fringe Metro": 1,
    "Medium Metro": 2,
    "Small Metro": 3,
    "Micropolitan": 4,
    "Noncore": 5,
}


class OpioidLSTM(nn.Module):
    """
    Bidirectional LSTM with temporal attention for overdose death forecasting.

    The attention mechanism lets the model weight which historical years are
    most informative for prediction — e.g., the 2016 fentanyl inflection point
    should get high attention weight when predicting post-2020 deaths.
    """

    def __init__(self, input_dim=8, hidden_dim=128, num_layers=2, dropout=0.2):
        super().__init__()

        self.lstm = nn.LSTM(
            input_dim, hidden_dim, num_layers=num_layers,
            batch_first=True, bidirectional=True, dropout=dropout,
        )

        # Attention over time steps
        self.attention = nn.Sequential(
            nn.Linear(hidden_dim * 2, 64),
            nn.Tanh(),
            nn.Linear(64, 1),
        )

        # Prediction heads
        self.predictor = nn.Sequential(
            nn.Linear(hidden_dim * 2, 128),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(128, 64),
            nn.GELU(),
            nn.Linear(64, 3),  # predict next 1, 2, 3 years
        )

    def forward(self, x):
        # x: (batch, seq_len, input_dim)
        lstm_out, _ = self.lstm(x)  # (batch, seq_len, hidden*2)

        # Attention weights
        attn_weights = self.attention(lstm_out).squeeze(-1)  # (batch, seq_len)
        attn_weights = torch.softmax(attn_weights, dim=1)

        # Weighted sum
        context = torch.bmm(attn_weights.unsqueeze(1), lstm_out).squeeze(1)  # (batch, hidden*2)

        # Predict
        return self.predictor(context)  # (batch, 3)


def load_real_data():
    """Load and featurize real CDC data for all 20 Indiana counties."""
    filepath = PROJECT_DIR / "data" / "raw" / "cdc_drug_poisoning_mortality.csv"

    county_data = defaultdict(list)  # county -> [(year, rate, pop, urban_cat), ...]

    with open(filepath, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            fips = row.get("FIPS", "").strip()
            if fips not in FIPS_TO_COUNTY:
                continue
            county = FIPS_TO_COUNTY[fips]
            year = int(row["Year"])
            rate = float(row["Model-based Death Rate"])
            pop = int(row["Population"].replace(",", ""))
            urban = row.get("Urban/Rural Category", "Unknown")
            county_data[county].append((year, rate, pop, urban))

    for county in county_data:
        county_data[county].sort(key=lambda x: x[0])

    return dict(county_data)


def build_features(county_data: dict):
    """
    Build feature sequences and targets for training.

    For each county, create sliding windows:
      Input: years [t-W, ..., t]  →  Target: death rates at [t+1, t+2, t+3]

    Features per year:
      0: death_rate (normalized)
      1: population (normalized, in millions)
      2: year_delta (rate change from prior year)
      3: rate_acceleration (change in delta)
      4: baseline_risk (mean rate 2003-2010)
      5-7: urban category (one-hot, top 3)
    """
    all_sequences = []
    all_targets = []
    all_meta = []  # county name + target year for interpretability

    window_size = 10  # use 10 years of history to predict next 3

    # Global normalization stats
    all_rates = []
    all_pops = []
    for county, years in county_data.items():
        for y, r, p, u in years:
            all_rates.append(r)
            all_pops.append(p)

    rate_mean, rate_std = np.mean(all_rates), np.std(all_rates)
    pop_mean, pop_std = np.mean(all_pops), np.std(all_pops)

    norm_stats = {
        "rate_mean": float(rate_mean), "rate_std": float(rate_std),
        "pop_mean": float(pop_mean), "pop_std": float(pop_std),
    }

    for county, years in county_data.items():
        rates = [r for _, r, _, _ in years]
        pops = [p for _, _, p, _ in years]
        year_nums = [y for y, _, _, _ in years]
        urban_cat = URBAN_CATEGORIES.get(years[0][3], 3)

        # Baseline risk: mean rate in first 8 years (2003-2010)
        baseline = np.mean(rates[:8]) if len(rates) >= 8 else np.mean(rates)

        # Year-over-year deltas
        deltas = [0] + [rates[i] - rates[i-1] for i in range(1, len(rates))]
        accels = [0] + [deltas[i] - deltas[i-1] for i in range(1, len(deltas))]

        # Build feature matrix for this county
        for i in range(window_size, len(rates) - 3):
            seq = []
            for j in range(i - window_size, i):
                urban_onehot = [0, 0, 0]
                if urban_cat < 3:
                    urban_onehot[urban_cat] = 1

                feat = [
                    (rates[j] - rate_mean) / rate_std,
                    (pops[j] - pop_mean) / pop_std,
                    deltas[j] / rate_std,
                    accels[j] / rate_std,
                    (baseline - rate_mean) / rate_std,
                    *urban_onehot,
                ]
                seq.append(feat)

            # Target: next 3 years' rates (normalized)
            target = [
                (rates[i] - rate_mean) / rate_std,
                (rates[i+1] - rate_mean) / rate_std,
                (rates[i+2] - rate_mean) / rate_std,
            ]

            all_sequences.append(seq)
            all_targets.append(target)
            all_meta.append({"county": county, "target_year": year_nums[i]})

    return (
        np.array(all_sequences, dtype=np.float32),
        np.array(all_targets, dtype=np.float32),
        all_meta,
        norm_stats,
    )


def train_forecaster(epochs=300, lr=1e-3, batch_size=32):
    """Train the LSTM forecaster on real CDC data."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # Load data
    print("Loading real CDC data...")
    county_data = load_real_data()
    print(f"Counties: {len(county_data)}")

    X, y, meta, norm_stats = build_features(county_data)
    print(f"Training samples: {len(X)} (window=10 years → predict 3 years)")
    print(f"Feature dim: {X.shape[2]}, Sequence length: {X.shape[1]}")

    # Train/val split (leave last 2 years per county for validation)
    val_years = {2019, 2020}  # predict 2019-2021 and 2020-2022
    train_mask = [m["target_year"] not in val_years for m in meta]
    val_mask = [m["target_year"] in val_years for m in meta]

    X_train = torch.tensor(X[train_mask], device=device)
    y_train = torch.tensor(y[train_mask], device=device)
    X_val = torch.tensor(X[val_mask], device=device)
    y_val = torch.tensor(y[val_mask], device=device)

    print(f"Train: {len(X_train)}, Val: {len(X_val)}")

    # Model
    model = OpioidLSTM(input_dim=X.shape[2]).to(device)
    params = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {params:,}")

    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.HuberLoss(delta=0.5)

    best_val_loss = float("inf")
    best_state = None
    t0 = time.time()

    for epoch in range(epochs):
        model.train()
        perm = torch.randperm(len(X_train), device=device)
        epoch_loss = 0
        n_batches = 0

        for i in range(0, len(X_train), batch_size):
            idx = perm[i:i+batch_size]
            xb, yb = X_train[idx], y_train[idx]

            pred = model(xb)
            loss = criterion(pred, yb)

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            epoch_loss += loss.item()
            n_batches += 1

        scheduler.step()

        # Validation
        model.eval()
        with torch.no_grad():
            val_pred = model(X_val)
            val_loss = criterion(val_pred, y_val).item()

            # Denormalize and compute MAE in original units (deaths per 100K)
            val_pred_orig = val_pred * norm_stats["rate_std"] + norm_stats["rate_mean"]
            val_y_orig = y_val * norm_stats["rate_std"] + norm_stats["rate_mean"]
            mae = (val_pred_orig - val_y_orig).abs().mean().item()

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_epoch = epoch
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

        if (epoch + 1) % 30 == 0 or epoch == 0:
            print(f"Epoch {epoch+1:3d}/{epochs} | Train: {epoch_loss/n_batches:.4f} | "
                  f"Val: {val_loss:.4f} | MAE: {mae:.1f}/100K | "
                  f"LR: {scheduler.get_last_lr()[0]:.2e}")

    elapsed = time.time() - t0
    print(f"\nTraining complete in {elapsed:.1f}s (best epoch: {best_epoch+1})")

    # Final eval
    model.load_state_dict(best_state)
    model = model.to(device)
    model.eval()

    with torch.no_grad():
        # Full dataset R²
        all_pred = model(torch.tensor(X, device=device))
        all_pred_orig = all_pred * norm_stats["rate_std"] + norm_stats["rate_mean"]
        all_y_orig = torch.tensor(y, device=device) * norm_stats["rate_std"] + norm_stats["rate_mean"]

        ss_res = ((all_y_orig - all_pred_orig) ** 2).sum(dim=0)
        ss_tot = ((all_y_orig - all_y_orig.mean(dim=0)) ** 2).sum(dim=0)
        r2 = (1 - ss_res / ss_tot).cpu().numpy()

        overall_mae = (all_pred_orig - all_y_orig).abs().mean(dim=0).cpu().numpy()

    print(f"\nFinal R² — 1yr: {r2[0]:.3f}, 2yr: {r2[1]:.3f}, 3yr: {r2[2]:.3f}")
    print(f"Final MAE — 1yr: {overall_mae[0]:.1f}, 2yr: {overall_mae[1]:.1f}, 3yr: {overall_mae[2]:.1f} per 100K")

    # Generate forecasts for all counties (predict 2022, 2023, 2024)
    print("\n--- County Forecasts (2022-2024) ---")
    forecasts = {}
    for county, years in county_data.items():
        rates = [r for _, r, _, _ in years]
        pops = [p for _, _, p, _ in years]
        urban_cat = URBAN_CATEGORIES.get(years[0][3], 3)
        baseline = np.mean(rates[:8])

        if len(rates) < 10:
            continue

        # Use last 10 years as input
        deltas = [0] + [rates[i] - rates[i-1] for i in range(1, len(rates))]
        accels = [0] + [deltas[i] - deltas[i-1] for i in range(1, len(deltas))]

        seq = []
        for j in range(len(rates) - 10, len(rates)):
            urban_onehot = [0, 0, 0]
            if urban_cat < 3:
                urban_onehot[urban_cat] = 1
            feat = [
                (rates[j] - norm_stats["rate_mean"]) / norm_stats["rate_std"],
                (pops[j] - norm_stats["pop_mean"]) / norm_stats["pop_std"],
                deltas[j] / norm_stats["rate_std"],
                accels[j] / norm_stats["rate_std"],
                (baseline - norm_stats["rate_mean"]) / norm_stats["rate_std"],
                *urban_onehot,
            ]
            seq.append(feat)

        x_input = torch.tensor([seq], dtype=torch.float32, device=device)
        with torch.no_grad():
            pred = model(x_input)[0]
            pred_rates = (pred * norm_stats["rate_std"] + norm_stats["rate_mean"]).cpu().numpy()

        last_pop = pops[-1]
        last_year = years[-1][0]
        forecasts[county] = {
            "last_observed_year": last_year,
            "last_observed_rate": round(rates[-1], 1),
            "forecast_years": [last_year + 1, last_year + 2, last_year + 3],
            "forecast_rates": [round(float(r), 1) for r in pred_rates],
            "forecast_deaths": [round(float(r) * last_pop / 100_000) for r in pred_rates],
            "population": last_pop,
        }
        print(f"  {county:12s}: {rates[-1]:5.1f} → "
              f"{pred_rates[0]:5.1f} → {pred_rates[1]:5.1f} → {pred_rates[2]:5.1f} /100K")

    # Save
    out_dir = PROJECT_DIR / "ml" / "models"
    out_dir.mkdir(parents=True, exist_ok=True)

    save_dict = {
        "model_state": best_state,
        "norm_stats": norm_stats,
        "input_dim": X.shape[2],
        "hidden_dim": 128,
        "num_layers": 2,
        "r2_scores": {"1yr": float(r2[0]), "2yr": float(r2[1]), "3yr": float(r2[2])},
        "mae_scores": {"1yr": float(overall_mae[0]), "2yr": float(overall_mae[1]), "3yr": float(overall_mae[2])},
        "training_samples": len(X),
        "epochs": epochs,
        "best_epoch": best_epoch + 1,
        "training_time_sec": round(elapsed, 2),
    }
    torch.save(save_dict, out_dir / "lstm_forecaster.pt")
    print(f"\nModel saved to {out_dir / 'lstm_forecaster.pt'}")

    # Save forecasts
    with open(PROJECT_DIR / "data" / "processed" / "county_forecasts.json", "w") as f:
        json.dump(forecasts, f, indent=2)
    print(f"Forecasts saved to data/processed/county_forecasts.json")

    summary = {
        "model_type": "Bidirectional LSTM with Temporal Attention",
        "trained_on": "Real CDC Drug Poisoning Mortality Data (2003-2021)",
        "parameters": params,
        "r2_scores": {"1yr": round(float(r2[0]), 4), "2yr": round(float(r2[1]), 4), "3yr": round(float(r2[2]), 4)},
        "mae_per_100k": {"1yr": round(float(overall_mae[0]), 1), "2yr": round(float(overall_mae[1]), 1), "3yr": round(float(overall_mae[2]), 1)},
        "counties": len(county_data),
        "training_time_sec": round(elapsed, 2),
        "forecasts": forecasts,
    }
    with open(out_dir / "forecast_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    return summary


if __name__ == "__main__":
    train_forecaster()
