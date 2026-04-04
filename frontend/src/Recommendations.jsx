import { useState, useEffect } from 'react'

const API = '/api'

// Actions stay the same — but we'll filter/prioritize based on real county data
const ACTIONS = {
  naloxone: {
    high: [
      'Expand naloxone distribution at pharmacies, community centers, and emergency departments.',
      'Train first responders, school staff, and community members in naloxone administration.',
      'Implement take-home naloxone programs at all treatment and syringe-service sites.',
      'Place naloxone vending machines in high-overdose zip codes.',
    ],
    medium: [
      'Establish standing-order naloxone prescriptions at all county pharmacies.',
      'Increase public awareness campaigns about naloxone availability and use.',
      'Partner with local EMS to track overdose hotspots and pre-position kits.',
    ],
    low: [
      'Increase naloxone accessibility through at least one community distribution site.',
      'Provide naloxone to anyone leaving jail or inpatient treatment.',
    ],
  },
  prescribing: {
    high: [
      'Implement mandatory prescriber education on opioid risks and non-opioid alternatives.',
      'Strengthen PDMP requirements — mandatory checks before every opioid prescription.',
      'Establish hard caps on morphine milligram equivalents (MME) per prescription.',
      'Increase audit frequency and license review for high-volume opioid prescribers.',
      'Restrict initial opioid prescriptions for acute pain to 3–7 day supplies.',
    ],
    medium: [
      'Provide prescribers with quarterly feedback reports on their opioid prescribing patterns.',
      'Encourage voluntary adoption of CDC opioid prescribing guidelines.',
      'Fund patient education on pain management alternatives.',
    ],
    low: [
      'Share prescribing benchmarks with county physicians.',
      'Distribute CDC opioid guidelines to all licensed prescribers.',
    ],
  },
  treatment: {
    high: [
      'Expand medication-assisted treatment (MAT) capacity — buprenorphine and methadone.',
      'Remove prior authorization barriers for MAT medications.',
      'Fund mobile treatment units to reach rural and underserved areas of the county.',
      'Increase Medicaid reimbursement rates to attract more addiction treatment providers.',
      'Establish re-entry treatment linkage programs for individuals leaving incarceration.',
    ],
    medium: [
      'Create a centralized treatment referral hotline with 24/7 availability.',
      'Fund peer recovery specialist positions in emergency departments.',
      'Expand low-barrier drop-in treatment sites without sobriety requirements.',
    ],
    low: [
      'Add at least one new licensed MAT provider per county.',
      'Reduce wait times for treatment intake to under 48 hours.',
    ],
  },
}

function getLevel(value) {
  if (value >= 0.6) return 'high'
  if (value >= 0.25) return 'medium'
  return 'low'
}

const LEVER_META = {
  naloxone:    { label: 'Naloxone Access',       icon: '💊', color: '#10b981' },
  prescribing: { label: 'Prescribing Reduction', icon: '📋', color: '#06b6d4' },
  treatment:   { label: 'Treatment Access',      icon: '🏥', color: '#a78bfa' },
}

