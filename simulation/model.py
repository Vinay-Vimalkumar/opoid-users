"""
Stochastic compartmental model for opioid dynamics — calibrated to real CDC data.

Compartments per county per time step (1 month):
  General Pop → Prescribed → Misuse → OUD → Overdose → Death or Survived
                                        ↓
                                    Treatment → Recovered → (relapse back to OUD)

Three intervention levers (each 0.0–1.0):
  - naloxone_access:        reduces overdose fatality rate by up to 50%
  - prescribing_reduction:  reduces new opioid prescriptions by up to 60%
  - treatment_access:       doubles treatment entry rate, +30% treatment success

County parameters are derived from real CDC data in county_profiles.json.
Overdose rates are calibrated so baseline deaths match real historical death rates.
"""

import json
import numpy as np
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

_PROFILES_PATH = Path(__file__).parent.parent / "data" / "processed" / "county_profiles.json"

# Calibration constants
_BASE_OD_RATE_URBAN = 0.015       # reference overdose_rate for urban counties
_BASE_OD_RATE_MID = 0.018         # reference for mid-size
_BASE_OD_RATE_RURAL = 0.021       # reference for rural
_BASE_TX_RATE = 0.030             # reference treatment_entry_rate (30-month average)
_FLOOR_FAC_PER_100K = 0.10        # minimum effective facilities per 100k (travel / telehealth)
_AVG_FAC_PER_100K = 0.55          # approximate Indiana average (computed from profiles)
_AVG_PCT_UNINSURED = 0.082        # approximate Indiana average


PROFILES_PATH = Path(__file__).parent.parent / "data" / "processed" / "county_profiles.json"


@dataclass
class CountyParams:
    name: str
    population: int
    # Base rates (monthly)
    prescribing_rate: float = 0.005       # fraction of gen pop getting new prescriptions
    misuse_rate: float = 0.04             # fraction of prescribed who misuse
    oud_rate: float = 0.08                # fraction of misusers developing OUD
    overdose_rate: float = 0.015          # fraction of OUD who overdose per month
    fatality_rate: float = 0.12           # fraction of overdoses that are fatal
    treatment_entry_rate: float = 0.03    # fraction of OUD entering treatment per month
    treatment_success_rate: float = 0.30  # fraction completing treatment
    relapse_rate: float = 0.05            # fraction of recovered relapsing per month
    recovery_exit_rate: float = 0.02      # fraction of recovered leaving system (stable)
    # Real data fields (for display / ML features)
    avg_rate_per_100k: float = 0.0
    latest_rate_per_100k: float = 0.0
    pct_uninsured: float = 0.0
    median_household_income: float = 50000.0
    treatment_facilities: int = 0
    od_touchpoints_total: float = 0.0


@dataclass
class Interventions:
    naloxone_access: float = 0.0
    prescribing_reduction: float = 0.0
    treatment_access: float = 0.0


@dataclass
class SimResult:
    county: str
    interventions: dict
    seed: int
    months: int
    timeline: dict
    total_deaths: int
    total_overdoses: int
    total_treated: int
    lives_saved: int
    cost: float


