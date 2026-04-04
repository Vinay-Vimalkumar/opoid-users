import React, { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import AnimatedNumber from './AnimatedNumber'

const API = '/api'

export default function ScenarioCompare({ county }) {
  const [scenarioA, setScenarioA] = useState({ naloxone: 0, prescribing: 0, treatment: 0 })
  const [scenarioB, setScenarioB] = useState({ naloxone: 0.8, prescribing: 0.5, treatment: 0.7 })
  const [resultA, setResultA] = useState(null)
  const [resultB, setResultB] = useState(null)
  const [loading, setLoading] = useState(false)

  const runBoth = async () => {
    setLoading(true)
    try {
      const [resA, resB] = await Promise.all([
        fetch(`${API}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ county, ...scenarioA, months: 60, seed: 42 }),
        }).then(r => r.json()),
        fetch(`${API}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ county, ...scenarioB, months: 60, seed: 42 }),
        }).then(r => r.json()),
      ])
      setResultA(resA)
      setResultB(resB)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { runBoth() }, [county, scenarioA, scenarioB])

  // Merge timelines for overlay chart
  const mergedTimeline = React.useMemo(() => {
    if (!resultA?.timeline || !resultB?.timeline) return []
    return Object.keys(resultA.timeline).map(m => ({
      month: parseInt(m),
      deathsA: resultA.timeline[m].cumulative_deaths,
      deathsB: resultB.timeline[m].cumulative_deaths,
    }))
  }, [resultA, resultB])

  const SliderGroup = ({ label, tag, values, onChange, color }) => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-3 h-3 rounded-full`} style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        <span className="text-[10px] text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">{tag}</span>
      </div>
      {['naloxone', 'prescribing', 'treatment'].map(key => (
        <div key={key} className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] text-slate-400 w-20 capitalize">{key}</span>
          <input
            type="range" min="0" max="100"
            value={Math.round(values[key] * 100)}
            onChange={e => onChange({ ...values, [key]: parseInt(e.target.value) / 100 })}
            className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500"
            style={{
              background: `linear-gradient(to right, ${color} 0%, ${color} ${values[key] * 100}%, #334155 ${values[key] * 100}%, #334155 100%)`,
            }}
          />
          <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{Math.round(values[key] * 100)}%</span>
        </div>
      ))}
    </div>
  )

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h2 className="text-sm font-semibold text-slate-300 mb-4">Side-by-Side Scenario Comparison — {county} County</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SliderGroup label="Scenario A" tag="baseline" values={scenarioA} onChange={setScenarioA} color="#ef4444" />
        <SliderGroup label="Scenario B" tag="intervention" values={scenarioB} onChange={setScenarioB} color="#22c55e" />
      </div>

      {/* Stats comparison */}
      {resultA && resultB && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Deaths A</p>
            <p className="text-lg font-bold text-red-400 font-mono">
              <AnimatedNumber value={resultA.total_deaths} />
            </p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Deaths B</p>
            <p className="text-lg font-bold text-green-400 font-mono">
              <AnimatedNumber value={resultB.total_deaths} />
            </p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Difference</p>
            <p className="text-lg font-bold text-blue-400 font-mono">
              <AnimatedNumber value={resultA.total_deaths - resultB.total_deaths} prefix={resultA.total_deaths > resultB.total_deaths ? '+' : ''} />
            </p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500">Cost B</p>
            <p className="text-lg font-bold text-amber-400 font-mono">
              ${(resultB.cost / 1_000_000).toFixed(1)}M
            </p>
          </div>
        </div>
      )}

      {/* Overlaid timeline */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={mergedTimeline}>
          <defs>
            <linearGradient id="gradA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
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
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            labelFormatter={m => `Month ${m}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="deathsA" stroke="#ef4444" fill="url(#gradA)" name="Scenario A" />
          <Area type="monotone" dataKey="deathsB" stroke="#22c55e" fill="url(#gradB)" name="Scenario B" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
