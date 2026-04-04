"""
Deep learning surrogate model for the opioid simulation.

Trained on GPU simulation outputs, this neural network learns to predict
simulation outcomes (deaths, overdoses, lives saved) from inputs
(county params + intervention levels) WITHOUT running the full simulation.

This enables:
  1. Real-time prediction in the dashboard (< 1ms per query vs ~5ms for simulation)
  2. Gradient-based optimization of intervention strategies
  3. Sensitivity analysis via backpropagation

Architecture: Multi-task MLP with shared backbone
  Input (7): population, prescribing_rate, misuse_rate, oud_rate, overdose_rate,
             naloxone, prescribing_reduction, treatment_access
  Output (4): total_deaths, total_overdoses, total_treated, lives_saved
"""

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset, random_split
import json
import time
import numpy as np
from pathlib import Path


class OpioidSurrogateNet(nn.Module):
    """
    Multi-task neural network that approximates the compartmental simulation.

    Architecture chosen for this problem:
    - Wide hidden layers (256-512 neurons) to capture nonlinear intervention interactions
    - Residual connections to preserve signal through depth
    - Separate prediction heads for each output (deaths vs overdoses have different scales)
    - Batch normalization for training stability across counties of vastly different populations
    """

    def __init__(self, input_dim=8, hidden_dim=512):
        super().__init__()

        # Shared feature backbone with residual connections
        self.input_bn = nn.BatchNorm1d(input_dim)

        self.block1 = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.GELU(),
            nn.Dropout(0.1),
        )

        self.block2 = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.GELU(),
            nn.Dropout(0.1),
        )

        self.block3 = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.GELU(),
            nn.Dropout(0.05),
        )

        self.block4 = nn.Sequential(
            nn.Linear(hidden_dim, 256),
            nn.BatchNorm1d(256),
            nn.GELU(),
        )

        # Task-specific heads
        self.deaths_head = nn.Sequential(
            nn.Linear(256, 128),
            nn.GELU(),
            nn.Linear(128, 1),
        )

        self.overdoses_head = nn.Sequential(
            nn.Linear(256, 128),
            nn.GELU(),
            nn.Linear(128, 1),
        )

        self.treated_head = nn.Sequential(
            nn.Linear(256, 128),
            nn.GELU(),
            nn.Linear(128, 1),
        )

        self.lives_saved_head = nn.Sequential(
            nn.Linear(256, 128),
            nn.GELU(),
            nn.Linear(128, 1),
        )

    def forward(self, x):
        x = self.input_bn(x)

        # Block 1 (no residual — dimension change)
        h = self.block1(x)

        # Block 2 with residual
        h = h + self.block2(h)

        # Block 3 with residual
        h = h + self.block3(h)

        # Block 4 (dimension reduction)
        h = self.block4(h)

        # Multi-task outputs
        deaths = self.deaths_head(h)
        overdoses = self.overdoses_head(h)
        treated = self.treated_head(h)
        lives_saved = self.lives_saved_head(h)

        return torch.cat([deaths, overdoses, treated, lives_saved], dim=-1)


# County parameter lookup for building feature vectors
COUNTY_PARAMS = {
    "Marion":      (971102, 0.005, 0.04, 0.08, 0.015),
    "Lake":        (498558, 0.005, 0.04, 0.08, 0.015),
    "Allen":       (388608, 0.005, 0.04, 0.08, 0.015),
    "St. Joseph":  (272212, 0.005, 0.04, 0.08, 0.015),
    "Vanderburgh": (179987, 0.005, 0.04, 0.08, 0.016),
    "Tippecanoe":  (187076, 0.005, 0.04, 0.08, 0.014),
    "Delaware":    (111871, 0.006, 0.05, 0.09, 0.018),
    "Vigo":        (105994, 0.006, 0.05, 0.09, 0.017),
    "Madison":     (130782, 0.006, 0.05, 0.09, 0.018),
    "Grant":       (66263,  0.007, 0.05, 0.09, 0.019),
    "Lawrence":    (45070,  0.007, 0.05, 0.09, 0.018),
    "Floyd":       (80454,  0.006, 0.05, 0.09, 0.017),
    "Clark":       (122738, 0.006, 0.05, 0.09, 0.017),
    "Scott":       (24355,  0.010, 0.07, 0.12, 0.025),
    "Fayette":     (23360,  0.009, 0.07, 0.11, 0.023),
    "Jay":         (20248,  0.008, 0.06, 0.10, 0.020),
    "Blackford":   (12091,  0.009, 0.06, 0.11, 0.022),
    "Vermillion":  (15341,  0.008, 0.06, 0.10, 0.021),
    "Wayne":       (66456,  0.008, 0.06, 0.10, 0.020),
    "Henry":       (48935,  0.008, 0.06, 0.10, 0.019),
}


def load_training_data(data_path: str, device: str = "cuda"):
    """Load GPU simulation results and prepare training tensors."""
    with open(data_path) as f:
        data = json.load(f)

    print(f"Loaded {len(data):,} scenarios from {data_path}")

    # Build feature and target tensors
    features = []
    targets = []

    for row in data:
        county = row["county"]
        params = COUNTY_PARAMS[county]
        pop, presc, mis, oud, od = params

        feat = [
            pop / 1_000_000,  # normalize population to millions
            presc * 100,      # scale rates to percentages
            mis * 100,
            oud * 100,
            od * 100,
            row["naloxone"],
            row["prescribing"],
            row["treatment"],
        ]
        features.append(feat)

        tgt = [
            row["total_deaths"],
            row["total_overdoses"],
            row["total_treated"],
            row["lives_saved"],
        ]
        targets.append(tgt)

    X = torch.tensor(features, dtype=torch.float32, device=device)
    y = torch.tensor(targets, dtype=torch.float32, device=device)

    return X, y


