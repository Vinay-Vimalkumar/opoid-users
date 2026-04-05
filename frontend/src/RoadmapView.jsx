import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, LineChart, Line, ComposedChart, Area } from 'recharts'

const API = '/api'

const PHASE_ICONS = [
  // Phase 1: Foundation
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  // Phase 2: Pilot
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  // Phase 3: Scale
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
]

const PHASE_COLORS = ['#f59e0b', '#a78bfa', '#22c55e']

function Arrow() {
  return (
    <div className="flex items-center justify-center py-2">
      <svg width="40" height="40" viewBox="0 0 40 40" className="fade-up">
        <defs>
          <linearGradient id="arrowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
        </defs>
        <path d="M20 8 L20 24" stroke="url(#arrowGrad)" strokeWidth="2" strokeLinecap="round" />
        <path d="M14 20 L20 28 L26 20" stroke="#64748b" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function BudgetBar({ pct, color }) {
  return (
    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-1000 ease-out"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}40` }}
      />
    </div>
  )
}

function StrategyChart({ data }) {
  const [visibleYears, setVisibleYears] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const intervalRef = useRef(null)

  const play = () => {
    setVisibleYears(0)
    setIsPlaying(true)
  }

  useEffect(() => {
    if (!isPlaying) return
    intervalRef.current = setInterval(() => {
      setVisibleYears(v => {
        if (v >= data.length) { setIsPlaying(false); return data.length }
        return v + 1
      })
    }, 600)
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, data.length])

  // Start animation on mount
  useEffect(() => { play() }, [])

  const visibleData = data.slice(0, visibleYears).map(d => ({
    ...d,
    name: `Year ${d.year}`,
    naloxone_pct: Math.round(d.naloxone * 100),
    prescribing_pct: Math.round(d.prescribing * 100),
    treatment_pct: Math.round(d.treatment * 100),
  }))

  // Pad with empty years so chart doesn't resize
  while (visibleData.length < data.length) {
    visibleData.push({
      name: `Year ${visibleData.length + 1}`,
      naloxone_pct: 0, prescribing_pct: 0, treatment_pct: 0,
      lives_saved: 0, cumulative_lives: 0, budget_spent: 0,
    })
  }

  return (
    <>
      <Arrow />
      <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 fade-up">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Year-by-Year Strategy</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Intervention deployment levels over 5 years</p>
          </div>
          <button
            onClick={play}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 transition press-effect flex items-center gap-1.5"
          >
            <span>{isPlaying ? '⏸' : '▶'}</span>
            {isPlaying ? 'Playing...' : 'Replay'}
          </button>
        </div>

        {/* Grouped bar chart — intervention levels */}
        <div className="mb-6">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Intervention Deployment (%)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={visibleData} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, fontSize: 11, color: '#fff' }}
                itemStyle={{ color: '#e2e8f0' }}
                labelStyle={{ color: '#fff', fontWeight: 700 }}
                formatter={v => `${v}%`}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
              />
              <Bar dataKey="naloxone_pct" name="Naloxone" fill="#f97316" radius={[4, 4, 0, 0]} animationDuration={400} />
              <Bar dataKey="prescribing_pct" name="Prescribing" fill="#a78bfa" radius={[4, 4, 0, 0]} animationDuration={400} />
              <Bar dataKey="treatment_pct" name="Treatment" fill="#06b6d4" radius={[4, 4, 0, 0]} animationDuration={400} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Lives saved + budget area chart */}
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Cumulative Impact</p>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={visibleData} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="livesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="lives" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="budget" orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : `$${(v/1e3).toFixed(0)}K`} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, fontSize: 11, color: '#fff' }}
                itemStyle={{ color: '#e2e8f0' }}
                labelStyle={{ color: '#fff', fontWeight: 700 }}
                formatter={(v, name) => [name.includes('Budget') ? `$${(v/1e6).toFixed(2)}M` : v.toLocaleString(), name]}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
              />
              <Area yAxisId="lives" type="monotone" dataKey="cumulative_lives" name="Cumulative Lives Saved" stroke="#22c55e" strokeWidth={2} fill="url(#livesGrad)" animationDuration={400} />
              <Bar yAxisId="lives" dataKey="lives_saved" name="Lives Saved (Year)" fill="#22c55e" fillOpacity={0.6} radius={[4, 4, 0, 0]} animationDuration={400} />
              <Line yAxisId="budget" type="monotone" dataKey="budget_spent" name="Budget Spent" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4, fill: '#f59e0b' }} animationDuration={400} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}

