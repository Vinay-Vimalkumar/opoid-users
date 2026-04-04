#!/bin/bash
#SBATCH --job-name=drugdiffuse-h100
#SBATCH --output=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/h100_full-%j.out
#SBATCH --error=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/h100_full-%j.err
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=14
#SBATCH --gpus-per-node=1
#SBATCH --time=01:00:00
#SBATCH --partition=ai
#SBATCH --account=mlp
#SBATCH --qos=normal

PROJECT_DIR=/scratch/gautschi/vvimalku/drugdiffuse
cd ${PROJECT_DIR}

echo "=============================================="
echo "DrugDiffuse — Full H100 Pipeline"
echo "Node: $(hostname)"
echo "GPU: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader)"
echo "Start: $(date)"
echo "=============================================="

nvidia-smi

# ── Step 1: Massive GPU simulation (21 levels × 20 counties × 50 seeds = 1,852,200 scenarios)
echo ""
echo ">>> STEP 1: Massive GPU simulation (1.85M scenarios)..."
python simulation/gpu_model.py --levels 21 --seeds 50

# ── Step 2: Train deep learning surrogate (500 epochs on massive data)
echo ""
echo ">>> STEP 2: Training deep surrogate (500 epochs)..."
python ml/train_deep.py --epochs 500 --batch-size 4096

# ── Step 3: Train LSTM forecaster on real CDC data
echo ""
echo ">>> STEP 3: Training LSTM forecaster (500 epochs)..."
python ml/forecast.py --epochs 500

# ── Step 4: Monte Carlo uncertainty quantification
echo ""
echo ">>> STEP 4: Monte Carlo uncertainty (10K runs per county)..."
python simulation/monte_carlo_gpu.py

# ── Step 5: Train XGBoost on enriched data
echo ""
echo ">>> STEP 5: Training XGBoost..."
python ml/train_model.py

# ── Step 6: Gradient optimization all counties × budgets
echo ""
echo ">>> STEP 6: Gradient optimization..."
python ml/gradient_optimizer.py

# ── Step 7: Counterfactual analysis
echo ""
echo ">>> STEP 7: Counterfactual analysis..."
python simulation/counterfactual.py

echo ""
echo "=============================================="
echo "PIPELINE COMPLETE"
echo "End: $(date)"
echo "=============================================="
echo ""
echo "Output files:"
ls -lh data/processed/gpu_results/
ls -lh data/processed/*.json
ls -lh ml/models/
ls -lh ml/xgb_model.json