def _derive_county_params(profile: dict) -> CountyParams:
    """
    Derive simulation parameters from a real CDC county profile.

    Key calibration: overdose_rate is solved so that the model's baseline
    deaths-per-month match real provisional death counts from CDC WONDER.

    We use the average of the most recent 3 complete years of provisional deaths
    (which cover ALL drug overdose deaths, not just opioids).

    In the model:
      deaths_per_month ≈ oud_count * overdose_rate * fatality_rate
      oud_count        ≈ population * OUD_PREVALENCE
    Solving: overdose_rate = real_deaths_per_month / (oud_count * fatality_rate)
    """
    name       = profile["name"]
    population = profile["population"]

    # ── Real death rates ──
    avg_rate    = float(profile.get("avg_rate_per_100k") or 15.0)
    latest_rate = float(profile.get("latest_rate_per_100k") or avg_rate)

    # ── Use provisional deaths (CDC WONDER actual counts) for calibration ──
    yearly = profile.get("yearly_data", [])
    recent = [y for y in yearly
              if y.get("provisional_deaths") and y.get("year") in [2022, 2023, 2024]]
    if recent:
        avg_annual_deaths = sum(y["provisional_deaths"] for y in recent) / len(recent)
    else:
        # Fallback to CDC model rate if no provisional data
        avg_annual_deaths = (avg_rate / 100_000) * population

    # ── Socioeconomic / health system ──
    pct_uninsured = float(profile.get("pct_uninsured") or 0.10)
    income        = float(profile.get("median_household_income") or 50000)
    facilities    = int(profile.get("treatment_facilities") or 0)
    od_raw        = profile.get("od_touchpoints") or 0
    od_total      = sum(od_raw.values()) if isinstance(od_raw, dict) else float(od_raw)

    # ── Urban/rural classification ──
    urban_rural = profile.get("urban_rural", "Medium Metro")

    # ── Calibrate overdose_rate from CDC opioid-specific death rate ──
    # We calibrate to avg_rate_per_100k (CDC Drug Poisoning Mortality — opioid-specific)
    # rather than provisional counts (which include all drug types).
    # OUD prevalence ~1% is consistent with SAMHSA estimates for high-burden counties.
    FATALITY_RATE    = 0.12
    OUD_PREVALENCE   = 0.010
    oud_count        = population * OUD_PREVALENCE
    real_deaths_mo   = (avg_rate / 100_000) * population / 12
    overdose_rate    = real_deaths_mo / max(oud_count * FATALITY_RATE, 1)
    overdose_rate    = float(np.clip(overdose_rate, 0.005, 0.08))

    # ── Prescribing rate: higher uninsured + lower income → more prescribing ──
    income_factor    = 1.0 + max(0.0, (55_000 - income) / 80_000)
    uninsured_factor = 1.0 + pct_uninsured * 0.6
    prescribing_rate = float(np.clip(0.004 * income_factor * uninsured_factor, 0.003, 0.013))

    # ── Misuse / OUD rates by urbanicity ──
    if "Rural" in urban_rural:
        misuse_rate, oud_rate = 0.07, 0.11
    elif any(x in urban_rural for x in ["Small", "Micro", "Nonmetro"]):
        misuse_rate, oud_rate = 0.055, 0.095
    else:
        misuse_rate, oud_rate = 0.04, 0.08

    # ── Treatment entry: more facilities → higher entry rate ──
    # Baseline 2% + 0.6% per facility per 100k residents
    facilities_per_100k  = facilities / max(population / 100_000, 0.1)
    treatment_entry_rate = float(np.clip(0.020 + facilities_per_100k * 0.006, 0.012, 0.065))

    # ── Treatment success: higher uninsured → lower success ──
    treatment_success_rate = float(np.clip(0.38 - pct_uninsured * 0.6, 0.18, 0.50))

    return CountyParams(
        name=name,
        population=population,
        prescribing_rate=round(prescribing_rate, 4),
        misuse_rate=misuse_rate,
        oud_rate=oud_rate,
        overdose_rate=round(overdose_rate, 5),
        fatality_rate=FATALITY_RATE,
        treatment_entry_rate=round(treatment_entry_rate, 4),
        treatment_success_rate=round(treatment_success_rate, 3),
        avg_rate_per_100k=avg_rate,
        latest_rate_per_100k=latest_rate,
        pct_uninsured=pct_uninsured,
        median_household_income=income,
        treatment_facilities=facilities,
        od_touchpoints_total=od_total,
    )


def _load_counties() -> list:
    """Load and calibrate county params from real CDC profiles."""
    if not PROFILES_PATH.exists():
        raise FileNotFoundError(
            f"county_profiles.json not found at {PROFILES_PATH}. "
            "Run: python data/process_real_data.py"
        )
    with open(PROFILES_PATH) as f:
        profiles = json.load(f)
    return [_derive_county_params(p) for p in profiles]


# Load on import — calibrated to real CDC data
INDIANA_COUNTIES = _load_counties()
COUNTY_MAP = {c.name: c for c in INDIANA_COUNTIES}


def compute_cost(interventions: Interventions, population: int, months: int) -> float:
    """Compute total cost of interventions over the simulation period."""
    monthly_cost = 0.0
    kits_per_month = (interventions.naloxone_access * population) / 500
    monthly_cost += kits_per_month * 75
    monthly_cost += (interventions.prescribing_reduction * 10) * 500_000 / months
    slots = interventions.treatment_access * population * 0.001
    monthly_cost += slots * 10_000 / 12
    return monthly_cost * months


