#!/bin/bash
#SBATCH --job-name=drugdiffuse-full
#SBATCH --output=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/full_pipeline-%j.out
#SBATCH --error=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/full_pipeline-%j.err
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=14
#SBATCH --gpus-per-node=1
#SBATCH --time=01:00:00
#SBATCH --partition=ai
#SBATCH --account=mlp
#SBATCH --qos=normal

# DrugDiffuse: Full Pipeline
# 1. Calibrate model to real CDC data (CPU, ~5 min)
# 2. GPU simulation with calibrated params (GPU, ~30 sec)
# 3. Train deep learning surrogate (GPU, ~2 min)
# 4. Train LSTM forecaster on real data (GPU, ~2 min)
# 5. Gradient-based optimization (CPU, ~1 min)
# 6. Counterfactual analysis (CPU, ~30 sec)

PROJECT_DIR=/scratch/gautschi/vvimalku/drugdiffuse
cd ${PROJECT_DIR}

echo "=============================================="
echo "DrugDiffuse Full Pipeline"
echo "Node: $(hostname)"
echo "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'N/A')"
echo "Start: $(date)"
echo "=============================================="

# Step 1: Calibrate model to real CDC data
echo ""
echo ">>> STEP 1: Calibrating model to real CDC data..."
python simulation/calibrate.py
echo ">>> Step 1 complete: $(date)"

# Step 2: GPU simulation (266K scenarios)
echo ""
echo ">>> STEP 2: Running GPU-accelerated simulation..."
python simulation/gpu_model.py
echo ">>> Step 2 complete: $(date)"

# Step 3: Train deep learning surrogate
echo ""
echo ">>> STEP 3: Training deep learning surrogate model..."
python ml/train_deep.py
echo ">>> Step 3 complete: $(date)"

# Step 4: Train LSTM forecaster on real CDC data
echo ""
echo ">>> STEP 4: Training LSTM forecaster..."
python ml/forecast.py
echo ">>> Step 4 complete: $(date)"

# Step 5: Gradient-based optimization
echo ""
echo ">>> STEP 5: Running gradient-based optimization..."
python ml/gradient_optimizer.py
echo ">>> Step 5 complete: $(date)"

# Step 6: Counterfactual analysis
echo ""
echo ">>> STEP 6: Running counterfactual analyses..."
python simulation/counterfactual.py
echo ">>> Step 6 complete: $(date)"

echo ""
echo "=============================================="
echo "PIPELINE COMPLETE"
echo "End: $(date)"
echo "=============================================="
echo ""
echo "Results:"
ls -la ${PROJECT_DIR}/data/processed/*.json
ls -la ${PROJECT_DIR}/ml/models/
