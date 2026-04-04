"""
Process real CDC datasets for Indiana counties.

Sources:
1. VSRR Provisional County-Level Drug Overdose Deaths (gb4e-yj24)
2. Drug Poisoning Mortality by County (rpvx-m2md)

Outputs:
  - data/processed/county_profiles.json  (detailed per-county profiles)
  - data/processed/indiana_summary.json  (statewide aggregates)
  - data/processed/indiana_overdose_timeseries.json (monthly data for charts)
"""

import csv
import json
from pathlib import Path
from collections import defaultdict

RAW_DIR = Path(__file__).parent / "raw"
OUT_DIR = Path(__file__).parent / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Our 20 target counties with FIPS codes
TARGET_COUNTIES = {
    "18097": "Marion",
    "18089": "Lake",
    "18003": "Allen",
    "18141": "St. Joseph",
    "18163": "Vanderburgh",
    "18157": "Tippecanoe",
    "18035": "Delaware",
    "18177": "Wayne",
    "18167": "Vigo",
    "18095": "Madison",
    "18019": "Clark",
    "18043": "Floyd",
    "18143": "Scott",
    "18093": "Lawrence",
    "18041": "Fayette",
    "18075": "Jay",
    "18009": "Blackford",
    "18165": "Vermillion",
    "18065": "Henry",
    "18053": "Grant",
}

# All Indiana FIPS start with 18
INDIANA_FIPS_PREFIX = "18"


def process_vsrr_overdose():
    """Process VSRR Provisional County-Level Drug Overdose Deaths."""
    filepath = RAW_DIR / "cdc_county_overdose.csv"
    if not filepath.exists():
        print(f"WARNING: {filepath} not found, skipping")
        return {}

    # county FIPS -> year -> month -> deaths
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    suppressed = defaultdict(int)

    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fips = row.get("FIPS", "").strip()
            if not fips or not fips.startswith(INDIANA_FIPS_PREFIX):
                continue

            year = row.get("Year", "").strip()
            month = row.get("Month", "").strip()
            deaths_str = row.get("Provisional Drug Overdose Deaths", "").strip()

            if not year or not month:
                continue

            try:
                year = int(year)
                month = int(month)
            except ValueError:
                continue

            if deaths_str and deaths_str.isdigit():
                data[fips][year][month] = int(deaths_str)
            else:
                # Suppressed (1-9 deaths) — estimate as 5
                suppressed[fips] += 1
                data[fips][year][month] = 5  # conservative midpoint estimate

    print(f"VSRR: Found {len(data)} Indiana counties with overdose data")
    return data


def process_drug_poisoning_mortality():
    """Process Drug Poisoning Mortality by County (model-based rates)."""
    filepath = RAW_DIR / "cdc_drug_poisoning_mortality.csv"
    if not filepath.exists():
        print(f"WARNING: {filepath} not found, skipping")
        return {}

    # FIPS -> year -> {rate, population, urban_rural, ...}
    data = defaultdict(dict)

    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fips = row.get("FIPS", "").strip()
            if not fips or not fips.startswith(INDIANA_FIPS_PREFIX):
                continue

            try:
                year = int(row.get("Year", "0"))
                rate = float(row.get("Model-based Death Rate", "0"))
                pop_str = row.get("Population", "0").replace(",", "")
                pop = int(pop_str) if pop_str else 0
                urban_rural = row.get("Urban/Rural Category", "Unknown")
            except (ValueError, TypeError):
                continue

            data[fips][year] = {
                "rate_per_100k": round(rate, 2),
                "population": pop,
                "urban_rural": urban_rural,
            }

    print(f"Mortality: Found {len(data)} Indiana counties with mortality data")
    return data


def build_county_profiles(vsrr_data, mortality_data):
    """Build comprehensive county profiles combining all data sources."""
    profiles = []

    for fips, county_name in sorted(TARGET_COUNTIES.items(), key=lambda x: x[1]):
        profile = {
            "name": county_name,
            "fips": fips,
            "state": "Indiana",
        }

        # Get population and urban/rural from mortality data
        mort = mortality_data.get(fips, {})
        latest_year = max(mort.keys()) if mort else None
        if latest_year:
            profile["population"] = mort[latest_year].get("population", 0)
            profile["urban_rural"] = mort[latest_year].get("urban_rural", "Unknown")
        else:
            profile["population"] = 0
            profile["urban_rural"] = "Unknown"

        # Build yearly data from mortality rates
        yearly_rates = {}
        for year in sorted(mort.keys()):
            yearly_rates[year] = {
                "year": year,
                "model_death_rate_per_100k": mort[year]["rate_per_100k"],
                "population": mort[year]["population"],
            }

        # Overlay VSRR provisional death counts
        vsrr = vsrr_data.get(fips, {})
        for year in sorted(vsrr.keys()):
            monthly_deaths = vsrr[year]
            annual_deaths = sum(monthly_deaths.values())
            if year not in yearly_rates:
                yearly_rates[year] = {"year": year}
            yearly_rates[year]["provisional_deaths"] = annual_deaths
            yearly_rates[year]["monthly_deaths"] = dict(sorted(monthly_deaths.items()))

        profile["yearly_data"] = [yearly_rates[y] for y in sorted(yearly_rates.keys())]

        # Summary stats
        all_rates = [yr["model_death_rate_per_100k"] for yr in profile["yearly_data"]
                     if "model_death_rate_per_100k" in yr]
        all_deaths = [yr.get("provisional_deaths", 0) for yr in profile["yearly_data"]
                      if yr.get("provisional_deaths")]

        if all_rates:
            profile["latest_rate_per_100k"] = all_rates[-1]
            profile["peak_rate_per_100k"] = max(all_rates)
            profile["avg_rate_per_100k"] = round(sum(all_rates) / len(all_rates), 2)
        if all_deaths:
            profile["total_provisional_deaths"] = sum(all_deaths)
            profile["peak_annual_deaths"] = max(all_deaths)

        profiles.append(profile)

    return profiles


