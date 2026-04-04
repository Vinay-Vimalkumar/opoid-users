#!/bin/bash
#SBATCH --job-name=drugdiffuse-gpu-sim
#SBATCH --output=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/gpu_sim-%j.out
#SBATCH --error=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/gpu_sim-%j.err
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=14
#SBATCH --gpus-per-node=1
#SBATCH --time=00:30:00
#SBATCH --partition=ai
#SBATCH --account=mlp
#SBATCH --qos=normal

# DrugDiffuse: GPU-accelerated simulation
# Runs 266,200 scenarios in parallel on H100

PROJECT_DIR=/scratch/gautschi/vvimalku/drugdiffuse

echo "=== DrugDiffuse GPU Simulation ==="
echo "Node: $(hostname)"
echo "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'unknown')"
echo "Start: $(date)"
echo ""

cd ${PROJECT_DIR}

# Run GPU simulation (11 intervention levels × 20 counties × 10 seeds = 266,200 scenarios)
python simulation/gpu_model.py

echo ""
echo "=== GPU Simulation Complete ==="
echo "End: $(date)"
