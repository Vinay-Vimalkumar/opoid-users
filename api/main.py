"""
FastAPI backend for DrugDiffuse.
All API endpoints are served under /api/.
Frontend static build is served from frontend/dist/.
"""

import sys
from pathlib import Path

# Add parent paths for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "simulation"))
sys.path.insert(0, str(Path(__file__).parent.parent / "ml"))

from fastapi import FastAPI, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Optional
import json
import numpy as np

from model import COUNTY_MAP, INDIANA_COUNTIES, Interventions, run_scenario, run_baseline, CountyParams
from optimize import find_optimal, load_model, optimize_portfolio

BASE_DIR = Path(__file__).parent.parent
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
COUNTY_PROFILES_PATH = BASE_DIR / "data" / "processed" / "county_profiles.json"
MODEL_PATH = BASE_DIR / "ml" / "xgb_model.json"
COUNTERFACTUAL_PATH = BASE_DIR / "data" / "processed" / "counterfactual_results.json"
CALIBRATION_PATH = BASE_DIR / "data" / "processed" / "calibration_results.json"
FORECAST_PATH = BASE_DIR / "data" / "processed" / "county_forecasts.json"
TIMESERIES_PATH = BASE_DIR / "data" / "processed" / "county_timeseries.json"
OPTIMIZATION_PATH = BASE_DIR / "data" / "processed" / "gradient_optimization_results.json"

app = FastAPI(title="DrugDiffuse API", version="1.0.0")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Models ---

class SimulateRequest(BaseModel):
    county: str
    naloxone: float = Field(ge=0, le=1)
    prescribing: float = Field(ge=0, le=1)
    treatment: float = Field(ge=0, le=1)
    months: int = Field(default=60, ge=1, le=120)
    seed: int = 42


class OptimizeRequest(BaseModel):
    county: str
    budget: float = Field(gt=0)
    months: int = Field(default=60, ge=1, le=120)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    county: Optional[str] = None
    history: Optional[List[ChatMessage]] = None


class CompareRequest(BaseModel):
    counties: List[str]


class MonteCarloRequest(BaseModel):
    county: str
    naloxone: float = Field(ge=0, le=1)
    prescribing: float = Field(ge=0, le=1)
    treatment: float = Field(ge=0, le=1)
    months: int = Field(default=60, ge=1, le=120)
    num_seeds: int = Field(default=50, ge=5, le=200)


class FrontierRequest(BaseModel):
    county: str
    budget_max: float = Field(default=10_000_000, gt=0)
    steps: int = Field(default=20, ge=5, le=50)


class PortfolioRequest(BaseModel):
    counties: Optional[List[str]] = None  # None = all 20 counties
    total_budget: float = Field(gt=0)
    months: int = Field(default=60, ge=1, le=120)
    budget_steps: int = Field(default=50, ge=10, le=100)


# --- API Endpoints (all under /api) ---

@api.get("/health")
def health():
    return {
        "status": "ok",
        "counties": len(INDIANA_COUNTIES),
        "model_loaded": MODEL_PATH.exists(),
    }


@api.get("/counties")
def list_counties():
    return [
        {"name": c.name, "population": c.population}
        for c in INDIANA_COUNTIES
    ]


@api.get("/feature_importance")
def feature_importance():
    fi_path = BASE_DIR / "ml" / "feature_importance.json"
    if not fi_path.exists():
        raise HTTPException(404, "Feature importance not computed. Run: python ml/train_model.py")
    with open(fi_path) as f:
        return json.load(f)


@api.get("/timeseries/{name}")
def get_timeseries(name: str):
    ts_path = BASE_DIR / "data" / "processed" / "indiana_overdose_timeseries.json"
    if not ts_path.exists():
        raise HTTPException(404, "Timeseries data not generated. Run: python data/process_real_data.py")
    with open(ts_path) as f:
        all_ts = json.load(f)
    if name not in all_ts:
        raise HTTPException(404, f"No timeseries data for county '{name}'")
    return all_ts[name]


@api.get("/summary")
def get_summary():
    summary_path = BASE_DIR / "data" / "processed" / "indiana_summary.json"
    if not summary_path.exists():
        raise HTTPException(404, "Summary data not generated. Run: python data/process_real_data.py")
    with open(summary_path) as f:
        return json.load(f)