def run_scenario(
    county: CountyParams,
    interventions: Interventions,
    months: int = 60,
    seed: int = 42,
) -> SimResult:
    """Run a single stochastic simulation scenario."""
    rng = np.random.default_rng(seed)

    # Initial compartments: 1% OUD prevalence (SAMHSA estimates for high-burden areas)
    prescribed = int(county.population * 0.04)
    misuse     = int(county.population * 0.015)
    oud        = int(county.population * 0.010)
    treatment  = int(county.population * 0.002)
    recovered  = int(county.population * 0.004)
    general    = county.population - prescribed - misuse - oud - treatment - recovered

    eff_prescribing_rate   = county.prescribing_rate * (1 - 0.6 * interventions.prescribing_reduction)
    eff_fatality_rate      = county.fatality_rate    * (1 - 0.5 * interventions.naloxone_access)
    eff_treatment_entry    = county.treatment_entry_rate * (1 + interventions.treatment_access)
    eff_treatment_success  = min(1.0, county.treatment_success_rate * (1 + 0.3 * interventions.treatment_access))

    total_deaths = total_overdoses = total_treated = 0
    timeline = {}

    for month in range(months):
        new_prescribed  = rng.binomial(max(general, 0),    min(eff_prescribing_rate, 1.0))
        new_misuse      = rng.binomial(max(prescribed, 0), min(county.misuse_rate, 1.0))
        new_oud         = rng.binomial(max(misuse, 0),     min(county.oud_rate, 1.0))
        new_overdose    = rng.binomial(max(oud, 0),        min(county.overdose_rate, 1.0))
        new_deaths      = rng.binomial(max(new_overdose, 0), min(eff_fatality_rate, 1.0))
        survived        = new_overdose - new_deaths
        new_treatment   = rng.binomial(max(oud, 0),        min(eff_treatment_entry, 1.0))
        new_recovered   = rng.binomial(max(treatment, 0),  min(eff_treatment_success, 1.0))
        new_relapse     = rng.binomial(max(recovered, 0),  min(county.relapse_rate, 1.0))
        new_stable_exit = rng.binomial(max(recovered, 0),  min(county.recovery_exit_rate, 1.0))

        general   = max(general   - new_prescribed + new_stable_exit, 0)
        prescribed= max(prescribed + new_prescribed - new_misuse, 0)
        misuse    = max(misuse     + new_misuse     - new_oud, 0)
        oud       = max(oud        + new_oud - new_overdose - new_treatment + survived + new_relapse, 0)
        treatment = max(treatment  + new_treatment  - new_recovered, 0)
        recovered = max(recovered  + new_recovered  - new_relapse - new_stable_exit, 0)

        total_deaths    += new_deaths
        total_overdoses += new_overdose
        total_treated   += new_treatment

        timeline[month] = {
            "general":              general,
            "prescribed":           prescribed,
            "misuse":               misuse,
            "oud":                  oud,
            "treatment":            treatment,
            "recovered":            recovered,
            "deaths_this_month":    int(new_deaths),
            "overdoses_this_month": int(new_overdose),
            "cumulative_deaths":    total_deaths,
        }

    return SimResult(
        county=county.name,
        interventions=asdict(interventions),
        seed=seed,
        months=months,
        timeline=timeline,
        total_deaths=int(total_deaths),
        total_overdoses=int(total_overdoses),
        total_treated=int(total_treated),
        lives_saved=0,
        cost=round(compute_cost(interventions, county.population, months), 2),
    )


# ---------------------------------------------------------------------------
# Base cascade rates by county type (prescribing → misuse → OUD chain).
# These remain type-level because CDC data doesn't directly distinguish them;
# overdose_rate and treatment_entry_rate are calibrated per-county from CDC data.
# ---------------------------------------------------------------------------
_BASE_PARAMS = {
    # urban_rural label → (prescribing_rate, misuse_rate, oud_rate, ref_od_rate)
    "Large Central Metro":  (0.005, 0.04, 0.08, _BASE_OD_RATE_URBAN),
    "Large Fringe Metro":   (0.005, 0.04, 0.08, _BASE_OD_RATE_URBAN),
    "Medium Metro":         (0.006, 0.05, 0.09, _BASE_OD_RATE_MID),
    "Small Metro":          (0.006, 0.05, 0.09, _BASE_OD_RATE_MID),
    "Micropolitan":         (0.007, 0.06, 0.10, _BASE_OD_RATE_RURAL),
    "Noncore":              (0.009, 0.07, 0.11, _BASE_OD_RATE_RURAL),
}