// Generate county-specific alert badges from real profile data
function getCountyAlerts(profile) {
  const alerts = []
  if (!profile) return alerts

  const rate    = profile.latest_rate_per_100k || profile.avg_rate_per_100k || 0
  const avgRate = profile.avg_rate_per_100k || 0
  const facilities = profile.treatment_facilities || 0
  const uninsured  = profile.pct_uninsured || 0
  const income     = profile.median_household_income || 50000
  const odRaw      = profile.od_touchpoints || {}
  const edVisits   = typeof odRaw === 'object' ? (odRaw['ED visit'] || 0) : 0
  const jailBook   = typeof odRaw === 'object' ? (odRaw['Jail booking'] || 0) : 0
  const emsHits    = typeof odRaw === 'object' ? (odRaw['EMS interaction'] || 0) : 0

  // Trend: is the rate rising?
  if (rate > avgRate * 1.1)
    alerts.push({ type: 'danger', text: `Death rate (${rate.toFixed(1)}/100k) is above the county's historical average — crisis is worsening.` })
  else if (rate < avgRate * 0.9)
    alerts.push({ type: 'good', text: `Death rate (${rate.toFixed(1)}/100k) is below the county's historical average — current interventions are working.` })

  // Treatment access gap
  if (facilities === 0)
    alerts.push({ type: 'danger', text: 'No licensed treatment facilities found in county — patients must travel for care.' })
  else if (facilities === 1)
    alerts.push({ type: 'warn', text: `Only ${facilities} treatment facility serving this county — very limited capacity.` })
  else
    alerts.push({ type: 'good', text: `${facilities} treatment facilities in county: ${(profile.treatment_facility_names || []).join(', ')}.` })

  // Insurance / income
  if (uninsured > 0.15)
    alerts.push({ type: 'danger', text: `${(uninsured * 100).toFixed(0)}% of residents uninsured — major barrier to treatment access.` })
  else if (uninsured > 0.10)
    alerts.push({ type: 'warn', text: `${(uninsured * 100).toFixed(0)}% uninsured — expanding Medicaid coverage would improve treatment uptake.` })

  if (income < 45000)
    alerts.push({ type: 'warn', text: `Median household income $${income.toLocaleString()} — economic stress is a significant driver of OUD risk.` })

  // ED / EMS / Jail touchpoints
  if (edVisits > 50)
    alerts.push({ type: 'warn', text: `${edVisits} annual ED visits for overdose — ED-initiated buprenorphine programs would capture high-risk patients.` })
  if (jailBook > 10)
    alerts.push({ type: 'warn', text: `${jailBook} jail bookings with OUD history — re-entry MAT linkage is critical for this county.` })
  if (emsHits > 30)
    alerts.push({ type: 'warn', text: `${emsHits} EMS interactions for overdose — pre-position naloxone in high-response zones.` })

  return alerts
}

// Generate the top priority lever for this county based on real data
function getPriority(profile, interventions) {
  if (!profile) return null
  const facilities = profile.treatment_facilities || 0
  const uninsured  = profile.pct_uninsured || 0
  const rate       = profile.latest_rate_per_100k || 0
  const odRaw      = profile.od_touchpoints || {}
  const edVisits   = typeof odRaw === 'object' ? (odRaw['ED visit'] || 0) : 0

  // Rural with no facilities → treatment is priority
  if (facilities === 0) return 'treatment'
  // High death rate + high ED visits → naloxone urgently needed
  if (rate > 25 && edVisits > 40) return 'naloxone'
  // High uninsured → prescribing reform more viable than treatment
  if (uninsured > 0.15) return 'prescribing'
  // Default: whatever lever is lowest (most room to improve)
  const sorted = Object.entries(interventions).sort((a, b) => a[1] - b[1])
  return sorted[0][0]
}

const ALERT_STYLES = {
  danger: { bg: 'bg-red-950/40',    border: 'border-red-800/50',    dot: '#ef4444', text: 'text-red-300'    },
  warn:   { bg: 'bg-amber-950/40',  border: 'border-amber-800/50',  dot: '#f59e0b', text: 'text-amber-300'  },
  good:   { bg: 'bg-green-950/40',  border: 'border-green-800/50',  dot: '#22c55e', text: 'text-green-300'  },
}

