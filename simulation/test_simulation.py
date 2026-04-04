"""
Unit and integration tests for the stochastic compartmental simulation.

Run:
    python simulation/test_simulation.py
or:
    pytest simulation/test_simulation.py -v
"""

import pytest
import numpy as np
from model import (
    CountyParams,
    Interventions,
    SimResult,
    compute_cost,
    run_scenario,
    run_baseline,
    COUNTY_MAP,
    INDIANA_COUNTIES,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _marion() -> CountyParams:
    return COUNTY_MAP["Marion"]

def _blackford() -> CountyParams:
    return COUNTY_MAP["Blackford"]

def _scott() -> CountyParams:
    return COUNTY_MAP["Scott"]


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------

def test_same_seed_produces_identical_results():
    """Two runs with the same seed must return byte-identical totals."""
    c = _marion()
    r1 = run_scenario(c, Interventions(0.5, 0.5, 0.5), seed=42)
    r2 = run_scenario(c, Interventions(0.5, 0.5, 0.5), seed=42)
    assert r1.total_deaths == r2.total_deaths
    assert r1.total_overdoses == r2.total_overdoses
    assert r1.total_treated == r2.total_treated


def test_different_seeds_produce_different_results():
    """Different seeds should (almost certainly) produce different outcomes."""
    c = _marion()
    r1 = run_scenario(c, Interventions(), seed=1)
    r2 = run_scenario(c, Interventions(), seed=2)
    # With a large population the chance of identical draws is negligible
    assert r1.total_deaths != r2.total_deaths or r1.total_overdoses != r2.total_overdoses


# ---------------------------------------------------------------------------
# SimResult structure
# ---------------------------------------------------------------------------

def test_result_has_correct_month_count():
    result = run_scenario(_marion(), Interventions(), months=24, seed=42)
    assert len(result.timeline) == 24


def test_timeline_contains_required_keys():
    result = run_scenario(_marion(), Interventions(), months=12, seed=42)
    required = {"general", "prescribed", "misuse", "oud", "treatment",
                "recovered", "deaths_this_month", "overdoses_this_month",
                "cumulative_deaths"}
    for month, snapshot in result.timeline.items():
        assert required <= set(snapshot.keys()), f"Month {month} missing keys"


def test_result_fields_are_non_negative():
    result = run_scenario(_marion(), Interventions(0.5, 0.3, 0.7), seed=42)
    assert result.total_deaths >= 0
    assert result.total_overdoses >= 0
    assert result.total_treated >= 0
    assert result.cost >= 0


def test_total_deaths_matches_timeline_cumulative():
    """SimResult.total_deaths must equal the final cumulative_deaths in timeline."""
    result = run_scenario(_marion(), Interventions(), months=36, seed=42)
    final_cumulative = result.timeline[35]["cumulative_deaths"]
    assert result.total_deaths == final_cumulative


def test_total_overdoses_ge_total_deaths():
    """Can't die without overdosing first."""
    result = run_scenario(_blackford(), Interventions(), seed=42)
    assert result.total_overdoses >= result.total_deaths


# ---------------------------------------------------------------------------
# Compartment integrity
# ---------------------------------------------------------------------------

def test_all_compartments_non_negative():
    """No compartment should go negative at any point."""
    result = run_scenario(_scott(), Interventions(0.0, 0.0, 0.0), seed=99)
    for month, snap in result.timeline.items():
        for key in ("general", "prescribed", "misuse", "oud", "treatment", "recovered"):
            assert snap[key] >= 0, f"Month {month}: {key} = {snap[key]}"


def test_cumulative_deaths_monotonically_increasing():
    result = run_scenario(_marion(), Interventions(), seed=42)
    prev = 0
    for month in sorted(result.timeline):
        current = result.timeline[month]["cumulative_deaths"]
        assert current >= prev, f"Deaths decreased at month {month}"
        prev = current


# ---------------------------------------------------------------------------
# Intervention effects
# ---------------------------------------------------------------------------

def test_naloxone_reduces_deaths():
    """Full naloxone deployment must reduce deaths vs no naloxone."""
    c = _marion()
    baseline = run_scenario(c, Interventions(naloxone_access=0.0), seed=42)
    with_naloxone = run_scenario(c, Interventions(naloxone_access=1.0), seed=42)
    assert with_naloxone.total_deaths < baseline.total_deaths


def test_treatment_reduces_deaths():
    """Full treatment access must reduce deaths vs no treatment."""
    c = _marion()
    baseline = run_scenario(c, Interventions(treatment_access=0.0), seed=42)
    with_treatment = run_scenario(c, Interventions(treatment_access=1.0), seed=42)
    assert with_treatment.total_deaths < baseline.total_deaths


def test_prescribing_reduction_reduces_overdoses():
    """Reducing prescribing should reduce total overdoses over 60 months."""
    c = _marion()
    baseline = run_scenario(c, Interventions(prescribing_reduction=0.0), seed=42)
    reduced = run_scenario(c, Interventions(prescribing_reduction=1.0), seed=42)
    assert reduced.total_overdoses < baseline.total_overdoses


def test_treatment_increases_treated_count():
    """More treatment access should result in more people treated."""
    c = _marion()
    low = run_scenario(c, Interventions(treatment_access=0.0), seed=42)
    high = run_scenario(c, Interventions(treatment_access=1.0), seed=42)
    assert high.total_treated > low.total_treated


def test_full_intervention_beats_partial():
    """All levers at 1.0 should save more lives than all at 0.5."""
    c = _blackford()
    partial = run_scenario(c, Interventions(0.5, 0.5, 0.5), seed=42)
    full = run_scenario(c, Interventions(1.0, 1.0, 1.0), seed=42)
    assert full.total_deaths <= partial.total_deaths


# ---------------------------------------------------------------------------
# Cost calculations
# ---------------------------------------------------------------------------

def test_zero_intervention_has_zero_cost():
    cost = compute_cost(Interventions(0.0, 0.0, 0.0), population=100_000, months=60)
    assert cost == 0.0


def test_cost_scales_with_population():
    """Naloxone cost is proportional to population."""
    cost_small = compute_cost(Interventions(naloxone_access=1.0), population=50_000, months=12)
    cost_large = compute_cost(Interventions(naloxone_access=1.0), population=100_000, months=12)
    assert cost_large == pytest.approx(cost_small * 2, rel=1e-6)


def test_cost_scales_with_months():
    """Total cost should scale linearly with simulation length."""
    cost_12 = compute_cost(Interventions(0.5, 0.0, 0.0), population=100_000, months=12)
    cost_24 = compute_cost(Interventions(0.5, 0.0, 0.0), population=100_000, months=24)
    assert cost_24 == pytest.approx(cost_12 * 2, rel=1e-6)


def test_run_scenario_cost_matches_compute_cost():
    """SimResult.cost must match compute_cost for the same inputs."""
    c = _marion()
    iv = Interventions(0.4, 0.6, 0.3)
    result = run_scenario(c, iv, months=60, seed=42)
    expected_cost = compute_cost(iv, c.population, 60)
    assert result.cost == round(expected_cost, 2)


def test_naloxone_cost_formula():
    """Spot-check: naloxone_access=1.0 → 1 kit/500 people/month × $75."""
    population = 100_000
    months = 12
    kits_per_month = population / 500  # = 200
    expected = kits_per_month * 75 * months  # = 180,000
    cost = compute_cost(Interventions(naloxone_access=1.0), population=population, months=months)
    assert cost == pytest.approx(expected, rel=1e-6)


# ---------------------------------------------------------------------------
# Cross-county comparisons
# ---------------------------------------------------------------------------

def test_rural_county_higher_death_rate_than_urban():
    """Scott (rural, high rates) should have more deaths per capita than Marion (urban)."""
    months = 60
    seed = 42
    scott_r = run_scenario(_scott(), Interventions(), months=months, seed=seed)
    marion_r = run_scenario(_marion(), Interventions(), months=months, seed=seed)

    scott_rate = scott_r.total_deaths / _scott().population
    marion_rate = marion_r.total_deaths / _marion().population
    assert scott_rate > marion_rate, (
        f"Scott death rate {scott_rate:.5f} should exceed Marion {marion_rate:.5f}"
    )


def test_baseline_equals_zero_intervention_scenario():
    """run_baseline must produce same result as run_scenario with Interventions()."""
    c = _blackford()
    b = run_baseline(c, months=24, seed=7)
    s = run_scenario(c, Interventions(), months=24, seed=7)
    assert b.total_deaths == s.total_deaths
    assert b.total_overdoses == s.total_overdoses
    assert b.cost == s.cost


def test_all_counties_run_without_error():
    """Every county in INDIANA_COUNTIES must complete a run without raising."""
    iv = Interventions(0.5, 0.5, 0.5)
    for county in INDIANA_COUNTIES:
        result = run_scenario(county, iv, months=12, seed=42)
        assert isinstance(result, SimResult)
        assert result.total_deaths >= 0


def test_all_counties_produce_finite_values():
    """No county should ever produce NaN or infinite death/overdose counts."""
    for county in INDIANA_COUNTIES:
        result = run_scenario(county, Interventions(1.0, 1.0, 1.0), months=60, seed=42)
        assert np.isfinite(result.total_deaths)
        assert np.isfinite(result.total_overdoses)
        assert np.isfinite(result.total_treated)
        assert np.isfinite(result.cost)


# ---------------------------------------------------------------------------
# Standalone runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    tests = [
        ("Determinism (same seed)", test_same_seed_produces_identical_results),
        ("Determinism (diff seed)", test_different_seeds_produce_different_results),
        ("Timeline month count", test_result_has_correct_month_count),
        ("Timeline keys", test_timeline_contains_required_keys),
        ("Non-negative fields", test_result_fields_are_non_negative),
        ("Deaths == cumulative", test_total_deaths_matches_timeline_cumulative),
        ("Overdoses >= deaths", test_total_overdoses_ge_total_deaths),
        ("Compartments non-negative", test_all_compartments_non_negative),
        ("Cumulative deaths monotonic", test_cumulative_deaths_monotonically_increasing),
        ("Naloxone reduces deaths", test_naloxone_reduces_deaths),
        ("Treatment reduces deaths", test_treatment_reduces_deaths),
        ("Prescribing reduces overdoses", test_prescribing_reduction_reduces_overdoses),
        ("Treatment increases treated", test_treatment_increases_treated_count),
        ("Full beats partial", test_full_intervention_beats_partial),
        ("Zero cost when no intervention", test_zero_intervention_has_zero_cost),
        ("Cost scales with population", test_cost_scales_with_population),
        ("Cost scales with months", test_cost_scales_with_months),
        ("Scenario cost == compute_cost", test_run_scenario_cost_matches_compute_cost),
        ("Naloxone cost formula", test_naloxone_cost_formula),
        ("Rural > urban death rate", test_rural_county_higher_death_rate_than_urban),
        ("Baseline == zero-intervention", test_baseline_equals_zero_intervention_scenario),
        ("All counties run", test_all_counties_run_without_error),
        ("All counties finite", test_all_counties_produce_finite_values),
    ]

    passed = failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {name}: {e}")
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
