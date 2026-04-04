#!/bin/bash
#SBATCH --job-name=drugdiffuse-sim
#SBATCH --output=/home/kkuatova/opoid-users/simulation/cluster/logs/sim-%A_%a.out
#SBATCH --array=0-19
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=2
#SBATCH --mem=4G
#SBATCH --time=00:30:00
#SBATCH --partition=cpu
#SBATCH --account=mlp

# Run on Gautschi cluster
# Each array task handles one county (20 counties total)

cd /home/kkuatova/opoid-users
export PYTHONPATH=/home/kkuatova/.local/lib/python3.9/site-packages:$PYTHONPATH

python3 simulation/run_county.py --county-index $SLURM_ARRAY_TASK_ID \
    --output /home/kkuatova/opoid-users/data/processed/cluster_results/
