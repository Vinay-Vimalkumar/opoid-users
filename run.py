"""One-click startup for Morpheus. Just double-click this file or run: python run.py"""
import subprocess, sys, os, webbrowser, time, threading
from pathlib import Path
from multiprocessing import freeze_support

def main():
    os.chdir(Path(__file__).parent)

    # Ensure simulation data + model exist
    if not (Path("data/processed/simulation_results.json").exists() and Path("ml/xgb_model.json").exists()):
        print("First run — generating simulation data and training model...")
        subprocess.run([sys.executable, "simulation/generate_scenarios.py"], check=True)
        subprocess.run([sys.executable, "ml/train_model.py"], check=True)
        print()

    print("Starting Morpheus at http://localhost:8000")
    print("Press Ctrl+C to stop.\n")

    # Open browser after a short delay
    threading.Timer(2.0, lambda: webbrowser.open("http://localhost:8000")).start()

    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    freeze_support()
    main()
