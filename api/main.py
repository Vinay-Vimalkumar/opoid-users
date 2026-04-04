"""
FastAPI backend for DrugDiffuse.
Endpoints: /simulate, /optimize, /chat, /counties, /baseline
"""

import sys
from pathlib import Path

# Add parent paths for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "simulation"))
sys.path.insert(0, str(Path(__file__).parent.parent / "ml"))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import json
import numpy as np

from model import COUNTY_MAP, INDIANA_COUNTIES, Interventions, run_scenario, run_baseline, CountyParams
from optimize import find_optimal, load_model

app = FastAPI(title="DrugDiffuse API", version="1.0.0")

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


class ChatRequest(BaseModel):
    message: str
    county: Optional[str] = None


# --- Endpoints ---

@app.get("/counties")
def list_counties():
    """List all available counties with their populations."""
    return [
        {"name": c.name, "population": c.population}
        for c in INDIANA_COUNTIES
    ]


@app.post("/simulate")
def simulate(req: SimulateRequest):
    """Run a simulation scenario."""
    if req.county not in COUNTY_MAP:
        raise HTTPException(404, f"County '{req.county}' not found")

    county = COUNTY_MAP[req.county]
    interventions = Interventions(req.naloxone, req.prescribing, req.treatment)

    result = run_scenario(county, interventions, months=req.months, seed=req.seed)
    baseline = run_baseline(county, months=req.months, seed=req.seed)
    result.lives_saved = max(0, baseline.total_deaths - result.total_deaths)

    return {
        "county": result.county,
        "interventions": result.interventions,
        "months": result.months,
        "total_deaths": result.total_deaths,
        "total_overdoses": result.total_overdoses,
        "total_treated": result.total_treated,
        "lives_saved": result.lives_saved,
        "cost": result.cost,
        "timeline": result.timeline,
        "baseline_deaths": baseline.total_deaths,
    }


@app.post("/baseline")
def baseline(county: str, months: int = 60, seed: int = 42):
    """Run baseline (no intervention) scenario."""
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


@app.post("/optimize")
def optimize(req: OptimizeRequest):
    """Find optimal intervention bundle for a county within budget."""
    if req.county not in COUNTY_MAP:
        raise HTTPException(404, f"County '{req.county}' not found")

    try:
        result = find_optimal(req.county, req.budget, months=req.months)
        return result
    except Exception as e:
        raise HTTPException(500, f"Optimization failed: {str(e)}")


@app.post("/chat")
async def chat(req: ChatRequest):
    """AI chat endpoint — parses natural language into simulation parameters."""
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

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": req.message}],
    )

    ai_response = response.content[0].text

    # Try to extract JSON params and run simulation
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