def build_timeseries(vsrr_data):
    """Build monthly timeseries for target counties (for frontend charts)."""
    timeseries = {}
    for fips, county_name in TARGET_COUNTIES.items():
        vsrr = vsrr_data.get(fips, {})
        monthly = []
        for year in sorted(vsrr.keys()):
            for month in sorted(vsrr[year].keys()):
                monthly.append({
                    "year": year,
                    "month": month,
                    "deaths": vsrr[year][month],
                })
        if monthly:
            timeseries[county_name] = monthly
    return timeseries


def build_summary(profiles):
    """Build statewide summary statistics."""
    total_pop = sum(p.get("population", 0) for p in profiles)

    # Aggregate deaths by year across all target counties
    yearly_totals = defaultdict(int)
    for p in profiles:
        for yr in p.get("yearly_data", []):
            if "provisional_deaths" in yr:
                yearly_totals[yr["year"]] += yr["provisional_deaths"]

    # Rankings
    by_rate = sorted(
        [p for p in profiles if p.get("latest_rate_per_100k")],
        key=lambda x: x["latest_rate_per_100k"],
        reverse=True
    )
    by_deaths = sorted(
        [p for p in profiles if p.get("total_provisional_deaths")],
        key=lambda x: x["total_provisional_deaths"],
        reverse=True
    )

    summary = {
        "total_counties": len(profiles),
        "total_population": total_pop,
        "yearly_death_totals": dict(sorted(yearly_totals.items())),
        "top_5_by_rate": [
            {"county": p["name"], "rate_per_100k": p["latest_rate_per_100k"]}
            for p in by_rate[:5]
        ],
        "top_5_by_total_deaths": [
            {"county": p["name"], "total_deaths": p.get("total_provisional_deaths", 0)}
            for p in by_deaths[:5]
        ],
        "data_sources": [
            "CDC VSRR Provisional County-Level Drug Overdose Deaths (gb4e-yj24)",
            "CDC Drug Poisoning Mortality by County (rpvx-m2md)",
        ],
        "notes": [
            "Suppressed counts (1-9) estimated at midpoint (5)",
            "Model-based rates are smoothed estimates, not raw counts",
            "This is a policy exploration tool, NOT medical advice",
        ],
    }
    return summary


def main():
    print("Processing CDC data for Indiana counties...\n")

    vsrr_data = process_vsrr_overdose()
    mortality_data = process_drug_poisoning_mortality()

    profiles = build_county_profiles(vsrr_data, mortality_data)
    timeseries = build_timeseries(vsrr_data)
    summary = build_summary(profiles)

    # Save outputs
    with open(OUT_DIR / "county_profiles.json", "w") as f:
        json.dump(profiles, f, indent=2)
    print(f"Saved {len(profiles)} county profiles")

    with open(OUT_DIR / "indiana_overdose_timeseries.json", "w") as f:
        json.dump(timeseries, f, indent=2)
    print(f"Saved timeseries for {len(timeseries)} counties")

    with open(OUT_DIR / "indiana_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Saved summary stats")

    # Print highlights
    print(f"\n--- HIGHLIGHTS ---")
    print(f"Counties with data: {len(profiles)}")
    print(f"Total population covered: {summary['total_population']:,}")
    print(f"\nYearly death totals (target counties):")
    for year, deaths in sorted(summary['yearly_death_totals'].items()):
        print(f"  {year}: {deaths}")
    print(f"\nHighest rate counties:")
    for entry in summary['top_5_by_rate']:
        print(f"  {entry['county']}: {entry['rate_per_100k']}/100K")
    print(f"\nHighest total deaths:")
    for entry in summary['top_5_by_total_deaths']:
        print(f"  {entry['county']}: {entry['total_deaths']}")


if __name__ == "__main__":
    main()
