"""
Generate realistic synthetic county-level opioid crisis data for 20 Indiana counties.

Uses real FIPS codes and reflects known epidemiological patterns:
- Rural counties have higher per-capita overdose rates
- Scott County had the 2015 HIV/opioid outbreak
- Marion County has highest absolute numbers
- Small counties (Blackford, Jay) have very high per-capita rates
- COVID bump in overdose deaths during 2020-2021

Output:
  - data/processed/county_profiles.json
  - data/processed/indiana_summary.json
"""

import json
import os
import numpy as np

# Seed for reproducibility
np.random.seed(42)

# ── County definitions ───────────────────────────────────────────────────────

COUNTIES = {
    "Marion":       {"fips": "18097", "pop": 977203,  "class": "urban",      "income": 45648,  "base_rate": 28.0,  "rx_rate": 52.3},
    "Lake":         {"fips": "18089", "pop": 498700,  "class": "urban",      "income": 46912,  "base_rate": 30.5,  "rx_rate": 61.8},
    "Allen":        {"fips": "18003", "pop": 385351,  "class": "urban",      "income": 52100,  "base_rate": 22.0,  "rx_rate": 48.7},
    "St. Joseph":   {"fips": "18141", "pop": 272912,  "class": "urban",      "income": 47250,  "base_rate": 25.5,  "rx_rate": 55.2},
    "Vanderburgh":  {"fips": "18163", "pop": 181451,  "class": "urban",      "income": 44800,  "base_rate": 27.0,  "rx_rate": 63.1},
    "Tippecanoe":   {"fips": "18157", "pop": 195732,  "class": "urban",      "income": 48300,  "base_rate": 18.0,  "rx_rate": 42.5},
    "Delaware":     {"fips": "18035", "pop": 114135,  "class": "small_urban","income": 38600,  "base_rate": 35.0,  "rx_rate": 72.4},
    "Wayne":        {"fips": "18177", "pop": 65884,   "class": "small_urban","income": 37200,  "base_rate": 38.0,  "rx_rate": 78.9},
    "Vigo":         {"fips": "18167", "pop": 107038,  "class": "small_urban","income": 39100,  "base_rate": 33.0,  "rx_rate": 68.3},
    "Madison":      {"fips": "18095", "pop": 129505,  "class": "small_urban","income": 40200,  "base_rate": 32.0,  "rx_rate": 66.1},
    "Clark":        {"fips": "18019", "pop": 119256,  "class": "suburban",   "income": 50800,  "base_rate": 29.0,  "rx_rate": 58.7},
    "Floyd":        {"fips": "18043", "pop": 78674,   "class": "suburban",   "income": 53200,  "base_rate": 26.0,  "rx_rate": 54.9},
    "Scott":        {"fips": "18143", "pop": 23873,   "class": "rural",      "income": 34500,  "base_rate": 55.0,  "rx_rate": 96.3},  # HIV/opioid outbreak county
    "Lawrence":     {"fips": "18093", "pop": 45370,   "class": "rural",      "income": 41600,  "base_rate": 36.0,  "rx_rate": 74.2},
    "Fayette":      {"fips": "18041", "pop": 23102,   "class": "rural",      "income": 35800,  "base_rate": 42.0,  "rx_rate": 82.6},
    "Jay":          {"fips": "18075", "pop": 20436,   "class": "rural",      "income": 39400,  "base_rate": 45.0,  "rx_rate": 85.1},
    "Blackford":    {"fips": "18009", "pop": 11758,   "class": "rural",      "income": 37900,  "base_rate": 48.0,  "rx_rate": 88.4},
    "Vermillion":   {"fips": "18165", "pop": 15498,   "class": "rural",      "income": 42100,  "base_rate": 40.0,  "rx_rate": 76.8},
    "Henry":        {"fips": "18065", "pop": 47972,   "class": "rural",      "income": 41300,  "base_rate": 34.0,  "rx_rate": 70.5},
    "Grant":        {"fips": "18053", "pop": 65769,   "class": "small_urban","income": 38100,  "base_rate": 37.0,  "rx_rate": 75.3},
}