export default function Recommendations({ interventions, county }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!county) return
    setProfile(null)
    setLoading(true)
    fetch(`${API}/county/${county}`)
      .then(r => {
        if (!r.ok) throw new Error(`API ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (!data || typeof data !== 'object' || !data.name) throw new Error('bad response')
        setProfile(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [county])

  if (!interventions) return (
    <div className="text-slate-600 text-sm text-center py-8">
      Adjust intervention levers to see recommendations.
    </div>
  )

  const alerts   = getCountyAlerts(profile)
  const priority = getPriority(profile, interventions)

  return (
    <div className="space-y-5">

      {/* County header with real stats */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-white">{county} County</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {profile?.urban_rural || '—'} &nbsp;·&nbsp; Pop. {profile?.population?.toLocaleString() || '—'}
            </p>
          </div>
          {loading && <span className="text-xs text-slate-600 animate-pulse">Loading county data…</span>}
        </div>

        {/* Real data stats row */}
        {profile && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'OD Death Rate', val: `${(profile.latest_rate_per_100k || 0).toFixed(1)}/100k`, warn: (profile.latest_rate_per_100k || 0) > 20 },
              { label: 'Uninsured',     val: `${((profile.pct_uninsured || 0) * 100).toFixed(0)}%`,     warn: (profile.pct_uninsured || 0) > 0.12 },
              { label: 'Med. Income',   val: `$${((profile.median_household_income || 0) / 1000).toFixed(0)}K`, warn: (profile.median_household_income || 50000) < 45000 },
              { label: 'Tx Facilities', val: profile.treatment_facilities ?? '—',                        warn: (profile.treatment_facilities || 0) < 2 },
            ].map(s => (
              <div key={s.label} className={`rounded-lg p-2 border ${s.warn ? 'bg-red-950/20 border-red-900/40' : 'bg-slate-800 border-slate-700'}`}>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</p>
                <p className={`text-sm font-bold font-mono ${s.warn ? 'text-red-400' : 'text-slate-200'}`}>{s.val}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* County-specific alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">County Risk Factors</p>
          {alerts.map((alert, i) => {
            const s = ALERT_STYLES[alert.type]
            return (
              <div key={i} className={`flex gap-2.5 items-start rounded-lg border px-3 py-2.5 ${s.bg} ${s.border}`}>
                <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
                <p className={`text-xs leading-relaxed ${s.text}`}>{alert.text}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Priority recommendation */}
      {priority && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold mb-1">Top Priority for {county}</p>
          <p className="text-sm text-white font-semibold">
            {LEVER_META[priority]?.icon} {LEVER_META[priority]?.label}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {priority === 'treatment' && 'Treatment capacity is critically limited — every dollar here saves the most lives in this county.'}
            {priority === 'naloxone' && 'High death rate and ED overdose volume — immediate naloxone saturation will prevent the most deaths fastest.'}
            {priority === 'prescribing' && 'High uninsured population limits treatment access — reducing the supply pipeline is the most cost-effective lever.'}
          </p>
        </div>
      )}

      {/* Per-lever action lists */}
      <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Action Plan by Lever</p>

      {Object.entries(LEVER_META).map(([key, meta]) => {
        const level   = getLevel(interventions[key] || 0)
        const actions = ACTIONS[key][level]
        const pct     = Math.round((interventions[key] || 0) * 100)
        const isPriority = key === priority

        return (
          <div
            key={key}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: isPriority ? `${meta.color}50` : undefined }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-slate-800"
              style={{ background: isPriority ? `${meta.color}08` : undefined }}
            >
              <div className="flex items-center gap-2">
                <span>{meta.icon}</span>
                <span className="text-sm font-semibold text-white">{meta.label}</span>
                {isPriority && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                    style={{ background: `${meta.color}20`, color: meta.color }}>
                    PRIORITY
                  </span>
                )}
              </div>
              <span
                className="text-xs font-mono font-bold px-2 py-0.5 rounded capitalize"
                style={{ color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}40` }}
              >
                {level} · {pct}%
              </span>
            </div>
            <ul className="px-4 py-3 space-y-2.5 bg-slate-950/40">
              {actions.map((action, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-slate-400 leading-relaxed">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      {/* OD Touchpoints breakdown */}
      {profile?.od_touchpoints && typeof profile.od_touchpoints === 'object' && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold mb-3">OD System Touchpoints (Annual)</p>
          <div className="space-y-2">
            {Object.entries(profile.od_touchpoints).map(([point, count]) => {
              const max = Math.max(...Object.values(profile.od_touchpoints))
              const pct = max > 0 ? (count / max) * 100 : 0
              return (
                <div key={point}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{point}</span>
                    <span className="text-slate-300 font-mono font-semibold">{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-orange-500/70" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-slate-600 mt-3">
            Touchpoints = system contacts where intervention is possible (ED visits, EMS, jail, pharmacy, prison release).
          </p>
        </div>
      )}
    </div>
  )
}
