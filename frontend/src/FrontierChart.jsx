import React, { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const API = '/api'

export default function FrontierChart({ county }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [budgetMax, setBudgetMax] = useState(10000000)

  useEffect(() => {
    if (!county) return
    setLoading(true)
    fetch(`${API}/frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ county, budget_max: budgetMax, steps: 20 }),
    })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => {
        if (!d?.frontier) throw new Error('bad response')
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [county, budgetMax])

  const chartData = data?.frontier?.map(f => ({
    budget: f.budget / 1_000_000,
    lives_saved: f.best_lives_saved,
    interventions: f.best_interventions,
  })) || []

  // Find diminishing returns point
  const diminishingPoint = chartData.findIndex((d, i) => {
    if (i === 0) return false
    const prevRate = i > 1 ? (chartData[i-1].lives_saved - chartData[i-2].lives_saved) : chartData[0].lives_saved
    const curRate = d.lives_saved - chartData[i-1].lives_saved
    return curRate < prevRate * 0.3 && curRate > 0
  })

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-300">Cost-Effectiveness Frontier — {county}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Max budget:</span>
          <select
            value={budgetMax}
            onChange={e => setBudgetMax(Number(e.target.value))}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
          >
            <option value={2000000}>$2M</option>
            <option value={5000000}>$5M</option>
            <option value={10000000}>$10M</option>
            <option value={20000000}>$20M</option>
            <option value={50000000}>$50M</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Best achievable lives saved at each budget level (Pareto frontier)
      </p>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
          Computing frontier… (this may take 10–20 seconds)
        </div>
      ) : !data ? (
        <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
          Failed to load — make sure the API server is running.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="budget"
                stroke="#64748b"
                fontSize={10}
                tickFormatter={v => `$${v}M`}
              />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#ffffff' }}
                labelFormatter={v => `Budget: $${v}M`}
                formatter={(value, name) => [value, 'Lives Saved']}
              />
              {diminishingPoint > 0 && (
                <ReferenceLine
                  x={chartData[diminishingPoint].budget}
                  stroke="#fbbf24"
                  strokeDasharray="5 5"
                  label={{ value: 'Diminishing returns', position: 'top', style: { fontSize: 10, fill: '#fbbf24' } }}
                />
              )}
              <Line
                type="monotone"
                dataKey="lives_saved"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={{ fill: '#22c55e', r: 3 }}
                activeDot={{ r: 5, fill: '#4ade80' }}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Key insight */}
          {chartData.length > 2 && (
            <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-300">
                <span className="text-green-400 font-semibold">Key insight: </span>
                {chartData[chartData.length - 1].lives_saved > 0 ? (
                  <>
                    At full budget (${(budgetMax / 1_000_000).toFixed(0)}M), the optimal strategy saves{' '}
                    <span className="font-mono font-bold text-green-400">{chartData[chartData.length - 1].lives_saved}</span> lives.
                    {diminishingPoint > 0 && (
                      <> Diminishing returns begin around <span className="font-mono text-amber-400">${chartData[diminishingPoint].budget.toFixed(1)}M</span> —
                      spending beyond this yields less impact per dollar.</>
                    )}
                  </>
                ) : 'No data available.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