YEARS = list(range(2018, 2025))  # 2018-2024

# Year-over-year trend multipliers (baseline = 2018 at 1.0)
# Reflects national trend: steady rise, COVID spike 2020-2021, slight dip 2022, rise again
YEAR_MULTIPLIERS = {
    2018: 1.00,
    2019: 1.05,
    2020: 1.28,  # COVID year — isolation, disrupted treatment
    2021: 1.38,  # Peak — fentanyl saturation + continued COVID effects
    2022: 1.30,  # Slight pullback as Narcan access improved
    2023: 1.33,  # Creeping back up
    2024: 1.36,  # Continued rise, fentanyl analogs
}

# Prescribing rate trend (declining due to regulations)
RX_YEAR_MULTIPLIERS = {
    2018: 1.00,
    2019: 0.94,
    2020: 0.88,
    2021: 0.83,
    2022: 0.79,
    2023: 0.76,
    2024: 0.73,
}


def generate_annual_deaths(county_name: str, info: dict) -> dict:
    """Generate annual overdose deaths with realistic variance."""
    pop = info["pop"]
    base_rate_per_100k = info["base_rate"]
    annual = {}

    for year in YEARS:
        # Base expected deaths from rate
        expected = (pop / 100_000) * base_rate_per_100k * YEAR_MULTIPLIERS[year]

        # Add noise: Poisson-like variance for small counties, normal for large
        if pop < 30000:
            # Clamp to at least 70% of expected to avoid unrealistically low draws
            deaths = max(int(np.random.poisson(max(expected, 1))), int(expected * 0.7))
        else:
            noise = np.random.normal(0, expected * 0.08)
            deaths = int(round(expected + noise))

        # Scott County special: extra spike in 2018-2019 reflecting outbreak aftermath
        if county_name == "Scott" and year in (2018, 2019):
            deaths = int(deaths * 1.15)

        annual[str(year)] = max(deaths, 1)  # At least 1

    return annual


def generate_treatment_facilities(info: dict) -> int:
    """Number of treatment facilities scales with population but rural areas are underserved."""
    pop = info["pop"]
    cls = info["class"]

    if cls == "urban":
        # Roughly 1 facility per 15k-20k people
        base = pop / 17000
    elif cls == "suburban":
        base = pop / 22000
    elif cls == "small_urban":
        base = pop / 25000
    else:  # rural
        base = pop / 35000  # severely underserved

    facilities = int(round(base + np.random.normal(0, base * 0.15)))
    return max(facilities, 1)


def generate_naloxone_distribution(info: dict, year: int) -> int:
    """Naloxone distribution counts — ramping up over time, higher in hard-hit areas."""
    pop = info["pop"]
    base_rate = info["base_rate"]

    # Base: proportional to population and crisis severity
    base = (pop / 10000) * (base_rate / 25) * 50

    # Naloxone access expanded significantly 2020+
    naloxone_growth = {
        2018: 1.0,
        2019: 1.3,
        2020: 1.8,
        2021: 2.4,
        2022: 3.1,
        2023: 3.6,
        2024: 4.0,
    }

    count = base * naloxone_growth[year]
    noise = np.random.normal(0, count * 0.1)
    return max(int(round(count + noise)), 5)


def generate_rx_rate(info: dict, year: int) -> float:
    """Opioid prescribing rate per 100 people — declining over time."""
    base = info["rx_rate"]
    rate = base * RX_YEAR_MULTIPLIERS[year]
    noise = np.random.normal(0, rate * 0.03)
    return round(rate + noise, 1)


