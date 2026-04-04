"""
Counterfactual Analysis: "What if interventions had been deployed earlier?"

The killer demo moment. This answers questions like:
  - "If Scott County had naloxone access at 60% before the 2015 HIV/opioid outbreak,
     how many lives could have been saved?"
  - "If Indiana had deployed statewide treatment expansion in 2016 when the fentanyl
     surge began, what would the death toll look like today?"

Method:
  1. Calibrate model to match ACTUAL historical death counts (pre-intervention period)
  2. Run the calibrated model forward WITH hypothetical interventions
  3. Compare: actual deaths vs counterfactual deaths = lives that COULD have been saved

This is emotionally resonant AND scientifically grounded because the model is
calibrated to real CDC data.
"""

import json
import csv
import numpy as np
from pathlib import Path
from collections import defaultdict

PROJECT_DIR = Path(__file__).parent.parent

FIPS_TO_COUNTY = {
    "18097": "Marion", "18089": "Lake", "18003": "Allen", "18141": "St. Joseph",
    "18163": "Vanderburgh", "18157": "Tippecanoe", "18035": "Delaware",
    "18177": "Wayne", "18167": "Vigo", "18095": "Madison", "18019": "Clark",
    "18043": "Floyd", "18143": "Scott", "18093": "Lawrence", "18041": "Fayette",
    "18075": "Jay", "18009": "Blackford", "18165": "Vermillion", "18065": "Henry",
    "18053": "Grant",
}