@api.get("/county/{name}")
def get_county(name: str):
    if name not in COUNTY_MAP:
        raise HTTPException(404, f"County '{name}' not found")

    if COUNTY_PROFILES_PATH.exists():
        try:
            with open(COUNTY_PROFILES_PATH, "r") as f:
                profiles = json.load(f)
            if isinstance(profiles, dict):
                profile = profiles.get(name)
            elif isinstance(profiles, list):
                profile = next((p for p in profiles if p.get("name") == name or p.get("county") == name), None)
            else:
                profile = None
            if profile:
                return profile
        except (json.JSONDecodeError, IOError):
            pass

    county = COUNTY_MAP[name]
    return {"name": county.name, "population": county.population}


@api.post("/compare")
def compare(req: CompareRequest):
    if not req.counties:
        raise HTTPException(400, "Must provide at least one county")

    results = []
    errors = []
    for name in req.counties:
        if name not in COUNTY_MAP:
            errors.append(f"County '{name}' not found")
            continue
        county = COUNTY_MAP[name]
        result = run_baseline(county)
        results.append({
            "county": result.county,
            "months": result.months,
            "baseline_deaths": result.total_deaths,
            "total_overdoses": result.total_overdoses,
            "population": county.population,
            "deaths_per_100k": round(result.total_deaths / county.population * 100_000, 1),
        })

    response = {"results": results}
    if errors:
        response["errors"] = errors
    return response


@api.post("/simulate")
def simulate(req: SimulateRequest):
    if req.county not in COUNTY_MAP:
        raise HTTPException(404, f"County '{req.county}' not found")

    county = COUNTY_MAP[req.county]
    interventions = Interventions(req.naloxone, req.prescribing, req.treatment)

    result = run_scenario(county, interventions, months=req.months, seed=req.seed)
    baseline = run_baseline(county, months=req.months, seed=req.seed)
    lives_saved = max(0, baseline.total_deaths - result.total_deaths)
    result.lives_saved = lives_saved

    effective_rates = {
        "prescribing_rate": round(county.prescribing_rate * (1 - 0.6 * req.prescribing), 5),
        "fatality_rate": round(county.fatality_rate * (1 - 0.5 * req.naloxone), 4),
        "treatment_entry_rate": round(county.treatment_entry_rate * (1 + req.treatment), 4),
        "treatment_success_rate": round(min(1.0, county.treatment_success_rate * (1 + 0.3 * req.treatment)), 4),
    }

    return {
        "county": result.county,
        "interventions": result.interventions,
        "months": result.months,
        "total_deaths": result.total_deaths,
        "total_overdoses": result.total_overdoses,
        "total_treated": result.total_treated,
        "lives_saved": lives_saved,
        "cost": result.cost,
        "cost_per_life_saved": round(result.cost / lives_saved, 2) if lives_saved > 0 else None,
        "timeline": result.timeline,
        "baseline_deaths": baseline.total_deaths,
        "baseline_overdoses": baseline.total_overdoses,
        "overdoses_prevented": max(0, baseline.total_overdoses - result.total_overdoses),
        "deaths_per_100k": round(result.total_deaths / county.population * 100_000, 1),
        "baseline_deaths_per_100k": round(baseline.total_deaths / county.population * 100_000, 1),
        "effective_rates": effective_rates,
    }


@api.post("/baseline")
def baseline(county: str, months: int = 60, seed: int = 42):
    if county not in COUNTY_MAP:
        raise HTTPException(404, f"County '{county}' not found")

    result = run_baseline(COUNTY_MAP[county], months=months, seed=seed)
    return {
        "county": result.county,
        "months": result.months,
        "total_deaths": result.total_deaths,
        "total_overdoses": result.total_overdoses,
        "timeline": result.timeline,
    }


