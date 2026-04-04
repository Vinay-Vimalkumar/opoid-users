#!/bin/bash
#SBATCH --job-name=drugdiffuse-train
#SBATCH --output=/scratch/gautschi/vvimalku/drugdiffuse/ml/cluster/logs/train-%j.out
#SBATCH --error=/scratch/gautschi/vvimalku/drugdiffuse/ml/cluster/logs/train-%j.err
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=14
#SBATCH --gpus-per-node=1
#SBATCH --time=00:30:00
#SBATCH --partition=ai
#SBATCH --account=mlp
#SBATCH --qos=normal

# DrugDiffuse: Train deep learning surrogate model on GPU simulation data

PROJECT_DIR=/scratch/gautschi/vvimalku/drugdiffuse

echo "=== DrugDiffuse DL Training ==="
echo "Node: $(hostname)"
echo "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'unknown')"
echo "Start: $(date)"
echo ""

cd ${PROJECT_DIR}

python ml/train_deep.py

echo ""
echo "=== Training Complete ==="
echo "End: $(date)"