def build_county_profiles() -> list:
    """Build the full county profiles dataset."""
    profiles = []

    for name, info in COUNTIES.items():
        deaths_by_year = generate_annual_deaths(name, info)
        facilities = generate_treatment_facilities(info)

        # Per-year detailed data
        yearly_data = []
        for year in YEARS:
            deaths = deaths_by_year[str(year)]
            rate_per_100k = round((deaths / info["pop"]) * 100_000, 1)
            rx_rate = generate_rx_rate(info, year)
            naloxone = generate_naloxone_distribution(info, year)

            yearly_data.append({
                "year": year,
                "overdose_deaths": deaths,
                "overdose_rate_per_100k": rate_per_100k,
                "opioid_rx_rate_per_100": rx_rate,
                "naloxone_distributed": naloxone,
            })

        # Compute trend metrics
        deaths_2018 = deaths_by_year["2018"]
        deaths_2024 = deaths_by_year["2024"]
        pct_change = round(((deaths_2024 - deaths_2018) / max(deaths_2018, 1)) * 100, 1)
        peak_year = max(YEARS, key=lambda y: deaths_by_year[str(y)])

        profile = {
            "county": name,
            "fips_code": info["fips"],
            "state": "Indiana",
            "state_fips": "18",
            "population": info["pop"],
            "classification": info["class"],
            "median_household_income": info["income"],
            "treatment_facilities": facilities,
            "yearly_data": yearly_data,
            "summary": {
                "total_deaths_2018_2024": sum(deaths_by_year.values()),
                "avg_annual_deaths": round(sum(deaths_by_year.values()) / len(YEARS), 1),
                "peak_year": peak_year,
                "peak_deaths": deaths_by_year[str(peak_year)],
                "pct_change_2018_2024": pct_change,
                "latest_rate_per_100k": yearly_data[-1]["overdose_rate_per_100k"],
                "latest_rx_rate": yearly_data[-1]["opioid_rx_rate_per_100"],
            },
        }
        profiles.append(profile)

    # Sort by latest overdose rate descending (most impacted first)
    profiles.sort(key=lambda p: p["summary"]["latest_rate_per_100k"], reverse=True)
    return profiles