def load_mortality_rates():
    """Load CDC model-based death rates per county per year."""
    filepath = PROJECT_DIR / "data" / "raw" / "cdc_drug_poisoning_mortality.csv"
    data = defaultdict(dict)

    with open(filepath, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            fips = row.get("FIPS", "").strip()
            if fips not in FIPS_TO_COUNTY:
                continue
            county = FIPS_TO_COUNTY[fips]
            year = int(row["Year"])
            rate = float(row["Model-based Death Rate"])
            pop = int(row["Population"].replace(",", ""))
            deaths = rate * pop / 100_000
            data[county][year] = {
                "rate": rate, "population": pop, "deaths": round(deaths, 1)
            }
    return dict(data)


def simulate_counterfactual(
    population, prescribing_rate, misuse_rate, oud_rate, overdose_rate,
    fatality_rate=0.12, treatment_entry_rate=0.03,
    naloxone=0.0, prescribing_reduction=0.0, treatment_access=0.0,
    years=10,
):
    """Run deterministic simulation with optional interventions. Returns annual deaths."""
    eff_prescribing = prescribing_rate * (1 - 0.6 * prescribing_reduction)
    eff_fatality = fatality_rate * (1 - 0.5 * naloxone)
    eff_treatment_entry = treatment_entry_rate * (1 + treatment_access)
    eff_treatment_success = min(1.0, 0.30 * (1 + 0.3 * treatment_access))

    prescribed = population * 0.04
    misuse = population * 0.008
    oud = population * 0.005
    treatment = population * 0.001
    recovered = population * 0.002
    general = population - prescribed - misuse - oud - treatment - recovered

    annual_deaths = []
    for year_idx in range(years):
        year_deaths = 0
        for month in range(12):
            new_prescribed = general * eff_prescribing
            new_misuse = prescribed * misuse_rate
            new_oud = misuse * oud_rate
            new_overdose = oud * overdose_rate
            new_deaths = new_overdose * eff_fatality
            survived = new_overdose - new_deaths
            new_treatment = oud * eff_treatment_entry
            new_recovered = treatment * eff_treatment_success
            new_relapse = recovered * 0.05
            new_stable_exit = recovered * 0.02

            general = max(0, general - new_prescribed + new_stable_exit)
            prescribed = max(0, prescribed + new_prescribed - new_misuse)
            misuse = max(0, misuse + new_misuse - new_oud)
            oud = max(0, oud + new_oud - new_overdose - new_treatment + survived + new_relapse)
            treatment = max(0, treatment + new_treatment - new_recovered)
            recovered = max(0, recovered + new_recovered - new_relapse - new_stable_exit)
            year_deaths += new_deaths

        annual_deaths.append(round(year_deaths))
    return annual_deaths


def scott_county_analysis():
    """
    Scott County, Indiana: The HIV/Opioid Outbreak.

    In 2015, Scott County made national headlines when an HIV outbreak linked to
    injection drug use infected 235 people in a county of only 24,000. The CDC
    called it the worst drug-related HIV outbreak in U.S. history.

    Question: "What if Scott County had deployed naloxone and treatment access
    BEFORE the crisis peaked?"

    We calibrate to actual 2003-2014 death rates, then simulate 2015-2021 under
    three scenarios:
      1. Actual (no intervention) — matches CDC data
      2. Moderate intervention from 2013 (naloxone 40%, treatment 30%)
      3. Aggressive intervention from 2013 (naloxone 70%, treatment 60%, prescribing 40%)
    """
    mortality = load_mortality_rates()
    scott = mortality.get("Scott", {})

    if not scott:
        print("ERROR: No Scott County data found")
        return None

    # Get actual death data
    years = sorted(scott.keys())
    actual_deaths = {y: scott[y]["deaths"] for y in years}
    actual_rates = {y: scott[y]["rate"] for y in years}
    population = scott[max(years)]["population"]

    print(f"{'='*70}")
    print(f"SCOTT COUNTY COUNTERFACTUAL ANALYSIS")
    print(f"Population: {population:,}")
    print(f"{'='*70}")
    print(f"\nActual CDC death rates (per 100K):")
    for y in years:
        bar = "█" * int(actual_rates[y] / 2)
        print(f"  {y}: {actual_rates[y]:5.1f} {bar}")

    # Load calibrated parameters for Scott County
    cal_path = PROJECT_DIR / "data" / "processed" / "calibration_results.json"
    if cal_path.exists():
        with open(cal_path) as f:
            cal_data = json.load(f)
        scott_cal = next((c for c in cal_data if c["county"] == "Scott"), None)
        if scott_cal:
            params = scott_cal["fitted_params"]
            print(f"\nUsing CALIBRATED parameters (R²={scott_cal['r_squared']:.3f})")
        else:
            params = {
                "prescribing_rate": 0.010, "misuse_rate": 0.07, "oud_rate": 0.12,
                "overdose_rate": 0.025, "fatality_rate": 0.12, "treatment_entry_rate": 0.015,
            }
    else:
        params = {
            "prescribing_rate": 0.010, "misuse_rate": 0.07, "oud_rate": 0.12,
            "overdose_rate": 0.025, "fatality_rate": 0.12, "treatment_entry_rate": 0.015,
        }
        print("\nUsing estimated parameters (run calibrate.py for fitted values)")

    # Scenario 1: Baseline (no intervention) — should approximate actual data
    n_years = len(years)
    baseline = simulate_counterfactual(population, **params, years=n_years)

    # Scenario 2: Moderate intervention starting 2013 (10 years before data ends)
    # Only affects years from intervention_start onward
    intervention_start_2013 = 10  # 2013 is index 10 in 2003-2021 range
    moderate_pre = simulate_counterfactual(population, **params, years=intervention_start_2013)
    moderate_post = simulate_counterfactual(
        population, **params,
        naloxone=0.4, prescribing_reduction=0.2, treatment_access=0.3,
        years=n_years - intervention_start_2013,
    )
    moderate = moderate_pre + moderate_post

    # Scenario 3: Aggressive intervention from 2013
    aggressive_post = simulate_counterfactual(
        population, **params,
        naloxone=0.7, prescribing_reduction=0.4, treatment_access=0.6,
        years=n_years - intervention_start_2013,
    )
    aggressive = moderate_pre + aggressive_post

    # Build comparison table
    print(f"\n{'Year':>6} {'Actual':>10} {'Baseline':>10} {'Moderate':>10} {'Aggressive':>10}")
    print("-" * 50)

    actual_total = 0
    baseline_total = 0
    moderate_total = 0
    aggressive_total = 0

    comparison = []
    for i, year in enumerate(years):
        actual = actual_deaths[year]
        actual_total += actual
        baseline_total += baseline[i]
        moderate_total += moderate[i]
        aggressive_total += aggressive[i]

        marker = ""
        if year >= 2013:
            marker = " ← interventions begin"
        if year == 2015:
            marker = " ← HIV OUTBREAK"

        print(f"  {year}: {actual:8.1f}  {baseline[i]:8d}  {moderate[i]:8d}  {aggressive[i]:8d}{marker}")

        comparison.append({
            "year": year,
            "actual_deaths": round(actual, 1),
            "baseline_simulated": baseline[i],
            "moderate_intervention": moderate[i],
            "aggressive_intervention": aggressive[i],
        })

    print(f"\n{'TOTAL':>6}: {actual_total:8.1f}  {baseline_total:8d}  {moderate_total:8d}  {aggressive_total:8d}")

    # Key findings
    moderate_saved = baseline_total - moderate_total
    aggressive_saved = baseline_total - aggressive_total
    moderate_pct = moderate_saved / baseline_total * 100
    aggressive_pct = aggressive_saved / baseline_total * 100

    # Focus on 2015-2021 (peak crisis years)
    crisis_actual = sum(actual_deaths[y] for y in years if y >= 2015)
    crisis_moderate = sum(moderate[i] for i, y in enumerate(years) if y >= 2015)
    crisis_aggressive = sum(aggressive[i] for i, y in enumerate(years) if y >= 2015)

    findings = {
        "headline": f"If Scott County had deployed interventions in 2013, "
                    f"{round(aggressive_pct)}% of overdose deaths from 2013-2021 could have been prevented.",
        "moderate_scenario": {
            "description": "Naloxone 40%, Prescribing reduction 20%, Treatment expansion 30%",
            "lives_saved": round(moderate_saved),
            "percent_reduction": round(moderate_pct, 1),
        },
        "aggressive_scenario": {
            "description": "Naloxone 70%, Prescribing reduction 40%, Treatment expansion 60%",
            "lives_saved": round(aggressive_saved),
            "percent_reduction": round(aggressive_pct, 1),
        },
        "crisis_period_2015_2021": {
            "actual_deaths": round(crisis_actual, 1),
            "with_moderate_intervention": crisis_moderate,
            "with_aggressive_intervention": crisis_aggressive,
            "lives_saveable_aggressive": round(crisis_actual - crisis_aggressive),
        },
    }

    print(f"\n{'='*70}")
    print(f"KEY FINDINGS:")
    print(f"{'='*70}")
    print(f"\n  {findings['headline']}")
    print(f"\n  Moderate intervention (nal=40%, pres=20%, treat=30%):")
    print(f"    → {moderate_saved:.0f} lives saved ({moderate_pct:.0f}% reduction)")
    print(f"\n  Aggressive intervention (nal=70%, pres=40%, treat=60%):")
    print(f"    → {aggressive_saved:.0f} lives saved ({aggressive_pct:.0f}% reduction)")
    print(f"\n  During crisis period (2015-2021):")
    print(f"    Actual deaths: ~{crisis_actual:.0f}")
    print(f"    With aggressive intervention: ~{crisis_aggressive}")
    print(f"    Lives that could have been saved: ~{crisis_actual - crisis_aggressive:.0f}")

    return {
        "county": "Scott",
        "context": "Scott County made national headlines in 2015 when an HIV outbreak "
                   "linked to injection drug use infected 235 people in a county of 24,000. "
                   "The CDC called it the worst drug-related HIV outbreak in U.S. history.",
        "question": "What if interventions had been deployed before the crisis?",
        "intervention_start_year": 2013,
        "population": population,
        "comparison": comparison,
        "findings": findings,
        "calibrated": cal_path.exists(),
    }


def statewide_counterfactual():
    """
    Indiana statewide: What if the state had acted in 2016 when the fentanyl
    surge began?

    Death rates roughly doubled 2016-2021 across most counties. Running
    counterfactuals for all 20 counties.
    """
    mortality = load_mortality_rates()

    cal_path = PROJECT_DIR / "data" / "processed" / "calibration_results.json"
    if cal_path.exists():
        with open(cal_path) as f:
            cal_data = json.load(f)
        county_params = {c["county"]: c["fitted_params"] for c in cal_data}
        county_pops = {c["county"]: c["population"] for c in cal_data}
    else:
        print("WARNING: No calibrated params. Run calibrate.py first.")
        return None

    print(f"\n{'='*70}")
    print(f"STATEWIDE COUNTERFACTUAL: What if Indiana acted in 2016?")
    print(f"{'='*70}")
    print(f"\nIntervention: Naloxone 50%, Prescribing reduction 30%, Treatment 40%")
    print(f"Starting year: 2016 (when fentanyl surge began)\n")

    results = []
    total_actual = 0
    total_counterfactual = 0

    for county_name in sorted(county_params.keys()):
        if county_name not in mortality:
            continue

        params = county_params[county_name]
        pop = county_pops[county_name]
        county_data = mortality[county_name]
        years = sorted(county_data.keys())

        # Actual deaths 2016-2021
        crisis_years = [y for y in years if 2016 <= y <= 2021]
        if not crisis_years:
            continue
        actual_crisis_deaths = sum(county_data[y]["deaths"] for y in crisis_years)

        # Counterfactual: intervene from 2016
        pre_years = [y for y in years if y < 2016]
        pre_deaths = simulate_counterfactual(pop, **params, years=len(pre_years))
        post_deaths = simulate_counterfactual(
            pop, **params,
            naloxone=0.5, prescribing_reduction=0.3, treatment_access=0.4,
            years=len(crisis_years),
        )

        counterfactual_crisis = sum(post_deaths)
        saved = actual_crisis_deaths - counterfactual_crisis

        total_actual += actual_crisis_deaths
        total_counterfactual += counterfactual_crisis

        results.append({
            "county": county_name,
            "population": pop,
            "actual_deaths_2016_2021": round(actual_crisis_deaths, 1),
            "counterfactual_deaths": counterfactual_crisis,
            "lives_saved": round(saved),
            "pct_reduction": round(saved / max(actual_crisis_deaths, 1) * 100, 1),
        })

        print(f"  {county_name:12s}: {actual_crisis_deaths:6.0f} actual → "
              f"{counterfactual_crisis:6d} counterfactual = "
              f"{saved:5.0f} lives saved ({saved/max(actual_crisis_deaths,1)*100:4.1f}%)")

    total_saved = total_actual - total_counterfactual
    print(f"\n  {'TOTAL':12s}: {total_actual:6.0f} actual → "
          f"{total_counterfactual:6.0f} counterfactual = "
          f"{total_saved:5.0f} lives saved ({total_saved/total_actual*100:.1f}%)")

    statewide = {
        "intervention": "Naloxone 50%, Prescribing reduction 30%, Treatment expansion 40%",
        "start_year": 2016,
        "period": "2016-2021",
        "total_actual_deaths": round(total_actual),
        "total_counterfactual_deaths": round(total_counterfactual),
        "total_lives_saved": round(total_saved),
        "pct_reduction": round(total_saved / total_actual * 100, 1),
        "county_results": results,
        "headline": f"If Indiana had deployed moderate interventions statewide in 2016, "
                    f"an estimated {round(total_saved):,} lives could have been saved "
                    f"across 20 counties ({total_saved/total_actual*100:.0f}% reduction in deaths).",
    }

    print(f"\n  HEADLINE: {statewide['headline']}")

    return statewide


def run_all_counterfactuals():
    """Run all counterfactual analyses and save results."""
    print("Running counterfactual analyses...\n")

    scott = scott_county_analysis()
    statewide = statewide_counterfactual()

    output = {
        "scott_county": scott,
        "statewide_2016": statewide,
    }

    out_path = PROJECT_DIR / "data" / "processed" / "counterfactual_results.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved to {out_path}")

    return output


if __name__ == "__main__":
    run_all_counterfactuals()
