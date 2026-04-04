#!/bin/bash
#SBATCH --job-name=drugdiffuse-xgb
#SBATCH --output=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/xgb_train-%j.out
#SBATCH --error=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/xgb_train-%j.err
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=14
#SBATCH --gpus-per-node=1
#SBATCH --time=00:15:00
#SBATCH --partition=ai
#SBATCH --account=mlp
#SBATCH --qos=normal

cd /scratch/gautschi/vvimalku/drugdiffuse

echo "=== XGBoost Training ==="
echo "Node: $(hostname)"
echo "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null)"
echo "Start: $(date)"

# Train XGBoost on 133K scenarios
python ml/train_model.py

# Regenerate simulation scenarios with latest model too
python simulation/generate_scenarios.py

echo "End: $(date)"
