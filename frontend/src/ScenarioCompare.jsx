import React, { useState, useEffect, useRef, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import AnimatedNumber from './AnimatedNumber'

const API = '/api'

function SliderGroup({ label, tag, values, onChange, color }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        <span className="text-[10px] text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">{tag}</span>
      </div>
      {['naloxone', 'prescribing', 'treatment'].map(key => {
        const pct = `${Math.round(values[key] * 100)}%`
        return (
          <div key={key} className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-slate-400 capitalize">{key}</span>
              <span className="text-xs font-mono font-semibold" style={{ color }}>{pct}</span>
            </div>
            <input
              type="range" min="0" max="100"
              value={Math.round(values[key] * 100)}
              onChange={e => onChange({ ...values, [key]: parseInt(e.target.value) / 100 })}
              className="w-full cursor-pointer"
              style={{ '--pct': pct }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function ScenarioCompare({ county }) {
  const [scenarioA, setScenarioA] = useState({ naloxone: 0, prescribing: 0, treatment: 0 })
  const [scenarioB, setScenarioB] = useState({ naloxone: 0.8, prescribing: 0.5, treatment: 0.7 })
  const [resultA, setResultA] = useState(null)
  const [resultB, setResultB] = useState(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  // Keep latest values in refs so debounced callback always reads current state
  const aRef = useRef(scenarioA)
  const bRef = useRef(scenarioB)
  aRef.current = scenarioA
  bRef.current = scenarioB

  const runBoth = async (a, b) => {
    setLoading(true)
    try {
      const [resA, resB] = await Promise.all([
        fetch(`${API}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ county, ...a, months: 60, seed: 42 }),
        }).then(r => r.json()),
        fetch(`${API}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ county, ...b, months: 60, seed: 42 }),
        }).then(r => r.json()),
      ])
      setResultA(resA)
      setResultB(resB)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  // Debounce: only fire API after 400ms of no slider movement
  const scheduleRun = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runBoth(aRef.current, bRef.current)
    }, 400)
  }

  // Run on mount and when county changes
  useEffect(() => {
    runBoth(aRef.current, bRef.current)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [county])

  const handleA = (newA) => { setScenarioA(newA); scheduleRun() }
  const handleB = (newB) => { setScenarioB(newB); scheduleRun() }

  const mergedTimeline = useMemo(() => {
    if (!resultA?.timeline || !resultB?.timeline) return []
    return Object.keys(resultA.timeline).map(m => ({
      month: parseInt(m),
      deathsA: resultA.timeline[m].cumulative_deaths,
      deathsB: resultB.timeline[m].cumulative_deaths,
    }))
  }, [resultA, resultB])

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">
        Side-by-Side Scenario Comparison — {county} County
      </h2>

      {/* Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900 rounded-xl p-4 border border-slate-800">
        <SliderGroup label="Scenario A" tag="baseline" values={scenarioA} onChange={handleA} color="#ef4444" />
        <SliderGroup label="Scenario B" tag="intervention" values={scenarioB} onChange={handleB} color="#22c55e" />
      </div>

      {/* Stats */}
      {loading && !resultA && (
        <div className="text-slate-600 text-sm text-center py-6">Running simulations…</div>
      )}

      {resultA && resultB && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Deaths A (5yr)</p>
              <p className="text-2xl font-black font-mono text-red-400">
                <AnimatedNumber value={resultA.total_deaths} />
              </p>
            </div>
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Deaths B (5yr)</p>
              <p className="text-2xl font-black font-mono text-green-400">
                <AnimatedNumber value={resultB.total_deaths} />
              </p>
            </div>
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Lives Saved</p>
              <p className="text-2xl font-black font-mono text-cyan-400">
                <AnimatedNumber
                  value={resultA.total_deaths - resultB.total_deaths}
                  prefix={resultA.total_deaths > resultB.total_deaths ? '+' : ''}
                />
              </p>
            </div>
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Cost of B</p>
              <p className="text-2xl font-black font-mono text-amber-400">
                ${(resultB.cost / 1_000_000).toFixed(1)}M
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-500 mb-3">Cumulative deaths over 5 years — gap between lines = lives saved by intervention</p>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={mergedTimeline}>
                <defs>
                  <linearGradient id="gradA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={10}
                  tickFormatter={m => `${Math.floor(m / 12)}y`} interval={11} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#ffffff' }}
                  labelFormatter={m => `Month ${m}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="deathsA" stroke="#ef4444" fill="url(#gradA)" name="Scenario A" dot={false} />
                <Area type="monotone" dataKey="deathsB" stroke="#22c55e" fill="url(#gradB)" name="Scenario B" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