# Calibrated overdose_rate and treatment_entry_rate derived by running the
# baseline simulation and matching to CDC latest_rate_per_100k.  Values were
# computed as: overdose_rate *= cdc_rate / sim_annual_rate  (single-pass).
# treatment_entry_rate is scaled by facilities-per-100k and insurance coverage.
# Keys must match profile "name" field.
_CDC_CALIBRATED = {
    "Allen":       {"overdose_rate": 0.00372, "treatment_entry_rate": 0.0327},
    "Blackford":   {"overdose_rate": 0.00357, "treatment_entry_rate": 0.0100},
    "Clark":       {"overdose_rate": 0.00699, "treatment_entry_rate": 0.0521},
    "Delaware":    {"overdose_rate": 0.00735, "treatment_entry_rate": 0.0564},
    "Fayette":     {"overdose_rate": 0.00616, "treatment_entry_rate": 0.0100},
    "Floyd":       {"overdose_rate": 0.00429, "treatment_entry_rate": 0.0100},
    "Grant":       {"overdose_rate": 0.00626, "treatment_entry_rate": 0.0600},
    "Henry":       {"overdose_rate": 0.00367, "treatment_entry_rate": 0.0100},
    "Jay":         {"overdose_rate": 0.00226, "treatment_entry_rate": 0.0100},
    "Lake":        {"overdose_rate": 0.00460, "treatment_entry_rate": 0.0384},
    "Lawrence":    {"overdose_rate": 0.00240, "treatment_entry_rate": 0.0100},
    "Madison":     {"overdose_rate": 0.00673, "treatment_entry_rate": 0.0100},
    "Marion":      {"overdose_rate": 0.00695, "treatment_entry_rate": 0.0193},
    "Scott":       {"overdose_rate": 0.00815, "treatment_entry_rate": 0.0100},
    "St. Joseph":  {"overdose_rate": 0.00313, "treatment_entry_rate": 0.0233},
    "Tippecanoe":  {"overdose_rate": 0.00317, "treatment_entry_rate": 0.0337},
    "Vanderburgh": {"overdose_rate": 0.00549, "treatment_entry_rate": 0.0353},
    "Vermillion":  {"overdose_rate": 0.00295, "treatment_entry_rate": 0.0100},
    "Vigo":        {"overdose_rate": 0.00468, "treatment_entry_rate": 0.0591},
    "Wayne":       {"overdose_rate": 0.00860, "treatment_entry_rate": 0.0600},
}


def _build_county_params() -> list:
    """
    Build CountyParams list from county_profiles.json + _CDC_CALIBRATED overrides.

    For each county, cascade rates (prescribing/misuse/oud) come from the
    urban_rural type bucket in _BASE_PARAMS.  overdose_rate and
    treatment_entry_rate come from _CDC_CALIBRATED (derived from real data).
    Population is taken from the profile when available.
    """
    if not _PROFILES_PATH.exists():
        raise FileNotFoundError(
            f"county_profiles.json not found at {_PROFILES_PATH}. "
            "Run data/process_real_data.py first."
        )

    with open(_PROFILES_PATH) as f:
        raw = json.load(f)
    profiles = {p["name"]: p for p in raw if p.get("name")}

    # Ordered list to preserve county ordering for stable ML feature vectors
    _COUNTY_ORDER = [
        "Marion", "Lake", "Allen", "St. Joseph", "Vanderburgh", "Tippecanoe",
        "Delaware", "Vigo", "Madison", "Grant", "Lawrence", "Floyd", "Clark",
        "Scott", "Fayette", "Jay", "Blackford", "Vermillion", "Wayne", "Henry",
    ]

    counties = []
    for name in _COUNTY_ORDER:
        p = profiles.get(name, {})
        urban_rural = p.get("urban_rural", "Medium Metro")
        base = _BASE_PARAMS.get(urban_rural, _BASE_PARAMS["Medium Metro"])
        prescribing_rate, misuse_rate, oud_rate, _ = base

        population = int(p.get("population") or 0)
        if population == 0:
            raise ValueError(f"Missing population for county '{name}' in profiles")

        cal = _CDC_CALIBRATED.get(name, {})
        overdose_rate = cal.get("overdose_rate", _BASE_OD_RATE_MID)
        treatment_entry_rate = cal.get("treatment_entry_rate", _BASE_TX_RATE)

        counties.append(CountyParams(
            name=name,
            population=population,
            prescribing_rate=prescribing_rate,
            misuse_rate=misuse_rate,
            oud_rate=oud_rate,
            overdose_rate=overdose_rate,
            treatment_entry_rate=treatment_entry_rate,
        ))
    return counties


INDIANA_COUNTIES = _build_county_params()
COUNTY_MAP = {c.name: c for c in INDIANA_COUNTIES}


def run_baseline(county: CountyParams, months: int = 60, seed: int = 42) -> SimResult:
    """Run baseline scenario with no interventions."""
    return run_scenario(county, Interventions(), months=months, seed=seed)


if __name__ == "__main__":
    import json as _json
    with open(PROFILES_PATH) as _f:
        _profiles = {p["name"]: p for p in _json.load(_f)}

    for county in INDIANA_COUNTIES[:5]:
        bl = run_baseline(county)
        p = _profiles.get(county.name, {})
        yearly = p.get("yearly_data", [])
        recent = [y for y in yearly if y.get("provisional_deaths") and y.get("year") in [2022, 2023, 2024]]
        avg_real = sum(y["provisional_deaths"] for y in recent) / max(len(recent), 1) if recent else 0
        print(f"{county.name:15s} | pop {county.population:>8,}"
              f" | real avg deaths/yr {avg_real:>6.0f}"
              f" | model 5yr deaths {bl.total_deaths:>6}"
              f" | model/yr {bl.total_deaths/5:>6.0f}"
              f" | OD rate {county.overdose_rate:.4f}")
