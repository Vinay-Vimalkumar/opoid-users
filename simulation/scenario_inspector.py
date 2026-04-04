"""
Interactive inspector for a single simulation scenario.

Usage:
    python simulation/inspect.py <county> [naloxone=0.0] [prescribing=0.0] [treatment=0.0] [months=60] [seed=42]

Examples:
    python simulation/inspect.py Marion
    python simulation/inspect.py Marion naloxone=1.0
    python simulation/inspect.py Marion naloxone=1.0 treatment=0.5
    python simulation/inspect.py Blackford naloxone=0.8 prescribing=0.6 treatment=0.7 months=36
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from model import COUNTY_MAP, Interventions, run_scenario, run_baseline


def parse_args(argv):
    if len(argv) < 2:
        print(__doc__)
        sys.exit(1)

    county_name = argv[1]
    if county_name not in COUNTY_MAP:
        close = [c for c in COUNTY_MAP if county_name.lower() in c.lower()]
        if close:
            print(f"County '{county_name}' not found. Did you mean: {', '.join(close)}?")
        else:
            print(f"County '{county_name}' not found.")
            print(f"Available: {', '.join(COUNTY_MAP.keys())}")
        sys.exit(1)

    params = {"naloxone": 0.0, "prescribing": 0.0, "treatment": 0.0, "months": 60, "seed": 42}
    for arg in argv[2:]:
        key, _, val = arg.partition("=")
        if key not in params:
            print(f"Unknown parameter '{key}'. Valid: naloxone, prescribing, treatment, months, seed")
            sys.exit(1)
        params[key] = float(val) if key not in ("months", "seed") else int(val)

    for lever in ("naloxone", "prescribing", "treatment"):
        if not 0.0 <= params[lever] <= 1.0:
            print(f"'{lever}' must be between 0.0 and 1.0")
            sys.exit(1)

    return county_name, params


def print_section(title):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


def run(county_name, params):
    county = COUNTY_MAP[county_name]
    iv = Interventions(
        naloxone_access=params["naloxone"],
        prescribing_reduction=params["prescribing"],
        treatment_access=params["treatment"],
    )
    months = params["months"]
    seed = params["seed"]

    baseline = run_baseline(county, months=months, seed=seed)
    scenario = run_scenario(county, iv, months=months, seed=seed)

    lives_saved = baseline.total_deaths - scenario.total_deaths
    od_prevented = baseline.total_overdoses - scenario.total_overdoses
    cost_per_life = scenario.cost / lives_saved if lives_saved > 0 else float("inf")

    # ── Header ──────────────────────────────────────────────────────────────
    print(f"\n{'═' * 60}")
    print(f"  {county_name} County  |  {months} months  |  seed={seed}")
    print(f"  naloxone={params['naloxone']}  prescribing={params['prescribing']}  treatment={params['treatment']}")
    print(f"{'═' * 60}")

    # ── County profile ───────────────────────────────────────────────────────
    print_section("County Profile")
    print(f"  Population:            {county.population:>12,}")
    print(f"  Prescribing rate:      {county.prescribing_rate:>12.3f}  (monthly, fraction of gen pop)")
    print(f"  Misuse rate:           {county.misuse_rate:>12.3f}  (fraction of prescribed)")
    print(f"  OUD rate:              {county.oud_rate:>12.3f}  (fraction of misusers)")
    print(f"  Overdose rate:         {county.overdose_rate:>12.3f}  (fraction of OUD/month)")
    print(f"  Fatality rate:         {county.fatality_rate:>12.3f}  (fraction of overdoses)")
    print(f"  Treatment entry rate:  {county.treatment_entry_rate:>12.3f}  (fraction of OUD/month)")

    # ── Effective rates after intervention ───────────────────────────────────
    eff_prescribing = county.prescribing_rate * (1 - 0.6 * iv.prescribing_reduction)
    eff_fatality = county.fatality_rate * (1 - 0.5 * iv.naloxone_access)
    eff_treatment_entry = county.treatment_entry_rate * (1 + iv.treatment_access)
    eff_treatment_success = min(1.0, county.treatment_success_rate * (1 + 0.3 * iv.treatment_access))

    print_section("Effective Rates After Intervention")
    print(f"  Prescribing rate:      {eff_prescribing:>12.4f}  (was {county.prescribing_rate:.3f})")
    print(f"  Fatality rate:         {eff_fatality:>12.4f}  (was {county.fatality_rate:.3f})")
    print(f"  Treatment entry rate:  {eff_treatment_entry:>12.4f}  (was {county.treatment_entry_rate:.3f})")
    print(f"  Treatment success:     {eff_treatment_success:>12.4f}  (was {county.treatment_success_rate:.3f})")

    # ── Outcome summary ───────────────────────────────────────────────────────
    print_section("Outcome Summary")
    print(f"  {'Metric':<28} {'Baseline':>10} {'Scenario':>10} {'Change':>10}")
    print(f"  {'─'*28} {'─'*10} {'─'*10} {'─'*10}")
    print(f"  {'Total deaths':<28} {baseline.total_deaths:>10,} {scenario.total_deaths:>10,} {-lives_saved:>+10,}")
    print(f"  {'Total overdoses':<28} {baseline.total_overdoses:>10,} {scenario.total_overdoses:>10,} {-od_prevented:>+10,}")
    print(f"  {'Total treated':<28} {baseline.total_treated:>10,} {scenario.total_treated:>10,} {scenario.total_treated - baseline.total_treated:>+10,}")
    print(f"  {'Deaths per 100k':<28} {baseline.total_deaths/county.population*100000:>10.1f} {scenario.total_deaths/county.population*100000:>10.1f}")
    print(f"\n  Lives saved:      {lives_saved:,}")
    print(f"  Overdoses prevented: {od_prevented:,}")
    print(f"  Total cost:       ${scenario.cost:,.0f}")
    print(f"  Cost per life saved: ${cost_per_life:,.0f}" if lives_saved > 0 else "  Cost per life saved: N/A (no lives saved)")

    # ── Month-by-month progression (every 6 months) ──────────────────────────
    print_section("Progression (every 6 months)")
    print(f"  {'Month':>6} {'OUD':>8} {'In Tx':>8} {'Recovered':>10} {'Deaths (mo)':>12} {'Cum Deaths':>11}")
    print(f"  {'─'*6} {'─'*8} {'─'*8} {'─'*10} {'─'*12} {'─'*11}")
    for m in range(0, months, 6):
        snap = scenario.timeline[m]
        print(f"  {m+1:>6} {snap['oud']:>8,} {snap['treatment']:>8,} {snap['recovered']:>10,} "
              f"{snap['deaths_this_month']:>12,} {snap['cumulative_deaths']:>11,}")

    # ── Final compartment state ───────────────────────────────────────────────
    last = scenario.timeline[months - 1]
    print_section(f"Final Compartment State (month {months})")
    total_tracked = sum(last[k] for k in ("general", "prescribed", "misuse", "oud", "treatment", "recovered"))
    print(f"  General pop:   {last['general']:>10,}")
    print(f"  Prescribed:    {last['prescribed']:>10,}")
    print(f"  Misuse:        {last['misuse']:>10,}")
    print(f"  OUD:           {last['oud']:>10,}")
    print(f"  In treatment:  {last['treatment']:>10,}")
    print(f"  Recovered:     {last['recovered']:>10,}")
    print(f"  {'─'*22}")
    print(f"  Total tracked: {total_tracked:>10,}  (started: {county.population:,}, diff = deaths + exits)")
    print()


if __name__ == "__main__":
    county_name, params = parse_args(sys.argv)
    run(county_name, params)
