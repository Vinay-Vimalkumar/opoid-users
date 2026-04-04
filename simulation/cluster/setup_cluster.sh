#!/bin/bash
# Setup script for Gautschi cluster
# Run this first: bash simulation/cluster/setup_cluster.sh

set -e

echo "Setting up DrugDiffuse on Gautschi..."

cd $SCRATCH
mkdir -p drugdiffuse/results
cp -r ~/drugdiffuse/* $SCRATCH/drugdiffuse/ 2>/dev/null || true

# Install dependencies
pip install --target=$SCRATCH/pylibs numpy scipy xgboost pandas scikit-learn joblib
export PYTHONPATH=$SCRATCH/pylibs:$PYTHONPATH

echo "Setup complete. Submit jobs with:"
echo "  cd $SCRATCH/drugdiffuse && sbatch simulation/cluster/run_sim.slurm"
