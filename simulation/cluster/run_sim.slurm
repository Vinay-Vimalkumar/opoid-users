#!/bin/bash
#SBATCH --job-name=drugdiffuse-sim
#SBATCH --output=drugdiffuse-%A_%a.out
#SBATCH --array=0-19
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=2
#SBATCH --mem=4G
#SBATCH --time=00:30:00
#SBATCH --partition=shared

# Run on Gautschi cluster
# Each array task handles one county (20 counties total)

cd $SCRATCH/drugdiffuse
export PYTHONPATH=$SCRATCH/pylibs:$PYTHONPATH

python simulation/run_county.py --county-index $SLURM_ARRAY_TASK_ID --output $SCRATCH/drugdiffuse/results/
