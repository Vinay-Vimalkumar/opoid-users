"""
Process ALL datasets into enriched county profiles.
Sources:
  1. CDC VSRR County Overdose Deaths
  2. CDC Drug Poisoning Mortality by County
  3. Indiana OTP Treatment Facility Locations
  4. Indiana Rx & Fatal Overdose Relationship
  5. Indiana OD Touchpoints (ED visits, EMS, jail before fatal OD)
  6. County Health Rankings (income, insurance, drug deaths)

Outputs enriched county_profiles.json and indiana_summary.json
"""

import csv
import json
from pathlib import Path
from collections import defaultdict

RAW_DIR = Path(__file__).parent / "raw"
OUT_DIR = Path(__file__).parent / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

TARGET_COUNTIES = {
    "18097": "Marion", "18089": "Lake", "18003": "Allen", "18141": "St. Joseph",
    "18163": "Vanderburgh", "18157": "Tippecanoe", "18035": "Delaware", "18177": "Wayne",
    "18167": "Vigo", "18095": "Madison", "18019": "Clark", "18043": "Floyd",
    "18143": "Scott", "18093": "Lawrence", "18041": "Fayette", "18075": "Jay",
    "18009": "Blackford", "18165": "Vermillion", "18065": "Henry", "18053": "Grant",
}

# County FIPS suffix (3-digit) → name mapping for Indiana state datasets
COUNTY_FIPS_3 = {fips[-3:]: name for fips, name in TARGET_COUNTIES.items()}


def process_cdc_overdose():
    """CDC VSRR Provisional County-Level Drug Overdose Deaths."""
    filepath = RAW_DIR / "cdc_county_overdose.csv"
    if not filepath.exists():
        print(f"  SKIP: {filepath.name} not found")
        return {}

    data = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fips = row.get("FIPS", "").strip()
            if not fips or not fips.startswith("18"):
                continue
            try:
                year = int(row.get("Year", "0"))
                month = int(row.get("Month", "0"))
            except ValueError:
                continue
            deaths_str = row.get("Provisional Drug Overdose Deaths", "").strip()
            data[fips][year][month] = int(deaths_str) if deaths_str.isdigit() else 5

    print(f"  CDC Overdose: {len(data)} IN counties")
    return data


def process_cdc_mortality():
    """CDC Drug Poisoning Mortality by County."""
    filepath = RAW_DIR / "cdc_drug_poisoning_mortality.csv"
    if not filepath.exists():
        print(f"  SKIP: {filepath.name} not found")
        return {}

    data = defaultdict(dict)
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fips = row.get("FIPS", "").strip()
            if not fips or not fips.startswith("18"):
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

    print(f"  CDC Mortality: {len(data)} IN counties")
    return data


def process_treatment_locations():
    """Indiana OTP treatment facility locations."""
    filepath = RAW_DIR / "indiana_treatment_locations.csv"
    if not filepath.exists():
        print(f"  SKIP: {filepath.name} not found")
        return {}

    # County FIPS code → list of facilities
    facilities = defaultdict(list)
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            county_fips = row.get("LOCATION_COUNTY", "").strip().zfill(3)
            facilities[county_fips].append({
                "name": row.get("NAME", ""),
                "city": row.get("LOCATION_CITY", ""),
                "lat": row.get("LATITUDE", ""),
                "lng": row.get("LONGITUDE", ""),
            })

    print(f"  Treatment locations: {sum(len(v) for v in facilities.values())} facilities in {len(facilities)} counties")
    return facilities


def process_od_touchpoints():
    """Indiana OD Touchpoints — ED visits, EMS, jail contacts before fatal OD, by county."""
    filepath = RAW_DIR / "indiana_od_touchpoints.csv"
    if not filepath.exists():
        print(f"  SKIP: {filepath.name} not found")
        return {}

    # county_fips_3 → touchpoint_type → year → measure → value
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fips3 = row.get("GEOGRAPHY_FIPS", "").strip().zfill(3)
            county_name = row.get("GEOGRAPHY_NAME", "").strip()
            year = row.get("YEAR", "").strip()
            tp_type = row.get("TOUCHPOINT_TYPE", "").strip()
            measure = row.get("MEASURE_NAME", "").strip()
            value = row.get("MEASURE_VALUE", "").strip()

            try:
                value = float(value)
            except (ValueError, TypeError):
                continue

            data[fips3][tp_type][year][measure] = value

    print(f"  OD Touchpoints: {len(data)} counties")
    return data