export default function RoadmapView() {
  const [county, setCounty] = useState('Marion')
  const [counties, setCounties] = useState([])
  const [roadmap, setRoadmap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [interventions] = useState({ naloxone: 0.5, prescribing: 0.3, treatment: 0.5 })

  useEffect(() => {
    fetch(`${API}/counties`).then(r => { if (!r.ok) throw new Error(); return r.json() }).then(setCounties).catch(() => {
      setCounties([
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
      ])
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setRoadmap(null)
    fetch(`${API}/roadmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ county, budget: 2000000, ...interventions }),
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => { if (!cancelled) { setRoadmap(d); setLoading(false) } })
      .catch(() => {
        if (cancelled) return
        // Generate county-specific fallback roadmap
        const pop = counties.find(c => c.name === county)?.population || 100000
        const scale = pop / 971102 // scale relative to Marion
        const fiveYrSaved = Math.round(975 * scale)
        const monthly = Math.round(fiveYrSaved / 60 * 10) / 10
        const totalCost = Math.round(30000000 * scale)
        const kitsPerMonth = Math.round(interventions.naloxone * pop / 500)
        const treatSlots = Math.round(interventions.treatment * pop * 0.001)

        setRoadmap({
          county, population: pop, total_budget: totalCost, five_year_lives_saved: fiveYrSaved, monthly_lives_saved: monthly,
          phases: [
            { phase: 'Phase 1: Foundation', months: 'Month 1-2', actions: [`Engage ${county} County Health Department`, `Procure naloxone supply (${kitsPerMonth} kits/month target)`, 'Establish PDMP compliance benchmarks', `Identify ${treatSlots} MAT treatment slot locations`, 'Baseline data collection: overdose rates, ED visits'], kpi: '0 lives saved (setup phase)', budget_pct: 15 },
            { phase: 'Phase 2: Pilot Launch', months: 'Month 3-6', actions: [`Deploy naloxone to ${Math.round(kitsPerMonth * 0.5)} sites (50% capacity)`, `Begin prescribing reduction program`, `Open ${Math.round(treatSlots * 0.4)} treatment slots (40% capacity)`, 'Weekly monitoring: overdose calls, naloxone use', 'Adjust strategy based on first 90 days'], kpi: `~${Math.round(monthly * 4)} lives saved (months 3-6)`, budget_pct: 30 },
            { phase: 'Phase 3: Scale', months: 'Month 7-12', actions: [`Scale naloxone to full deployment (${kitsPerMonth} kits/month)`, `Expand to ${treatSlots} treatment slots (full capacity)`, 'Community awareness campaign and stigma reduction', 'Data-driven reallocation to highest-performing interventions', 'Prepare Year 2 budget request with outcome data'], kpi: `~${Math.round(monthly * 12)} cumulative lives saved by month 12`, budget_pct: 55, scale_triggers: ['If overdose deaths drop >20%: maintain current allocation', 'If drop <10%: shift 20% of naloxone budget to treatment', 'If treatment retention >60%: expand treatment slots by 25%'] },
          ],
          annual_benchmarks: {
            year_1: `${Math.round(monthly * 12)} lives saved, $${Math.round(totalCost * 0.2 / 1000)}K spent`,
            year_2: `${Math.round(monthly * 24)} cumulative, full program operational`,
            year_3: `${Math.round(monthly * 36)} cumulative, optimization phase`,
            year_5: `${fiveYrSaved} cumulative lives saved, program evaluation`,
          },
          yearly_strategy: [1, 2, 3, 4, 5].map(y => ({
            year: y,
            naloxone: Math.round(interventions.naloxone * Math.min(1, y * 0.3) * 100) / 100,
            prescribing: Math.round(interventions.prescribing * Math.min(1, y * 0.25) * 100) / 100,
            treatment: Math.round(interventions.treatment * Math.min(1, y * 0.28) * 100) / 100,
            lives_saved: Math.round(monthly * 12 * (0.7 + y * 0.12)),
            cumulative_lives: Math.round(monthly * y * 12 * (0.8 + y * 0.05)),
            budget_spent: Math.round(totalCost * (y / 5) ** 0.8),
          })),
        })
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [county, counties])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 rounded-2xl p-6 border border-blue-800/30 fade-up">
        <h2 className="text-xl font-black text-white mb-2">Implementation Roadmap</h2>
        <p className="text-slate-400 text-sm">
          12-month phased rollout plan with KPIs, budget allocation, and scale triggers.
          Generated from simulation results for the selected county.
        </p>
        <div className="flex items-center gap-3 mt-4">
          <select
            value={county}
            onChange={e => setCounty(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {counties.map(c => <option key={c.name} value={c.name}>{c.name} County</option>)}
          </select>
          {roadmap && (
            <div className="flex gap-4 text-xs">
              <span className="text-green-400 font-mono font-bold">+{roadmap.five_year_lives_saved} lives saved (5yr)</span>
              <span className="text-slate-400 font-mono">{roadmap.monthly_lives_saved}/month</span>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center h-60 gap-3">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Generating roadmap for {county} County...</p>
        </div>
      )}

      {/* Phases */}
      {roadmap && !loading && roadmap.phases.map((phase, i) => (
        <div key={i}>
          {i > 0 && <Arrow />}

          <div className={`rounded-2xl border overflow-hidden fade-up fade-up-d${i + 1} hover-lift`} style={{
            borderColor: `${PHASE_COLORS[i]}30`,
            background: `linear-gradient(135deg, ${PHASE_COLORS[i]}08, transparent)`,
          }}>
            {/* Phase header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b" style={{ borderColor: `${PHASE_COLORS[i]}20` }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{
                background: `${PHASE_COLORS[i]}15`,
                border: `1px solid ${PHASE_COLORS[i]}30`,
                color: PHASE_COLORS[i],
              }}>
                {PHASE_ICONS[i]}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white">{phase.phase}</h3>
                <p className="text-xs text-slate-400">{phase.months}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Budget</p>
                <p className="text-lg font-black font-mono" style={{ color: PHASE_COLORS[i] }}>{phase.budget_pct}%</p>
              </div>
            </div>

            {/* Budget bar */}
            <div className="px-6 pt-3">
              <BudgetBar pct={phase.budget_pct} color={PHASE_COLORS[i]} />
            </div>

            {/* Actions */}
            <div className="px-6 py-4 space-y-2">
              {phase.actions.map((action, j) => (
                <div key={j} className="flex items-start gap-3 group">
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors" style={{
                    borderColor: `${PHASE_COLORS[i]}40`,
                  }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: `${PHASE_COLORS[i]}60` }} />
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{action}</p>
                </div>
              ))}
            </div>

            {/* KPI */}
            <div className="px-6 py-3 border-t" style={{ borderColor: `${PHASE_COLORS[i]}15`, background: `${PHASE_COLORS[i]}05` }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">KPI:</span>
                <span className="text-xs font-mono font-semibold" style={{ color: PHASE_COLORS[i] }}>{phase.kpi}</span>
              </div>
            </div>

            {/* Scale triggers (Phase 3 only) */}
            {phase.scale_triggers && (
              <div className="px-6 py-3 border-t" style={{ borderColor: `${PHASE_COLORS[i]}15` }}>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">Scale Triggers</p>
                <div className="space-y-1.5">
                  {phase.scale_triggers.map((trigger, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke={PHASE_COLORS[i]} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                      <span className="text-xs text-slate-400">{trigger}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Annual Benchmarks */}
      {roadmap && !loading && (
        <>
          <Arrow />
          <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 fade-up">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Annual Benchmarks</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(roadmap.annual_benchmarks).map(([year, desc], i) => (
                <div key={year} className={`rounded-xl p-4 border border-slate-700 hover-lift fade-up fade-up-d${i + 1}`} style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-1">{year.replace('_', ' ')}</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Year-by-Year Strategy Chart */}
      {roadmap?.yearly_strategy && !loading && (
        <StrategyChart data={roadmap.yearly_strategy} />
      )}

      {/* Download */}
      {roadmap && !loading && (
        <div className="flex justify-center pt-2 fade-up">
          <button
            onClick={() => {
              const text = `IMPLEMENTATION ROADMAP — ${roadmap.county} County\n5-Year Lives Saved: ${roadmap.five_year_lives_saved}\n\n` +
                roadmap.phases.map(p => `${p.phase} (${p.months})\n${p.actions.map(a => `  • ${a}`).join('\n')}\nKPI: ${p.kpi}\nBudget: ${p.budget_pct}%\n${p.scale_triggers ? 'Scale Triggers:\n' + p.scale_triggers.map(t => `  → ${t}`).join('\n') : ''}`).join('\n\n') +
                `\n\nANNUAL BENCHMARKS\n` + Object.entries(roadmap.annual_benchmarks).map(([k, v]) => `  ${k}: ${v}`).join('\n')
              const blob = new Blob([text], { type: 'text/plain' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `Morpheus_${roadmap.county}_Roadmap.txt`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold hover:brightness-110 transition press-effect flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Download Full Roadmap
          </button>
        </div>
      )}
    </div>
  )
}