def build_state_summary(profiles: list) -> dict:
    """Build statewide aggregate summary."""
    total_pop = sum(p["population"] for p in profiles)

    # Aggregate deaths by year
    yearly_totals = {}
    yearly_naloxone = {}
    for year in YEARS:
        total_deaths = 0
        total_nal = 0
        for p in profiles:
            yd = next(y for y in p["yearly_data"] if y["year"] == year)
            total_deaths += yd["overdose_deaths"]
            total_nal += yd["naloxone_distributed"]
        yearly_totals[str(year)] = total_deaths
        yearly_naloxone[str(year)] = total_nal

    total_all_deaths = sum(yearly_totals.values())

    # Classification breakdown
    by_class = {}
    for cls in ["urban", "suburban", "small_urban", "rural"]:
        counties_in_cls = [p for p in profiles if p["classification"] == cls]
        cls_pop = sum(p["population"] for p in counties_in_cls)
        cls_deaths_2024 = sum(
            next(y for y in p["yearly_data"] if y["year"] == 2024)["overdose_deaths"]
            for p in counties_in_cls
        )
        by_class[cls] = {
            "county_count": len(counties_in_cls),
            "total_population": cls_pop,
            "deaths_2024": cls_deaths_2024,
            "rate_per_100k_2024": round((cls_deaths_2024 / max(cls_pop, 1)) * 100_000, 1),
        }

    # Top 5 most impacted counties by rate
    top_5_by_rate = [
        {"county": p["county"], "rate_per_100k": p["summary"]["latest_rate_per_100k"]}
        for p in profiles[:5]
    ]

    # Top 5 by absolute deaths
    by_abs = sorted(profiles, key=lambda p: p["summary"]["avg_annual_deaths"], reverse=True)
    top_5_by_absolute = [
        {"county": p["county"], "avg_annual_deaths": p["summary"]["avg_annual_deaths"]}
        for p in by_abs[:5]
    ]

    peak_year = max(YEARS, key=lambda y: yearly_totals[str(y)])

    summary = {
        "region": "Indiana (20-county subset)",
        "description": "Statewide aggregates for 20 Indiana counties most impacted by the opioid crisis",
        "total_population": total_pop,
        "counties_analyzed": len(profiles),
        "analysis_period": "2018-2024",
        "generated_date": "2026-04-03",
        "data_source": "Synthetic data modeled on CDC WONDER, Indiana State Dept of Health, and DEA ARCOS patterns",
        "deaths_by_year": {str(k): v for k, v in yearly_totals.items()},
        "naloxone_by_year": {str(k): v for k, v in yearly_naloxone.items()},
        "total_deaths_all_years": total_all_deaths,
        "avg_annual_deaths": round(total_all_deaths / len(YEARS), 1),
        "peak_year": peak_year,
        "peak_deaths": yearly_totals[str(peak_year)],
        "pct_change_2018_2024": round(
            ((yearly_totals["2024"] - yearly_totals["2018"]) / yearly_totals["2018"]) * 100, 1
        ),
        "total_treatment_facilities": sum(p["treatment_facilities"] for p in profiles),
        "classification_breakdown": by_class,
        "top_5_counties_by_rate": top_5_by_rate,
        "top_5_counties_by_absolute_deaths": top_5_by_absolute,
        "key_findings": [
            f"Rural counties show {by_class['rural']['rate_per_100k_2024']:.1f} deaths per 100k vs {by_class['urban']['rate_per_100k_2024']:.1f} in urban areas — a {by_class['rural']['rate_per_100k_2024'] / max(by_class['urban']['rate_per_100k_2024'], 0.1):.1f}x disparity.",
            f"Overdose deaths increased {round(((yearly_totals['2024'] - yearly_totals['2018']) / yearly_totals['2018']) * 100, 1)}% from 2018 to 2024 across the 20-county region.",
            f"The COVID period (2020-2021) saw the sharpest spike, with deaths peaking at {yearly_totals[str(peak_year)]} in {peak_year}.",
            "Scott County maintains the highest per-capita rate, a legacy of the 2015 HIV/opioid outbreak that devastated the community.",
            f"Naloxone distribution increased {round(yearly_naloxone['2024'] / max(yearly_naloxone['2018'], 1), 1)}x from 2018 to 2024, yet deaths continued to rise — suggesting supply-side (fentanyl) pressure outpaces harm reduction.",
            "Opioid prescribing rates declined ~27% across the region (2018-2024), but overdose deaths rose, reflecting the shift from prescription opioids to illicit fentanyl.",
        ],
    }
    return summary


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, "processed")
    os.makedirs(output_dir, exist_ok=True)

    print("Generating county-level opioid crisis data for 20 Indiana counties...")
    profiles = build_county_profiles()

    profiles_path = os.path.join(output_dir, "county_profiles.json")
    with open(profiles_path, "w") as f:
        json.dump(profiles, f, indent=2)
    print(f"  -> Wrote {len(profiles)} county profiles to {profiles_path}")

    print("Building statewide summary...")
    summary = build_state_summary(profiles)

    summary_path = os.path.join(output_dir, "indiana_summary.json")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"  -> Wrote summary to {summary_path}")

    # Print quick sanity check
    print("\n--- Sanity Check ---")
    print(f"Total population: {summary['total_population']:,}")
    print(f"Deaths 2018: {summary['deaths_by_year']['2018']}  |  2024: {summary['deaths_by_year']['2024']}")
    print(f"Change: {summary['pct_change_2018_2024']}%")
    print(f"Peak year: {summary['peak_year']} ({summary['peak_deaths']} deaths)")
    print(f"\nTop 5 counties by per-capita rate (2024):")
    for entry in summary["top_5_counties_by_rate"]:
        print(f"  {entry['county']}: {entry['rate_per_100k']} per 100k")
    print(f"\nTop 5 counties by absolute deaths:")
    for entry in summary["top_5_counties_by_absolute_deaths"]:
        print(f"  {entry['county']}: {entry['avg_annual_deaths']} avg/year")
    print(f"\nClassification disparity:")
    for cls, data in summary["classification_breakdown"].items():
        print(f"  {cls}: {data['rate_per_100k_2024']} per 100k ({data['county_count']} counties)")
    print("\nDone.")


if __name__ == "__main__":
    main()