@api.post("/montecarlo")
def montecarlo(req: MonteCarloRequest):
    if req.county not in COUNTY_MAP:
        raise HTTPException(404, f"County '{req.county}' not found")

    county = COUNTY_MAP[req.county]
    interventions = Interventions(req.naloxone, req.prescribing, req.treatment)

    all_timelines = []
    all_deaths = []
    all_lives_saved = []

    for seed in range(req.num_seeds):
        result = run_scenario(county, interventions, months=req.months, seed=seed)
        bl = run_baseline(county, months=req.months, seed=seed)
        lives = max(0, bl.total_deaths - result.total_deaths)
        all_deaths.append(result.total_deaths)
        all_lives_saved.append(lives)
        all_timelines.append(result.timeline)

    months_data = {}
    for m in range(req.months):
        deaths_at_m = [t[m]["cumulative_deaths"] for t in all_timelines]
        deaths_at_m.sort()
        n = len(deaths_at_m)
        months_data[m] = {
            "month": m,
            "median": deaths_at_m[n // 2],
            "p10": deaths_at_m[max(0, n // 10)],
            "p90": deaths_at_m[min(n - 1, 9 * n // 10)],
            "min": deaths_at_m[0],
            "max": deaths_at_m[-1],
        }

    all_deaths.sort()
    all_lives_saved.sort()
    n = len(all_deaths)

    return {
        "county": req.county,
        "num_seeds": req.num_seeds,
        "deaths_median": all_deaths[n // 2],
        "deaths_p10": all_deaths[max(0, n // 10)],
        "deaths_p90": all_deaths[min(n - 1, 9 * n // 10)],
        "lives_saved_median": all_lives_saved[n // 2],
        "lives_saved_p10": all_lives_saved[max(0, n // 10)],
        "lives_saved_p90": all_lives_saved[min(n - 1, 9 * n // 10)],
        "timeline": months_data,
        "cost": result.cost,
    }


@api.post("/frontier")
def cost_effectiveness_frontier(req: FrontierRequest):
    if req.county not in COUNTY_MAP:
        raise HTTPException(404, f"County '{req.county}' not found")

    if not MODEL_PATH.exists():
        raise HTTPException(503, "XGBoost model not found. Run: python ml/train_model.py")

    budget_step = req.budget_max / req.steps
    frontier = []

    for step in range(req.steps + 1):
        budget = budget_step * step
        result = find_optimal(req.county, budget, months=req.months)
        frontier.append({
            "budget": round(budget, 0),
            "best_lives_saved": result["estimated_lives_saved"],
            "best_cost": result["estimated_cost"],
            "best_interventions": result["optimal_interventions"],
        })

    return {"county": req.county, "frontier": frontier}


@api.post("/optimize")
def optimize(req: OptimizeRequest):
    if req.county not in COUNTY_MAP:
        raise HTTPException(404, f"County '{req.county}' not found")

    if not MODEL_PATH.exists():
        raise HTTPException(
            503,
            "XGBoost model not found. Please train it first by running: "
            "python ml/train_model.py"
        )

    try:
        result = find_optimal(req.county, req.budget, months=req.months)
        return result
    except Exception as e:
        raise HTTPException(500, f"Optimization failed: {str(e)}")


@api.post("/optimize-portfolio")
def optimize_portfolio_endpoint(req: PortfolioRequest):
    """
    Allocate a fixed total budget across multiple counties to maximize
    total estimated lives saved. Uses DP knapsack over the ML model.
    """
    if not MODEL_PATH.exists():
        raise HTTPException(503, "XGBoost model not found. Run: python ml/train_model.py")

    county_names = req.counties or [c.name for c in INDIANA_COUNTIES]
    invalid = [n for n in county_names if n not in COUNTY_MAP]
    if invalid:
        raise HTTPException(400, f"Unknown counties: {invalid}")

    try:
        result = optimize_portfolio(
            county_names=county_names,
            total_budget=req.total_budget,
            months=req.months,
            budget_steps=req.budget_steps,
        )
        return result
    except Exception as e:
        raise HTTPException(500, f"Portfolio optimization failed: {str(e)}")


@api.get("/timeseries")
def timeseries():
    """Return CDC death rate timeseries (2003-2021) per county for time machine."""
    if not TIMESERIES_PATH.exists():
        raise HTTPException(503, "Timeseries data not found")
    with open(TIMESERIES_PATH) as f:
        return json.load(f)


class PolicyLetterRequest(BaseModel):
    county: str
    budget: float = 2000000
    naloxone: float = Field(ge=0, le=1, default=0.5)
    prescribing: float = Field(ge=0, le=1, default=0.3)
    treatment: float = Field(ge=0, le=1, default=0.5)


@api.post("/policy-letter")
def policy_letter(req: PolicyLetterRequest):
    """Generate a policy recommendation letter with specific numbers."""
    if req.county not in COUNTY_MAP:
        raise HTTPException(404, f"County '{req.county}' not found")

    county = COUNTY_MAP[req.county]
    interventions = Interventions(req.naloxone, req.prescribing, req.treatment)
    result = run_scenario(county, interventions)
    baseline = run_baseline(county)
    lives_saved = max(0, baseline.total_deaths - result.total_deaths)
    reduction_pct = round(lives_saved / max(baseline.total_deaths, 1) * 100, 1)
    cost_per_life = round(result.cost / max(lives_saved, 1))

    letter = f"""POLICY RECOMMENDATION MEMO
DrugDiffuse Simulation Analysis
{'='*50}

TO:      {req.county} County Health Department
FROM:    DrugDiffuse Policy Simulator
DATE:    Generated via CDC-calibrated epidemiological model
RE:      Opioid Intervention Strategy — 5-Year Projection

{'='*50}

EXECUTIVE SUMMARY

Based on our simulation of {req.county} County (population {county.population:,}),
the recommended intervention strategy would save an estimated {lives_saved:,} lives
over 5 years, representing a {reduction_pct}% reduction in overdose deaths.

RECOMMENDED INTERVENTION LEVELS

  Naloxone Access:         {round(req.naloxone * 100)}%
  Prescribing Reduction:   {round(req.prescribing * 100)}%
  Treatment Expansion:     {round(req.treatment * 100)}%

PROJECTED OUTCOMES (5-Year)

  Baseline deaths (no action):    {baseline.total_deaths:,}
  Deaths with intervention:       {result.total_deaths:,}
  Lives saved:                    {lives_saved:,}
  Mortality reduction:            {reduction_pct}%

COST ANALYSIS

  Total program cost:             ${result.cost:,.0f}
  Cost per life saved:            ${cost_per_life:,}
  Budget requested:               ${req.budget:,.0f}

INTERVENTION BREAKDOWN

  Naloxone Distribution ({round(req.naloxone * 100)}%):
    - {round(req.naloxone * county.population / 500):,} kits distributed per month
    - Reduces overdose fatality rate by up to {round(req.naloxone * 50)}%

  Prescribing Reduction ({round(req.prescribing * 100)}%):
    - Reduces new opioid prescriptions by {round(req.prescribing * 60)}%
    - Prevents entry into the misuse-to-OUD pipeline

  Treatment Expansion ({round(req.treatment * 100)}%):
    - {round(req.treatment * county.population * 0.001):,} additional treatment slots
    - Increases treatment entry rate by {round(req.treatment * 100)}%
    - Improves treatment success by {round(req.treatment * 30)}%

{'='*50}

METHODOLOGY

This analysis uses a 7-compartment stochastic epidemiological model
calibrated to 19 years of CDC Drug Poisoning Mortality data (2003-2021).
Model parameters were fit using differential evolution optimization.
Simulation was run on the Purdue Gautschi HPC cluster (NVIDIA H100).

Model R² = 0.71 (mean across 20 Indiana counties).

DISCLAIMER: This is a simplified simulation model for policy exploration
purposes. Actual outcomes will vary based on implementation, local
conditions, and factors not captured in the model.

Generated by DrugDiffuse — Catapult Hackathon 2026
"""

    return {
        "county": req.county,
        "letter": letter,
        "stats": {
            "lives_saved": lives_saved,
            "reduction_pct": reduction_pct,
            "cost": round(result.cost),
            "cost_per_life": cost_per_life,
            "baseline_deaths": baseline.total_deaths,
            "intervention_deaths": result.total_deaths,
        }
    }


@api.post("/roadmap")
def generate_roadmap(req: PolicyLetterRequest):
    """Generate a 12-month phased implementation roadmap."""
    if req.county not in COUNTY_MAP:
        raise HTTPException(404, f"County '{req.county}' not found")

    county = COUNTY_MAP[req.county]
    interventions = Interventions(req.naloxone, req.prescribing, req.treatment)
    result = run_scenario(county, interventions)
    baseline = run_baseline(county)
    lives_saved = max(0, baseline.total_deaths - result.total_deaths)
    monthly_lives = round(lives_saved / 60, 1)
    kits_per_month = round(req.naloxone * county.population / 500)
    treatment_slots = round(req.treatment * county.population * 0.001)

    phases = [
        {
            "phase": "Phase 1: Foundation",
            "months": "Month 1-2",
            "actions": [
                f"Engage {req.county} County Health Department and local stakeholders",
                f"Procure initial naloxone supply ({kits_per_month} kits/month target)",
                "Establish PDMP compliance benchmarks with prescribers",
                f"Identify {treatment_slots} MAT treatment slot locations",
                "Baseline data collection: current overdose rates, ED visits, treatment utilization",
            ],
            "kpi": f"0 lives saved (setup phase)",
            "budget_pct": 15,
        },
        {
            "phase": "Phase 2: Pilot Launch",
            "months": "Month 3-6",
            "actions": [
                f"Deploy naloxone to {round(kits_per_month * 0.5)} sites (50% target capacity)",
                f"Begin prescribing reduction program ({round(req.prescribing * 30)}% of target reduction)",
                f"Open {round(treatment_slots * 0.4)} treatment slots (40% capacity)",
                "Weekly monitoring: overdose calls, naloxone administrations, treatment entries",
                "Adjust strategy based on first 90 days of data",
            ],
            "kpi": f"~{round(monthly_lives * 4)} lives saved (months 3-6), {round(req.prescribing * 18)}% Rx reduction achieved",
            "budget_pct": 30,
        },
        {
            "phase": "Phase 3: Scale",
            "months": "Month 7-12",
            "actions": [
                f"Scale naloxone to full deployment ({kits_per_month} kits/month)",
                f"Achieve {round(req.prescribing * 60)}% prescribing reduction target",
                f"Expand to {treatment_slots} treatment slots (full capacity)",
                "Community awareness campaign and stigma reduction",
                "Data-driven reallocation: shift budget to highest-performing interventions",
            ],
            "kpi": f"~{round(monthly_lives * 12)} cumulative lives saved by month 12",
            "budget_pct": 55,
            "scale_triggers": [
                f"If overdose deaths drop >20%: maintain current allocation",
                f"If drop <10%: shift 20% of naloxone budget to treatment",
                f"If treatment retention >60%: expand treatment slots by 25%",
            ],
        },
    ]

    return {
        "county": req.county,
        "population": county.population,
        "total_budget": round(result.cost),
        "five_year_lives_saved": lives_saved,
        "monthly_lives_saved": monthly_lives,
        "phases": phases,
        "annual_benchmarks": {
            "year_1": f"{round(monthly_lives * 12)} lives saved, {round(result.cost * 0.2):,} spent",
            "year_2": f"{round(monthly_lives * 24)} cumulative, full program operational",
            "year_3": f"{round(monthly_lives * 36)} cumulative, optimization phase",
            "year_5": f"{lives_saved} cumulative lives saved, program evaluation",
        },
    }


@api.get("/counterfactual")
def counterfactual():
    """Return pre-computed counterfactual analysis results."""
    if not COUNTERFACTUAL_PATH.exists():
        raise HTTPException(503, "Counterfactual data not found. Run: python simulation/counterfactual.py")
    with open(COUNTERFACTUAL_PATH) as f:
        return json.load(f)


@api.get("/calibration")
def calibration():
    """Return model calibration results (fitted params + R² per county)."""
    if not CALIBRATION_PATH.exists():
        raise HTTPException(503, "Calibration data not found. Run: python simulation/calibrate.py")
    with open(CALIBRATION_PATH) as f:
        return json.load(f)


@api.get("/forecasts")
def forecasts():
    """Return LSTM death rate forecasts per county."""
    if not FORECAST_PATH.exists():
        raise HTTPException(503, "Forecast data not found. Run: python ml/forecast.py")
    with open(FORECAST_PATH) as f:
        return json.load(f)


@api.get("/gradient-optimize/{county}")
def gradient_optimize(county: str, budget: float = 2000000):
    """Return pre-computed gradient optimization results for a county."""
    if not OPTIMIZATION_PATH.exists():
        raise HTTPException(503, "Gradient optimization not found. Run: python ml/gradient_optimizer.py")
    with open(OPTIMIZATION_PATH) as f:
        data = json.load(f)
    budget_key = f"budget_{int(budget)}"
    results = data.get(budget_key, [])
    match = next((r for r in results if r["county"] == county), None)
    if not match:
        raise HTTPException(404, f"No results for {county} at budget ${budget:,.0f}")
    return match


@api.post("/chat")
async def chat(req: ChatRequest):
    try:
        import anthropic
    except ImportError:
        raise HTTPException(500, "anthropic package not installed. Run: pip install anthropic")

    import os
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        env_path = BASE_DIR / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("ANTHROPIC_API_KEY="):
                    api_key = line.split("=", 1)[1].strip()

    if not api_key:
        raise HTTPException(503, "No ANTHROPIC_API_KEY found. Add it to .env file.")

    client = anthropic.Anthropic(api_key=api_key)
    county_list = ", ".join(c.name for c in INDIANA_COUNTIES)

    # Load key project data for context
    mc_summary = ""
    if (BASE_DIR / "data/processed/monte_carlo_results.json").exists():
        mc = json.load(open(BASE_DIR / "data/processed/monte_carlo_results.json"))
        marion_no = mc["results"].get("No Action", {}).get("Marion", {})
        marion_pb = mc["results"].get("Plan B", {}).get("Marion", {})
        mc_summary = f"""
Monte Carlo Results (800K simulations, 10K per county):
- Marion No Action: mean {marion_no.get('mean', '?')} deaths, 90% CI [{marion_no.get('p5', '?')}, {marion_no.get('p95', '?')}]
- Marion Plan B: mean {marion_pb.get('mean', '?')} deaths, 90% CI [{marion_pb.get('p5', '?')}, {marion_pb.get('p95', '?')}]"""

    cf_summary = ""
    if COUNTERFACTUAL_PATH.exists():
        cf = json.load(open(COUNTERFACTUAL_PATH))
        scott = cf.get("scott_county", {}).get("findings", {})
        statewide = cf.get("statewide_2016", {})
        cf_summary = f"""
Counterfactual Findings:
- Scott County: {scott.get('headline', 'N/A')}
- Statewide: {statewide.get('headline', 'N/A')}"""

    system_prompt = f"""You are DrugDiffuse AI — the intelligent assistant for Indiana's Opioid Policy Simulator. You have deep knowledge of the entire project.

## ABOUT DRUGDIFFUSE
DrugDiffuse is a CDC-calibrated epidemiological simulation tool that models the opioid crisis across 20 Indiana counties. Built at the Catapult Hackathon 2026 at Purdue University. It ran 9.26 million simulations on an NVIDIA H100 GPU in 0.43 seconds (21.7M scenarios/sec).

## THE 20 COUNTIES
{county_list}
Counties are categorized as: Large urban (Marion, Lake, Allen, St. Joseph, Vanderburgh, Tippecanoe), Mid-size (Delaware, Vigo, Madison, Grant, Lawrence, Floyd, Clark), Rural high-impact (Scott, Fayette, Jay, Blackford, Vermillion, Wayne, Henry).
Rural counties have HIGHER per-capita death rates despite smaller populations. Scott County has the highest rate (84.4/100K in 2021).

## THE MODEL
7-compartment stochastic model: General Pop → Prescribed → Misuse → OUD → Overdose → Death/Survived, with Treatment → Recovered → (relapse) pathway.
Parameters calibrated to 19 years of real CDC Drug Poisoning Mortality data (2003-2021) using differential evolution. Mean R² = 0.71 across all counties.

## THREE INTERVENTION LEVERS (each 0-100%)
1. Naloxone Access: Distributes overdose-reversal kits. Reduces fatality rate by up to 50%. Cost: ~$75/kit, ~population/500 kits per month at full deployment.
2. Prescribing Reduction: PDMPs and guidelines. Reduces new prescriptions by up to 60%. Cost: ~$500K per 10% reduction.
3. Treatment Access: MAT slots and recovery programs. Doubles treatment entry rate, +30% success. Cost: ~$10K/slot/year.

## KEY FINDINGS
{cf_summary}
{mc_summary}
- GPU throughput: 21.7M scenarios/sec on H100
- XGBoost model: R² = 0.99 for predicting lives saved
- LSTM forecaster trained on real CDC data (NOT simulation outputs)

## HOW TO USE THE APP (guide users to features)
- **Overview tab**: Landing page with stats, problem statement, how it works
- **Map & Simulator tab**: Interactive Leaflet map of Indiana. Click counties to select. Floating panels:
  - Top-left: Stats panel with S/M/L size toggle and 123/chart view toggle
  - Top-right: Toggle buttons for Timeline, Controls, Network, Time Machine, Fullscreen
  - Bottom-right: Intervention sliders with presets (None, Plan A, Plan B, Max)
  - "Download Policy Report" button generates a formal memo
- **Time Machine**: Click the button, then press play (▶) to watch 2003-2021 epidemic unfold on the map. Markers grow as death rates rise.
- **What If? tab**: Counterfactual analysis. Two sub-views:
  - Scott County: "What if interventions deployed before the 2015 HIV outbreak?"
  - Statewide: "What if Indiana acted in 2016?" Shows 5,146 saveable lives.
- **How It Works tab**: 6-step pipeline explanation with limitations section
- **Themes**: Click the palette icon in the header. 7 themes: Ember, Ocean, Emerald, Rose, Midnight, Light Blue, Monochrome.
- **Color schemes on map**: 5 palettes (Heat, Plasma, Viridis, Blues, Neon)
- **Tile layers on map**: 4 options (Dark, Minimal, Satellite, Light)

## HOW TO RESPOND
- Be concise and data-driven. Use specific numbers from the project.
- If a user asks about a county, reference its population, risk level, and death rate.
- If they ask for a recommendation, provide intervention levels as JSON:
```json
{{"county": "CountyName", "budget": 1000000, "naloxone": 0.7, "prescribing": 0.3, "treatment": 0.8}}
```
- If they ask navigation questions ("how do I see the time machine?"), give step-by-step instructions.
- If they ask about methodology, reference calibration, R² values, CDC data sources.
- Frame everything as policy exploration, NOT medical advice.
- Keep answers under 200 words unless the user asks for detail."""

    messages = []
    if req.history:
        for msg in req.history[-10:]:
            if msg.role in ("user", "assistant"):
                messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": req.message})

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    )

    ai_response = response.content[0].text

    import re
    json_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_response, re.DOTALL)

    sim_result = None
    if json_match:
        try:
            params = json.loads(json_match.group(1))
            county_name = params.get("county", req.county or "Marion")
            if county_name in COUNTY_MAP:
                interventions = Interventions(
                    params.get("naloxone", 0),
                    params.get("prescribing", 0),
                    params.get("treatment", 0),
                )
                county = COUNTY_MAP[county_name]
                result = run_scenario(county, interventions)
                bl = run_baseline(county)
                sim_result = {
                    "county": county_name,
                    "interventions": {"naloxone": params.get("naloxone", 0), "prescribing": params.get("prescribing", 0), "treatment": params.get("treatment", 0)},
                    "total_deaths": result.total_deaths,
                    "baseline_deaths": bl.total_deaths,
                    "lives_saved": max(0, bl.total_deaths - result.total_deaths),
                    "cost": result.cost,
                }
        except (json.JSONDecodeError, KeyError):
            pass

    return {
        "response": ai_response,
        "simulation": sim_result,
    }


# --- Register API router, then static files ---
app.include_router(api)

# Serve frontend static build
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        index_path = FRONTEND_DIST / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path), headers={"Cache-Control": "no-store, no-cache, must-revalidate"})
        raise HTTPException(404, "Frontend not built. Run: cd frontend && npm run build")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
