"""
Gymnasium environment for multi-year opioid policy optimization.

The agent makes one budget allocation decision per year (5 decisions over 5 years),
observing the current epidemic state before each decision. This forces the agent
to learn temporal strategies — e.g., front-load naloxone (immediate life-saving),
ramp treatment capacity in years 2-4 (lagged payoff) — that one-shot optimizers
cannot discover.

State (12 dims, all normalized 0-1):
  [0] oud_fraction           OUD population / (2% of county pop)
  [1] prescribed_fraction    Prescribed pop / (6% of county pop)
  [2] misuse_fraction        Misuse pop / (1.5% of county pop)
  [3] treatment_fraction     In-treatment pop / (0.3% of county pop)
  [4] recovered_fraction     Recovered pop / (0.5% of county pop)
  [5] cumulative_deaths_rate Cumulative deaths / (0.2% of county pop)
  [6] budget_remaining_frac  Remaining budget / total budget
  [7] year_frac              Year index / 5
  [8] overdose_rate_norm     County overdose rate / 50 (per 100k)
  [9] pct_uninsured_norm     Uninsured rate / 0.20
  [10] facilities_norm       Treatment facilities / 10
  [11] pop_log_norm          log(population) / log(1M)

Action (4 dims, all in [0,1]):
  [0] naloxone_level         How much naloxone to deploy
  [1] prescribing_level      How much to reduce prescribing
  [2] treatment_level        How much to expand treatment
  [3] budget_fraction        Fraction of remaining budget to spend this year
"""

import sys
import json
from pathlib import Path
import numpy as np
import gymnasium as gym
from gymnasium import spaces

sys.path.insert(0, str(Path(__file__).parent.parent / "simulation"))
from model import (
    INDIANA_COUNTIES, COUNTY_MAP, CountyParams, Interventions,
    compute_cost, run_baseline,
)

PROFILES_PATH = Path(__file__).parent.parent / "data" / "processed" / "county_profiles.json"


def _load_county_features():
    if not PROFILES_PATH.exists():
        return {}
    with open(PROFILES_PATH) as f:
        profiles = json.load(f)
    out = {}
    for p in profiles:
        name = p.get("name") or p.get("county")
        if not name:
            continue
        out[name] = {
            "overdose_rate": float(p.get("latest_rate_per_100k") or p.get("avg_rate_per_100k") or 20.0),
            "pct_uninsured": float(p.get("pct_uninsured") or 0.08),
            "treatment_facilities": int(p.get("treatment_facilities") or 2),
        }
    return out


_COUNTY_FEATURES = _load_county_features()