def process_health_rankings():
    """County Health Rankings — drug OD mortality, income, insurance, etc."""
    filepath = RAW_DIR / "county_health_rankings_indiana.csv"
    if not filepath.exists():
        print(f"  SKIP: {filepath.name} not found")
        return {}

    data = {}
    with open(filepath, "r", encoding="utf-8-sig") as f:
        lines = f.readlines()

    # Row 0 = human-readable headers, Row 1 = code headers, Row 2+ = data
    # Use row 1 (code headers) as the DictReader fieldnames
    if len(lines) < 3:
        print(f"  Health Rankings: file too short")
        return {}

    import io
    code_header = lines[1]
    data_lines = lines[2:]
    reader = csv.DictReader(io.StringIO(code_header + "".join(data_lines)))

    for row in reader:
        state = row.get("state", "").strip()
        if state != "IN":
            continue
        fips = row.get("fipscode", "").strip()
        county = row.get("county", "").strip()
        if not fips or county == "" or fips.endswith("000"):
            continue  # Skip state-level row

        data[fips] = {
            "county": county,
            "drug_od_mortality_rate": _safe_float(row.get("v015_rawvalue")),
            "median_household_income": _safe_float(row.get("v063_rawvalue")),
            "pct_uninsured": _safe_float(row.get("v085_rawvalue")),
            "physically_unhealthy_days": _safe_float(row.get("v003_rawvalue")),
            "mentally_unhealthy_days": _safe_float(row.get("v036_rawvalue")),
            "pct_some_college": _safe_float(row.get("v024_rawvalue")),
            "pct_smokers": _safe_float(row.get("v009_rawvalue")),
            "pct_obese": _safe_float(row.get("v011_rawvalue")),
            "pct_excessive_drinking": _safe_float(row.get("v140_rawvalue")),
        }

    print(f"  Health Rankings: {len(data)} IN counties")
    return data


def _safe_float(val):
    if val is None:
        return None
    val = str(val).strip()
    if val == "" or val.lower() == "nan":
        return None
    try:
        return round(float(val), 4)
    except ValueError:
        return None


def process_rx_overdose():
    """Indiana Rx & Fatal Overdose Relationship (aggregate demographics)."""
    filepath = RAW_DIR / "indiana_rx_overdose.csv"
    if not filepath.exists():
        print(f"  SKIP: {filepath.name} not found")
        return {}

    data = defaultdict(list)
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            year = row.get("OVERDOSE_YEAR", "").strip()
            category = row.get("CATEGORY", "").strip()
            value = row.get("CATEGORY_VALUE", "").strip()
            script_pct = row.get("SCRIPT_PERCENTAGE", "").strip()
            rate = row.get("FATAL_OD_RATE_PER_100K", "").strip()

            data[year].append({
                "category": category,
                "value": value,
                "script_pct": _safe_float(script_pct),
                "fatal_od_rate": _safe_float(rate),
            })

    print(f"  Rx/Overdose: {len(data)} years of demographic data")
    return data


def build_enriched_profiles(cdc_od, cdc_mort, treatment, touchpoints, health_rankings, rx_data):
    """Build comprehensive county profiles combining ALL data sources."""
    profiles = []

    for fips, county_name in sorted(TARGET_COUNTIES.items(), key=lambda x: x[1]):
        fips3 = fips[-3:]
        profile = {"name": county_name, "fips": fips, "state": "Indiana"}

        # --- CDC Mortality rates ---
        mort = cdc_mort.get(fips, {})
        latest_year = max(mort.keys()) if mort else None
        if latest_year:
            profile["population"] = mort[latest_year].get("population", 0)
            profile["urban_rural"] = mort[latest_year].get("urban_rural", "Unknown")
        else:
            profile["population"] = 0
            profile["urban_rural"] = "Unknown"

        # Yearly rate data
        yearly_rates = {}
        for year in sorted(mort.keys()):
            yearly_rates[year] = {
                "year": year,
                "model_death_rate_per_100k": mort[year]["rate_per_100k"],
                "population": mort[year]["population"],
            }

        # Overlay VSRR death counts
        vsrr = cdc_od.get(fips, {})
        for year in sorted(vsrr.keys()):
            monthly = vsrr[year]
            annual = sum(monthly.values())
            if year not in yearly_rates:
                yearly_rates[year] = {"year": year}
            yearly_rates[year]["provisional_deaths"] = annual
            yearly_rates[year]["monthly_deaths"] = dict(sorted(monthly.items()))

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

        # --- Treatment facilities ---
        county_facilities = treatment.get(fips3, [])
        profile["treatment_facilities"] = len(county_facilities)
        profile["treatment_facility_names"] = [f["name"] for f in county_facilities]

        # --- OD Touchpoints ---
        tp = touchpoints.get(fips3, {})
        if tp:
            touchpoint_summary = {}
            for tp_type, years in tp.items():
                # Get latest year's count
                latest = max(years.keys()) if years else None
                if latest:
                    count_key = [k for k in years[latest].keys() if "Count" in k or "count" in k]
                    if count_key:
                        touchpoint_summary[tp_type] = years[latest][count_key[0]]
            if touchpoint_summary:
                profile["od_touchpoints"] = touchpoint_summary

        # --- County Health Rankings ---
        chr_data = health_rankings.get(fips, {})
        if chr_data:
            profile["median_household_income"] = chr_data.get("median_household_income")
            profile["pct_uninsured"] = chr_data.get("pct_uninsured")
            profile["drug_od_mortality_rate_chr"] = chr_data.get("drug_od_mortality_rate")
            profile["pct_smokers"] = chr_data.get("pct_smokers")
            profile["pct_excessive_drinking"] = chr_data.get("pct_excessive_drinking")
            profile["mentally_unhealthy_days"] = chr_data.get("mentally_unhealthy_days")

        profiles.append(profile)

    return profiles


