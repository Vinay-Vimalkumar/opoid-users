#!/bin/bash
#SBATCH --job-name=drugdiffuse-sim
#SBATCH --output=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/sim-%A_%a.out
#SBATCH --error=/scratch/gautschi/vvimalku/drugdiffuse/simulation/cluster/logs/sim-%A_%a.err
#SBATCH --array=0-19
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=2
#SBATCH --time=00:10:00
#SBATCH --partition=cpu
#SBATCH --account=mlp
#SBATCH --qos=normal

# DrugDiffuse: Run simulation scenarios for each Indiana county
# Each array task handles one county (20 counties, indices 0-19)
# Each county: 125 intervention combos × 5 seeds = 625 scenarios

PROJECT_DIR=/scratch/gautschi/vvimalku/drugdiffuse

cd ${PROJECT_DIR}/simulation

echo "=== DrugDiffuse Simulation ==="
echo "County index: ${SLURM_ARRAY_TASK_ID}"
echo "Node: $(hostname)"
echo "Start: $(date)"
echo ""

python run_county.py \
    --county-index ${SLURM_ARRAY_TASK_ID} \
    --output ${PROJECT_DIR}/data/processed/cluster_results/

echo ""
echo "End: $(date)"
