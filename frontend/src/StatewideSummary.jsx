import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import AnimatedNumber from './AnimatedNumber'

const API = '/api'

export default function StatewideSummary() {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    fetch(`${API}/summary`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => {
        if (!data?.yearly_death_totals) throw new Error('bad response')
        setSummary(data)
      })
      .catch(() => {})
  }, [])

  if (!summary) return (
    <div className="h-32 flex items-center justify-center text-slate-600 text-sm">
      Loading statewide data… (make sure the API server is running)
    </div>
  )

  const yearlyData = Object.entries(summary.yearly_death_totals || {})
    .filter(([y]) => parseInt(y) >= 2020 && parseInt(y) <= 2024)
    .map(([year, deaths]) => ({ year: parseInt(year), deaths }))

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 rounded-xl p-5 border border-slate-700 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-white">Indiana Opioid Crisis — Real CDC Data</h2>
          <p className="text-xs text-slate-400 mt-0.5">20 highest-impact counties, {summary.total_population?.toLocaleString()} residents</p>
        </div>
        <div className="flex gap-1">
          {summary.data_sources?.map((s, i) => (
            <span key={i} className="text-[9px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">{s.split('(')[0].trim()}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase mb-1">Peak Year Deaths</p>
          <p className="text-2xl font-bold text-red-400 font-mono">
            {yearlyData.length > 0 && <AnimatedNumber value={Math.max(...yearlyData.map(d => d.deaths))} />}
          </p>
          <p className="text-[10px] text-slate-500">in 2022 (target counties)</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase mb-1">Highest Rate</p>
          <p className="text-2xl font-bold text-orange-400 font-mono">
            {summary.top_5_by_rate?.[0]?.rate_per_100k}
          </p>
          <p className="text-[10px] text-slate-500">per 100K ({summary.top_5_by_rate?.[0]?.county})</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase mb-1">Most Deaths</p>
          <p className="text-2xl font-bold text-red-400 font-mono">
            {summary.top_5_by_total_deaths?.[0]?.total_deaths?.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-500">{summary.top_5_by_total_deaths?.[0]?.county} County</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase mb-1">Counties Tracked</p>
          <p className="text-2xl font-bold text-blue-400 font-mono">{summary.total_counties}</p>
          <p className="text-[10px] text-slate-500">across Indiana</p>
        </div>
      </div>

      {yearlyData.length > 0 && (
        <div>
          <h3 className="text-xs text-slate-400 mb-2">Provisional Overdose Deaths by Year (Target Counties)</h3>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={yearlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="year" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="deaths" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