class OpioidPolicyEnv(gym.Env):
    """
    Multi-year opioid policy optimization environment.

    Each episode = 5 years of sequential decisions.
    At each year the agent observes current epidemic state + budget remaining,
    then chooses (naloxone, prescribing, treatment, budget_fraction).
    """

    metadata = {"render_modes": []}

    def __init__(
        self,
        county_name: str = None,
        total_budget: float = 2_000_000,
        n_years: int = 5,
        randomize_budget: bool = True,
    ):
        super().__init__()
        self.county_name = county_name          # None → randomize each episode
        self.base_budget = total_budget
        self.n_years = n_years
        self.randomize_budget = randomize_budget

        self.observation_space = spaces.Box(
            low=0.0, high=2.0, shape=(12,), dtype=np.float32
        )
        self.action_space = spaces.Box(
            low=0.0, high=1.0, shape=(4,), dtype=np.float32
        )

        # Runtime state (set in reset)
        self._county: CountyParams = None
        self._cf: dict = {}
        self._state: dict = {}
        self._total_budget: float = 0.0
        self._budget_remaining: float = 0.0
        self._year: int = 0
        self._episode_seed: int = 0
        self._baseline_yearly: list = []   # baseline deaths per year (no intervention)

    # ------------------------------------------------------------------
    # Gymnasium API
    # ------------------------------------------------------------------

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        rng = np.random.default_rng(seed)

        # Pick county
        if self.county_name:
            self._county = COUNTY_MAP[self.county_name]
        else:
            name = rng.choice([c.name for c in INDIANA_COUNTIES])
            self._county = COUNTY_MAP[name]

        self._cf = _COUNTY_FEATURES.get(self._county.name, {})

        # Optionally vary budget so agent learns a general policy
        if self.randomize_budget:
            self._total_budget = float(rng.uniform(0.5e6, 5e6))
        else:
            self._total_budget = self.base_budget

        self._budget_remaining = self._total_budget
        self._year = 0
        self._episode_seed = int(rng.integers(0, 10_000))

        # Initial compartments (same as model.py)
        pop = self._county.population
        prescribed = int(pop * 0.04)
        misuse     = int(pop * 0.008)
        oud        = int(pop * 0.005)
        treatment  = int(pop * 0.001)
        recovered  = int(pop * 0.002)
        general    = pop - prescribed - misuse - oud - treatment - recovered
        self._state = {
            "general":           max(general, 0),
            "prescribed":        prescribed,
            "misuse":            misuse,
            "oud":               oud,
            "treatment":         treatment,
            "recovered":         recovered,
            "cumulative_deaths": 0,
        }

        # Baseline: no-intervention deaths per year
        # Run full baseline once, split timeline into yearly chunks
        bl = run_baseline(self._county, months=self.n_years * 12, seed=42)
        yearly = []
        for y in range(self.n_years):
            start = y * 12
            end   = start + 11
            d = (bl.timeline[end]["cumulative_deaths"]
                 - bl.timeline[start]["cumulative_deaths"])
            yearly.append(max(d, 0))
        self._baseline_yearly = yearly

        return self._get_obs(), {}

    def step(self, action):
        assert self._county is not None, "Call reset() before step()"

        naloxone   = float(np.clip(action[0], 0.0, 1.0))
        prescribing = float(np.clip(action[1], 0.0, 1.0))
        treatment  = float(np.clip(action[2], 0.0, 1.0))
        bfrac      = float(np.clip(action[3], 0.05, 1.0))

        # Budget for this year
        budget_this_year = self._budget_remaining * bfrac
        ivx = Interventions(naloxone, prescribing, treatment)
        cost = compute_cost(ivx, self._county.population, months=12)

        # Scale down interventions proportionally if over this year's budget
        if cost > budget_this_year and budget_this_year > 0:
            scale = budget_this_year / cost
            naloxone    = float(np.clip(naloxone    * np.sqrt(scale), 0.0, 1.0))
            prescribing = float(np.clip(prescribing * np.sqrt(scale), 0.0, 1.0))
            treatment   = float(np.clip(treatment   * np.sqrt(scale), 0.0, 1.0))
            ivx  = Interventions(naloxone, prescribing, treatment)
            cost = compute_cost(ivx, self._county.population, months=12)

        cost = min(cost, self._budget_remaining)
        self._budget_remaining = max(0.0, self._budget_remaining - cost)

        # Run 12 months from current state
        result = self._simulate_year(ivx, seed=self._episode_seed + self._year * 13)
        deaths_this_year   = result["deaths"]
        baseline_this_year = self._baseline_yearly[self._year]
        lives_saved        = max(0.0, baseline_this_year - deaths_this_year)

        self._year += 1
        done = self._year >= self.n_years

        # Reward = lives saved vs doing nothing
        reward = float(lives_saved)
        if done:
            # Efficiency bonus: reward spending the budget (unused budget = missed lives)
            spent_frac = 1.0 - (self._budget_remaining / self._total_budget)
            reward += spent_frac * 3.0

        info = {
            "county":                self._county.name,
            "year":                  self._year,
            "naloxone":              naloxone,
            "prescribing":           prescribing,
            "treatment":             treatment,
            "budget_spent":          float(cost),
            "budget_remaining":      float(self._budget_remaining),
            "total_budget":          float(self._total_budget),
            "deaths_this_year":      int(deaths_this_year),
            "overdoses_this_year":   int(result["overdoses"]),
            "lives_saved_this_year": float(lives_saved),
            "baseline_this_year":    float(baseline_this_year),
        }

        return self._get_obs(), reward, done, False, info

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_obs(self) -> np.ndarray:
        s   = self._state
        pop = self._county.population
        cf  = self._cf
        return np.array([
            s["oud"]               / max(pop * 0.02, 1),
            s["prescribed"]        / max(pop * 0.06, 1),
            s["misuse"]            / max(pop * 0.015, 1),
            s["treatment"]         / max(pop * 0.003, 1),
            s["recovered"]         / max(pop * 0.005, 1),
            s["cumulative_deaths"] / max(pop * 0.002, 1),
            self._budget_remaining / max(self._total_budget, 1),
            self._year / self.n_years,
            min(cf.get("overdose_rate", 20.0)       / 50.0, 2.0),
            min(cf.get("pct_uninsured", 0.08)        / 0.20, 2.0),
            min(cf.get("treatment_facilities", 2)    / 10.0, 2.0),
            min(np.log(max(pop, 1)) / np.log(1_000_000), 2.0),
        ], dtype=np.float32)

    def _simulate_year(self, ivx: Interventions, seed: int = 42) -> dict:
        """Run 12 months of the compartmental model from self._state."""
        rng    = np.random.default_rng(seed)
        county = self._county

        # Unpack current state
        general    = self._state["general"]
        prescribed = self._state["prescribed"]
        misuse     = self._state["misuse"]
        oud        = self._state["oud"]
        treatment  = self._state["treatment"]
        recovered  = self._state["recovered"]

        # Effective rates after interventions (same formulas as model.py)
        eff_prescribing_rate   = county.prescribing_rate    * (1 - 0.6 * ivx.prescribing_reduction)
        eff_fatality_rate      = county.fatality_rate       * (1 - 0.5 * ivx.naloxone_access)
        eff_treatment_entry    = county.treatment_entry_rate * (1 + ivx.treatment_access)
        eff_treatment_success  = min(
            1.0, county.treatment_success_rate * (1 + 0.3 * ivx.treatment_access)
        )

        total_deaths    = 0
        total_overdoses = 0
        total_treated   = 0

        for _ in range(12):
            new_prescribed   = rng.binomial(max(general,    0), min(eff_prescribing_rate,  1.0))
            new_misuse       = rng.binomial(max(prescribed, 0), min(county.misuse_rate,    1.0))
            new_oud          = rng.binomial(max(misuse,     0), min(county.oud_rate,       1.0))
            new_overdose     = rng.binomial(max(oud,        0), min(county.overdose_rate,  1.0))
            new_deaths       = rng.binomial(max(new_overdose, 0), min(eff_fatality_rate,   1.0))
            survived         = new_overdose - new_deaths
            new_treatment    = rng.binomial(max(oud,        0), min(eff_treatment_entry,   1.0))
            new_recovered    = rng.binomial(max(treatment,  0), min(eff_treatment_success, 1.0))
            new_relapse      = rng.binomial(max(recovered,  0), min(county.relapse_rate,   1.0))
            new_stable_exit  = rng.binomial(max(recovered,  0), min(county.recovery_exit_rate, 1.0))

            general    = max(general    - new_prescribed + new_stable_exit, 0)
            prescribed = max(prescribed + new_prescribed - new_misuse, 0)
            misuse     = max(misuse     + new_misuse     - new_oud, 0)
            oud        = max(oud + new_oud - new_overdose - new_treatment + survived + new_relapse, 0)
            treatment  = max(treatment  + new_treatment  - new_recovered, 0)
            recovered  = max(recovered  + new_recovered  - new_relapse - new_stable_exit, 0)

            total_deaths    += int(new_deaths)
            total_overdoses += int(new_overdose)
            total_treated   += int(new_treatment)

        # Persist updated compartments
        self._state = {
            "general":           int(general),
            "prescribed":        int(prescribed),
            "misuse":            int(misuse),
            "oud":               int(oud),
            "treatment":         int(treatment),
            "recovered":         int(recovered),
            "cumulative_deaths": self._state["cumulative_deaths"] + total_deaths,
        }

        return {
            "deaths":    total_deaths,
            "overdoses": total_overdoses,
            "treated":   total_treated,
        }