def build_summary(profiles, rx_data):
    """Build statewide summary."""
    total_pop = sum(p.get("population", 0) for p in profiles)

    yearly_totals = defaultdict(int)
    for p in profiles:
        for yr in p.get("yearly_data", []):
            if "provisional_deaths" in yr:
                yearly_totals[yr["year"]] += yr["provisional_deaths"]

    by_rate = sorted([p for p in profiles if p.get("latest_rate_per_100k")],
                     key=lambda x: x["latest_rate_per_100k"], reverse=True)
    by_deaths = sorted([p for p in profiles if p.get("total_provisional_deaths")],
                       key=lambda x: x["total_provisional_deaths"], reverse=True)

    total_facilities = sum(p.get("treatment_facilities", 0) for p in profiles)
    counties_with_facilities = sum(1 for p in profiles if p.get("treatment_facilities", 0) > 0)

    summary = {
        "total_counties": len(profiles),
        "total_population": total_pop,
        "yearly_death_totals": dict(sorted(yearly_totals.items())),
        "total_treatment_facilities": total_facilities,
        "counties_with_treatment": counties_with_facilities,
        "counties_without_treatment": len(profiles) - counties_with_facilities,
        "top_5_by_rate": [
            {"county": p["name"], "rate_per_100k": p["latest_rate_per_100k"]}
            for p in by_rate[:5]
        ],
        "top_5_by_total_deaths": [
            {"county": p["name"], "total_deaths": p.get("total_provisional_deaths", 0)}
            for p in by_deaths[:5]
        ],
        "rx_demographic_data": dict(rx_data) if rx_data else None,
        "data_sources": [
            "CDC VSRR Provisional County-Level Drug Overdose Deaths (gb4e-yj24)",
            "CDC Drug Poisoning Mortality by County (rpvx-m2md)",
            "Indiana OTP Treatment Facility Locations (hub.mph.in.gov)",
            "Indiana Opioid Prescription & Fatal Overdose Relationship (hub.mph.in.gov)",
            "Indiana OD Touchpoints: Prevalence, Frequency, Recency (hub.mph.in.gov)",
            "County Health Rankings & Roadmaps 2025 (countyhealthrankings.org)",
        ],
        "notes": [
            "Suppressed counts (1-9 deaths) estimated at midpoint (5)",
            "Model-based rates are smoothed estimates, not raw counts",
            "This is a policy exploration tool, NOT medical advice",
        ],
    }
    return summary


def main():
    print("Processing ALL datasets for Indiana counties...\n")

    cdc_od = process_cdc_overdose()
    cdc_mort = process_cdc_mortality()
    treatment = process_treatment_locations()
    touchpoints = process_od_touchpoints()
    health_rankings = process_health_rankings()
    rx_data = process_rx_overdose()

    print("\nBuilding enriched profiles...")
    profiles = build_enriched_profiles(cdc_od, cdc_mort, treatment, touchpoints, health_rankings, rx_data)

    # Also rebuild timeseries
    timeseries = {}
    for fips, county_name in TARGET_COUNTIES.items():
        vsrr = cdc_od.get(fips, {})
        monthly = []
        for year in sorted(vsrr.keys()):
            for month in sorted(vsrr[year].keys()):
                monthly.append({"year": year, "month": month, "deaths": vsrr[year][month]})
        if monthly:
            timeseries[county_name] = monthly

    summary = build_summary(profiles, rx_data)

    # Save
    with open(OUT_DIR / "county_profiles.json", "w") as f:
        json.dump(profiles, f, indent=2)
    with open(OUT_DIR / "indiana_overdose_timeseries.json", "w") as f:
        json.dump(timeseries, f, indent=2)
    with open(OUT_DIR / "indiana_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nSaved {len(profiles)} enriched county profiles")
    print(f"Saved timeseries for {len(timeseries)} counties")
    print(f"\n--- HIGHLIGHTS ---")
    print(f"Population: {summary['total_population']:,}")
    print(f"Treatment facilities: {summary['total_treatment_facilities']} across {summary['counties_with_treatment']} counties")
    print(f"Counties WITH NO treatment: {summary['counties_without_treatment']}")
    top_rates_str = ', '.join(f"{e['county']} ({e['rate_per_100k']}/100K)" for e in summary['top_5_by_rate'])
    top_deaths_str = ', '.join(f"{e['county']} ({e['total_deaths']})" for e in summary['top_5_by_total_deaths'])
    print(f"\nTop rates: {top_rates_str}")
    print(f"Top deaths: {top_deaths_str}")

    # Print a few enriched profiles
    for p in profiles[:3]:
        print(f"\n{p['name']}: pop={p['population']:,}, rate={p.get('latest_rate_per_100k','?')}/100K, "
              f"facilities={p.get('treatment_facilities',0)}, "
              f"income=${p.get('median_household_income','?')}, "
              f"uninsured={p.get('pct_uninsured','?')}")


if __name__ == "__main__":
    main()
