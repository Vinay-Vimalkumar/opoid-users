import React, { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, AreaChart } from 'recharts'

const API = '/api'

export default function CounterfactualView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeScenario, setActiveScenario] = useState('scott') // 'scott' | 'statewide'

  useEffect(() => {
    fetch(`${API}/counterfactual`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 flex items-center justify-center h-96">
        <p className="text-slate-400 text-sm">Loading counterfactual analysis...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
        <p className="text-slate-400 text-sm">No counterfactual data available. Run <code className="bg-slate-700 px-1 rounded">python simulation/counterfactual.py</code> first.</p>
      </div>
    )
  }

  const scott = data.scott_county
  const statewide = data.statewide_2016

  // Build chart data for Scott County
  const scottChartData = scott?.comparison?.map(row => ({
    year: row.year,
    actual: Math.round(row.actual_deaths),
    baseline: row.baseline_simulated,
    moderate: row.moderate_intervention,
    aggressive: row.aggressive_intervention,
    saved: Math.max(0, row.baseline_simulated - row.aggressive_intervention),
  })) || []

  // Statewide bar data
  const statewideData = statewide?.county_results?.sort((a, b) => b.lives_saved - a.lives_saved) || []

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="bg-gradient-to-r from-red-900/40 to-orange-900/40 rounded-xl p-6 border border-red-800/50 fade-up">
        <h2 className="text-xl font-bold text-white mb-2">
          "What If?" — Counterfactual Analysis
        </h2>
        <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">
          Using our CDC-calibrated model, we ask: <em>what would have happened if interventions
          had been deployed before the crisis peaked?</em> The model is fit to 19 years of real
          mortality data (R² = 0.71), then re-run with hypothetical interventions applied
          from a chosen start year.
        </p>
      </div>

      {/* Scenario toggle */}
      <div className="flex gap-2 fade-up fade-up-d1">
        <button
          onClick={() => setActiveScenario('scott')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 press-effect ${
            activeScenario === 'scott' ? 'bg-red-600 text-white glow-red' : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:-translate-y-0.5'
          }`}
        >
          Scott County (HIV Outbreak)
        </button>
        <button
          onClick={() => setActiveScenario('statewide')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 press-effect ${
            activeScenario === 'statewide' ? 'bg-orange-600 text-white glow-orange' : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:-translate-y-0.5'
          }`}
        >
          Statewide (2016 Fentanyl Surge)
        </button>
      </div>

      {activeScenario === 'scott' && scott && (
        <div className="space-y-4">
          {/* Context card */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 fade-up fade-up-d2 hover-lift">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-900/50 flex items-center justify-center text-red-400 text-lg flex-shrink-0">
                !
              </div>
              <div>
                <h3 className="text-white font-semibold">Scott County, Indiana</h3>
                <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                  {scott.context}
                </p>
                <p className="text-slate-300 text-sm mt-2 font-medium">
                  Question: {scott.question}
                </p>
              </div>
            </div>
          </div>

          {/* Main chart */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 fade-up fade-up-d3 chart-enter">
            <h3 className="text-sm font-semibold text-slate-300 mb-1">
              Overdose Deaths: Actual vs. Counterfactual (2003-2021)
            </h3>
            <p className="text-xs text-slate-500 mb-4">Interventions begin 2013 — two years before the HIV outbreak</p>
            <ResponsiveContainer width="100%" height={380}>
              <AreaChart data={scottChartData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="year" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#ffffff' }}
                />
                <Legend />
                <ReferenceLine x={2013} stroke="#facc15" strokeDasharray="4 4" label={{ value: 'Interventions begin', fill: '#facc15', fontSize: 10, position: 'top' }} />
                <ReferenceLine x={2015} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'HIV outbreak', fill: '#ef4444', fontSize: 10, position: 'insideBottomRight' }} />
                <Area type="monotone" dataKey="saved" fill="#22c55e" fillOpacity={0.15} stroke="none" name="Lives saved" />
                <Line type="monotone" dataKey="actual" stroke="#ef4444" strokeWidth={3} dot={{ r: 3 }} name="Actual (CDC)" />
                <Line type="monotone" dataKey="moderate" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Moderate intervention" />
                <Line type="monotone" dataKey="aggressive" stroke="#22c55e" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Aggressive intervention" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Key findings */}
          {scott.findings && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800 rounded-xl p-5 border border-red-800/30 fade-up fade-up-d4 hover-lift">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Without Intervention</p>
                <p className="text-3xl font-bold text-red-400 font-mono number-enter">
                  {scott.findings.crisis_period_2015_2021?.actual_deaths?.toFixed?.(0) ?? '—'}
                </p>
                <p className="text-xs text-slate-500 mt-1">deaths during crisis (2015-2021)</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-5 border border-green-800/30 fade-up fade-up-d5 hover-lift">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">With Aggressive Intervention</p>
                <p className="text-3xl font-bold text-green-400 font-mono number-enter">
                  {scott.findings.crisis_period_2015_2021?.with_aggressive_intervention ?? '—'}
                </p>
                <p className="text-xs text-slate-500 mt-1">deaths (naloxone 70%, treatment 60%)</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-5 border border-yellow-800/30 fade-up fade-up-d6 hover-lift">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Lives Saveable</p>
                <p className="text-3xl font-bold text-yellow-400 font-mono number-enter shimmer-text">
                  {scott.findings.aggressive_scenario?.percent_reduction ?? '—'}%
                </p>
                <p className="text-xs text-slate-500 mt-1">reduction in overdose deaths</p>
              </div>
            </div>
          )}

          <div className="bg-yellow-900/20 rounded-xl p-4 border border-yellow-800/30 fade-up fade-up-d7 gradient-border">
            <p className="text-sm text-yellow-200 font-medium">{scott.findings?.headline}</p>
          </div>
        </div>
      )}

      {activeScenario === 'statewide' && statewide && (
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-1">
              Statewide Impact: If Indiana Had Acted in 2016
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {statewide.intervention} — applied across all 20 counties from 2016
            </p>
            <ResponsiveContainer width="100%" height={Math.max(480, statewideData.length * 28)}>
              <AreaChart data={statewideData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#64748b" fontSize={10} />
                <YAxis type="category" dataKey="county" stroke="#64748b" fontSize={11} width={100} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#ffffff' }}
                  formatter={(v, name) => [Math.round(v), name]}
                />
                <Legend />
                <Area type="monotone" dataKey="actual_deaths_2016_2021" fill="#ef4444" fillOpacity={0.3} stroke="#ef4444" name="Actual deaths (2016-2021)" />
                <Area type="monotone" dataKey="counterfactual_deaths" fill="#22c55e" fillOpacity={0.3} stroke="#22c55e" name="With intervention" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Statewide summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-800 rounded-xl p-4 border border-red-800/30 fade-up fade-up-d2 hover-lift">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Actual Deaths</p>
              <p className="text-2xl font-bold text-red-400 font-mono number-enter">{statewide.total_actual_deaths?.toLocaleString()}</p>
              <p className="text-xs text-slate-500">2016-2021, 20 counties</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-green-800/30 fade-up fade-up-d3 hover-lift">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Counterfactual</p>
              <p className="text-2xl font-bold text-green-400 font-mono number-enter">{statewide.total_counterfactual_deaths?.toLocaleString()}</p>
              <p className="text-xs text-slate-500">with intervention</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-yellow-800/30 fade-up fade-up-d4 hover-lift">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Lives Saveable</p>
              <p className="text-2xl font-bold text-yellow-400 font-mono number-enter">{statewide.total_lives_saved?.toLocaleString()}</p>
              <p className="text-xs text-slate-500">estimated</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-purple-800/30 fade-up fade-up-d5 hover-lift">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Reduction</p>
              <p className="text-2xl font-bold text-purple-400 font-mono number-enter shimmer-text">{statewide.pct_reduction}%</p>
              <p className="text-xs text-slate-500">fewer deaths</p>
            </div>
          </div>

          <div className="bg-orange-900/20 rounded-xl p-4 border border-orange-800/30 fade-up fade-up-d6 gradient-border">
            <p className="text-sm text-orange-200 font-medium">{statewide.headline}</p>
          </div>
        </div>
      )}
    </div>
  )
}
