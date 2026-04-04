import React, { useState, useEffect, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import AnimatedNumber from './AnimatedNumber'

const API = '/api'

export default function MonteCarloChart({ county, interventions }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!county) return
    setLoading(true)
    fetch(`${API}/montecarlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        county,
        ...interventions,
        months: 60,
        num_seeds: 50,
      }),
    })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => {
        if (!d?.timeline) throw new Error('bad response')
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [county, interventions?.naloxone, interventions?.prescribing, interventions?.treatment])

  const chartData = useMemo(() => {
    if (!data?.timeline) return []
    return Object.values(data.timeline).filter((_, i) => i % 2 === 0) // every other month for perf
  }, [data])

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 mb-2">Monte Carlo Uncertainty</h2>
        <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
          Running 50 simulations...
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-300">Monte Carlo Uncertainty (50 runs)</h2>
        <span className="text-[10px] text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
          Stochastic variance
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Shaded region shows 10th-90th percentile range across random seeds
      </p>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-slate-900/50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-slate-500">Lives Saved (median)</p>
          <p className="text-lg font-bold text-green-400 font-mono">
            <AnimatedNumber value={data.lives_saved_median} />
          </p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-slate-500">Range (10th-90th)</p>
          <p className="text-sm font-bold text-blue-400 font-mono">
            {data.lives_saved_p10} – {data.lives_saved_p90}
          </p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-slate-500">Deaths (median)</p>
          <p className="text-lg font-bold text-red-400 font-mono">
            <AnimatedNumber value={data.deaths_median} />
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="mcBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#64748b" fontSize={10}
            tickFormatter={m => `${Math.floor(m / 12)}y`} interval={5} />
          <YAxis stroke="#64748b" fontSize={10} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#ffffff' }}
            labelFormatter={m => `Month ${m}`}
            formatter={(value, name) => {
              const labels = { p90: '90th pctile', p10: '10th pctile', median: 'Median' }
              return [value, labels[name] || name]
            }}
          />
          <Area type="monotone" dataKey="p90" stroke="transparent" fill="url(#mcBand)" />
          <Area type="monotone" dataKey="p10" stroke="transparent" fill="#0f172a" />
          <Area type="monotone" dataKey="median" stroke="#3b82f6" fill="none" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
