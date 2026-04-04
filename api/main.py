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
        raise HTTPException(500, "anthropic package not installed")

    client = anthropic.Anthropic()
    county_list = ", ".join(c.name for c in INDIANA_COUNTIES)

    system_prompt = f"""You are DrugDiffuse, an AI assistant for opioid policy simulation in Indiana.

You help users explore intervention strategies for 20 Indiana counties.

Available counties: {county_list}

Three intervention levers (each 0-100%):
- Naloxone Access: Reduces overdose fatality rate by up to 50%. Cost: ~$75/kit.
- Prescribing Reduction: Reduces new opioid prescriptions by up to 60%. Cost: ~$500K per 10%.
- Treatment Access: Doubles treatment entry rate, +30% success. Cost: ~$10K/slot/year.

When a user asks about a specific county and budget, respond with:
1. A JSON block with the recommended intervention levels
2. A plain-English explanation of your recommendation

Format the JSON as:
```json
{{"county": "CountyName", "budget": 1000000, "naloxone": 0.7, "prescribing": 0.3, "treatment": 0.8}}
```

Always frame this as a policy exploration tool, NOT medical advice.
Be concise and data-driven. Reference specific numbers when possible.
If the user doesn't specify a county, ask which one. Default to Marion if ambiguous."""

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
            return FileResponse(str(index_path))
        raise HTTPException(404, "Frontend not built. Run: cd frontend && npm run build")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
