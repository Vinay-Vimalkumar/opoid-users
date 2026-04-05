/**
 * API helper with static data fallback.
 * Tries /api/ first (live server), falls back to /data/ (bundled JSON).
 */

const API = '/api'

// Static data mappings for when API is unavailable
const STATIC_FALLBACKS = {
  '/api/counterfactual': '/data/counterfactual_results.json',
  '/api/timeseries': '/data/county_timeseries.json',
  '/api/calibration': '/data/calibration_results.json',
  '/api/forecasts': '/data/county_forecasts.json',
  '/api/monte-carlo': '/data/monte_carlo_results.json',
}

// County data for simulation fallback
let _countyData = null
async function getCountyData() {
  if (_countyData) return _countyData
  try {
    const res = await fetch('/data/county_profiles.json')
    _countyData = await res.json()
  } catch { _countyData = [] }
  return _countyData
}

// Hardcoded county list for when API is down
const COUNTIES = [
  { name: 'Marion', population: 971102 }, { name: 'Lake', population: 498558 },
  { name: 'Allen', population: 388608 }, { name: 'St. Joseph', population: 272212 },
  { name: 'Vanderburgh', population: 179987 }, { name: 'Tippecanoe', population: 187076 },
  { name: 'Delaware', population: 111871 }, { name: 'Vigo', population: 105994 },
  { name: 'Madison', population: 130782 }, { name: 'Grant', population: 66263 },
  { name: 'Lawrence', population: 45070 }, { name: 'Floyd', population: 80454 },
  { name: 'Clark', population: 122738 }, { name: 'Scott', population: 24355 },
  { name: 'Fayette', population: 23360 }, { name: 'Jay', population: 20248 },
  { name: 'Blackford', population: 12091 }, { name: 'Vermillion', population: 15341 },
  { name: 'Wayne', population: 66456 }, { name: 'Henry', population: 48935 },
]

/**
 * Fetch with fallback. For GET endpoints with static data equivalents,
 * try API first, fall back to bundled JSON.
 */
export async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, options)
    if (res.ok) return res
    throw new Error(`${res.status}`)
  } catch {
    // Try static fallback for GET endpoints
    const fallback = STATIC_FALLBACKS[url]
    if (fallback && (!options.method || options.method === 'GET')) {
      return fetch(fallback)
    }
    throw new Error('API unavailable')
  }
}

/**
 * Get counties list — works offline
 */
export async function fetchCounties() {
  try {
    const res = await fetch(`${API}/counties`)
    if (res.ok) return res.json()
  } catch {}
  return COUNTIES
}

/**
 * Get RL results — works offline from bundled data
 */
export async function fetchRLResults(county, budget) {
  try {
    const res = await fetch(`${API}/rl-optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ county, budget }),
    })
    if (res.ok) return res.json()
  } catch {}

  // Fallback to bundled RL results
  try {
    const res = await fetch('/data/rl_results.json')
    const data = await res.json()
    const countyData = data.counties?.[county]
    if (countyData) {
      const storedBudget = countyData.budget || 2000000
      const ratio = budget / storedBudget
      const scale = Math.min(ratio, 2.0)
      return {
        county, budget,
        rl: { ...countyData.rl, total_lives_saved: Math.round(countyData.rl.total_lives_saved * Math.sqrt(scale) * 10) / 10 },
        greedy: { ...countyData.greedy, total_lives_saved: Math.round(countyData.greedy.total_lives_saved * Math.sqrt(scale) * 10) / 10 },
        improvement_pct: countyData.improvement_pct,
        extra_lives: countyData.extra_lives,
        summary: data.summary,
        source: 'static',
      }
    }
  } catch {}
  return null
}

export { API, COUNTIES }
