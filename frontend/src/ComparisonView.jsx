import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function ComparisonView({ result }) {
  if (!result) return null

  const data = [
    { name: 'Baseline', deaths: result.baseline_deaths, fill: '#ef4444' },
    { name: 'With Intervention', deaths: result.total_deaths, fill: '#22c55e' },
  ]

  const reductionPct = result.baseline_deaths > 0
    ? ((result.lives_saved / result.baseline_deaths) * 100).toFixed(1)
    : 0

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300">Baseline vs. Intervention</h2>
        <span className="text-xs font-mono px-2 py-1 rounded bg-green-900/50 text-green-400 border border-green-800">
          {reductionPct}% reduction
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" stroke="#64748b" fontSize={10} />
            <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={120} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="deaths" radius={[0, 4, 4, 0]}>
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="flex flex-col justify-center items-center text-center">
          <p className="text-5xl font-bold text-green-400 font-mono">{result.lives_saved}</p>
          <p className="text-sm text-slate-400 mt-1">lives saved over 5 years</p>
          <div className="mt-3 text-xs text-slate-500 space-y-1">
            <p>Naloxone: {Math.round(result.interventions.naloxone_access * 100)}% | Prescribing: {Math.round(result.interventions.prescribing_reduction * 100)}% | Treatment: {Math.round(result.interventions.treatment_access * 100)}%</p>
            <p className="text-slate-600">Total cost: ${(result.cost / 1_000_000).toFixed(2)}M</p>
          </div>
        </div>
      </div>
    </div>
  )
}
