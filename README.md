# Morpheus

**Indiana Opioid Policy Simulator & Optimizer**

Every year Indiana loses about 2,500 people to opioid overdoses. County health departments get limited budgets and have to figure out where to spend it — naloxone? treatment? prescribing reform? And the answer is different for every county. A dollar spent on naloxone in rural Jay County has a completely different impact than the same dollar spent on treatment in Marion County.

So we built Morpheus — an AI-powered simulator that takes real CDC data, calibrates an epidemic model for each county, and tells policymakers exactly how to allocate their budget to save the most lives.

> Our counterfactual analysis shows that **5,146 lives** could have been saved if Indiana had deployed moderate interventions in 2016. That's a 79% reduction in overdose deaths.

Built at **Catapult Hackathon 2026**, Purdue University.

---

## What it does

You pick a county, set a budget, and Morpheus gives you a data-backed playbook optimized across three intervention levers — naloxone access, prescribing reduction, and treatment expansion.

Under the hood it runs through an 8-stage pipeline:

1. **Calibrated compartmental model** — 7 compartments (General Pop → Prescribed → Misuse → OUD → Overdose → Death, with Treatment → Recovery pathways), each county fitted to 19 years of real CDC mortality data using differential evolution
2. **9.26M GPU simulations** on an NVIDIA H100 in 0.43 seconds (21.7M scenarios/sec) to exhaustively search the intervention space
3. **XGBoost surrogate** (R²=0.99) trained on those simulations for real-time prediction
4. **RL policy agent** (PPO) that makes budget decisions year-by-year instead of one-shot, discovering temporal strategies like "front-load naloxone, then ramp treatment" — saves 62% more lives than greedy optimization
5. **Monte Carlo uncertainty** — 800K stochastic simulations for confidence intervals on every prediction
6. **Counterfactual analysis** — "what if Indiana had acted in 2016?" backed by calibrated parameters
7. **AI orchestrator** — type one sentence, get a full analysis pipeline + executive summary automatically
8. **Interactive dashboard** — map, time machine, sliders, analytics, all updating in real time

---

## The numbers

| What | Result |
|------|--------|
| GPU simulations | 9.26M in 0.43s on H100 |
| Throughput | 21.7M scenarios/sec |
| Monte Carlo | 800K stochastic sims |
| RL improvement | +62% vs greedy optimizer |
| Calibration | R²=0.71 across 20 counties |
| XGBoost | R²=0.99 |
| Statewide impact | 5,146 lives saveable |
| Scott County | 47% of deaths preventable |

---

## Features

**Map & Simulator** — interactive Leaflet map with 20 glowing county markers, time machine (2003-2021 epidemic animation), 3 intervention sliders, hover popups with live data, policy report + roadmap downloads, fullscreen mode, 5 color schemes, 4 tile layers

**Analytics** — 20-county heatmap, scatter plot, statewide trend with event annotations, top/bottom county comparison, intervention impact slider across all counties, rural vs urban breakdown

**What If?** — Scott County counterfactual (47% preventable), statewide analysis (5,146 lives), actual vs counterfactual charts with reference lines

**RL Agent** — PPO making sequential 5-year allocations, yearly strategy chart, comparison against greedy optimizer (Marion: 1,592 vs 361 lives saved)

**AI Orchestrator** — one prompt → automatic county analysis → simulation → RL comparison → counterfactual context → Claude-written executive summary

**Roadmap** — 12-month phased rollout plan with county-specific KPIs, animated year-by-year strategy charts, downloadable document

**AI Assistant** — Claude-powered chatbot that knows the entire project, answers methodology/navigation/policy questions

---

## Tech stack

**Backend:** Python, FastAPI, NumPy, SciPy, XGBoost, PyTorch, Stable-Baselines3, Gymnasium, Anthropic Claude API

**Frontend:** React, Vite, Leaflet, Recharts, Tailwind CSS

**Infrastructure:** Purdue Gautschi HPC (NVIDIA H100 80GB), SLURM, Vercel

---

## Running locally

```bash
git clone https://github.com/Vinay-Vimalkumar/opoid-users.git
cd opoid-users
pip install -r requirements-server.txt
python -m uvicorn api.main:app --port 8000
```

Open http://localhost:8000. All the heavy computation (GPU sims, Monte Carlo, RL training) is already done — results ship with the repo as JSON files. No GPU needed to run it.

For the AI chat, add your key:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

---

## Data sources

- CDC VSRR Provisional County-Level Drug Overdose Deaths (2020-2025)
- CDC Drug Poisoning Mortality by County (2003-2021)
- County Health Rankings (uninsured rates, treatment facilities, income)

---

## Tracks

Best ML Project · Most Promising Startup · Best Automation