def train_model(
    data_path: str = "data/processed/gpu_results/gpu_simulation_results.json",
    output_dir: str = "ml/models",
    epochs: int = 200,
    batch_size: int = 2048,
    lr: float = 1e-3,
):
    """Train the surrogate model on GPU simulation data."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Training device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # Load data
    X, y = load_training_data(data_path, device)
    n = X.shape[0]

    # Normalize targets for more stable training
    y_mean = y.mean(dim=0)
    y_std = y.std(dim=0) + 1e-8
    y_norm = (y - y_mean) / y_std

    # Train/val split (90/10)
    n_train = int(0.9 * n)
    indices = torch.randperm(n, device=device)
    train_idx = indices[:n_train]
    val_idx = indices[n_train:]

    X_train, y_train = X[train_idx], y_norm[train_idx]
    X_val, y_val = X[val_idx], y_norm[val_idx]

    print(f"Training: {n_train:,} samples, Validation: {n - n_train:,} samples")
    print(f"Input dim: {X.shape[1]}, Output dim: {y.shape[1]}")

    # Model
    model = OpioidSurrogateNet(input_dim=X.shape[1]).to(device)
    param_count = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {param_count:,}")

    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.HuberLoss(delta=1.0)

    # Training loop
    best_val_loss = float("inf")
    best_epoch = 0
    t0 = time.time()

    for epoch in range(epochs):
        model.train()
        # Shuffle training data
        perm = torch.randperm(n_train, device=device)
        epoch_loss = 0
        n_batches = 0

        for i in range(0, n_train, batch_size):
            batch_idx = perm[i : i + batch_size]
            xb = X_train[batch_idx]
            yb = y_train[batch_idx]

            pred = model(xb)
            loss = criterion(pred, yb)

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            epoch_loss += loss.item()
            n_batches += 1

        scheduler.step()
        avg_train_loss = epoch_loss / n_batches

        # Validation
        model.eval()
        with torch.no_grad():
            val_pred = model(X_val)
            val_loss = criterion(val_pred, y_val).item()

            # R² score on original scale
            val_pred_orig = val_pred * y_std + y_mean
            val_y_orig = y_val * y_std + y_mean
            ss_res = ((val_y_orig - val_pred_orig) ** 2).sum(dim=0)
            ss_tot = ((val_y_orig - val_y_orig.mean(dim=0)) ** 2).sum(dim=0)
            r2_scores = (1 - ss_res / ss_tot).cpu().numpy()

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_epoch = epoch
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

        if (epoch + 1) % 20 == 0 or epoch == 0:
            elapsed = time.time() - t0
            print(
                f"Epoch {epoch+1:3d}/{epochs} | "
                f"Train: {avg_train_loss:.4f} | Val: {val_loss:.4f} | "
                f"R² deaths: {r2_scores[0]:.4f} | R² lives_saved: {r2_scores[3]:.4f} | "
                f"LR: {scheduler.get_last_lr()[0]:.2e} | {elapsed:.1f}s"
            )

    elapsed = time.time() - t0
    print(f"\nTraining complete in {elapsed:.1f}s")
    print(f"Best validation loss: {best_val_loss:.4f} (epoch {best_epoch + 1})")

    # Save model
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    model.load_state_dict(best_state)
    model = model.to(device)

    # Final evaluation
    model.eval()
    with torch.no_grad():
        all_pred = model(X) * y_std + y_mean
        ss_res = ((y - all_pred) ** 2).sum(dim=0)
        ss_tot = ((y - y.mean(dim=0)) ** 2).sum(dim=0)
        final_r2 = (1 - ss_res / ss_tot).cpu().numpy()
        mae = (y - all_pred).abs().mean(dim=0).cpu().numpy()

    output_names = ["total_deaths", "total_overdoses", "total_treated", "lives_saved"]
    print(f"\nFinal R² scores:")
    for name, r2, m in zip(output_names, final_r2, mae):
        print(f"  {name:20s}: R² = {r2:.4f}, MAE = {m:.1f}")

    # Save everything
    save_dict = {
        "model_state": best_state,
        "y_mean": y_mean.cpu(),
        "y_std": y_std.cpu(),
        "input_dim": X.shape[1],
        "hidden_dim": 512,
        "output_names": output_names,
        "r2_scores": {n: float(r) for n, r in zip(output_names, final_r2)},
        "mae_scores": {n: float(m) for n, m in zip(output_names, mae)},
        "training_samples": n,
        "epochs": epochs,
        "best_epoch": best_epoch + 1,
        "training_time_sec": round(elapsed, 2),
    }
    model_path = output_path / "surrogate_model.pt"
    torch.save(save_dict, model_path)
    print(f"\nModel saved to {model_path}")

    # Also save a summary JSON for the API/frontend
    summary = {
        "model_type": "OpioidSurrogateNet (PyTorch MLP)",
        "parameters": param_count,
        "training_samples": n,
        "epochs": epochs,
        "best_epoch": best_epoch + 1,
        "training_time_sec": round(elapsed, 2),
        "r2_scores": {n: round(float(r), 4) for n, r in zip(output_names, final_r2)},
        "mae_scores": {n: round(float(m), 1) for n, m in zip(output_names, mae)},
        "device": device,
        "gpu_name": torch.cuda.get_device_name(0) if device == "cuda" else "N/A",
    }
    with open(output_path / "training_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    return summary


if __name__ == "__main__":
    train_model()
