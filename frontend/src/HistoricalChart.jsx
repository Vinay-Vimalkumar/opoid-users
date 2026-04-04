import React, { useState, useEffect, useMemo } from 'react'
import { ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const API = '/api'

export default function HistoricalChart({ county }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!county) return
    setProfile(null)
    setError(false)
    setLoading(true)
    fetch(`${API}/county/${county}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => {
        if (!data?.yearly_data) throw new Error('no yearly_data')
        setProfile(data)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [county])

  // Merge model rate + provisional deaths into one series
  const chartData = useMemo(() => {
    if (!profile?.yearly_data) return []
    return profile.yearly_data.map(yr => ({
      year: yr.year,
      rate: yr.model_death_rate_per_100k ?? null,
      deaths: yr.provisional_deaths ?? null,
    })).filter(d => d.rate !== null || d.deaths !== null)
  }, [profile])

  if (loading) return (
    <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
      Loading CDC data for {county}…
    </div>
  )

  if (error || !chartData.length) return (
    <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
      No historical data available for {county} County.
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-300">Real CDC Data — {county} County</h2>
          <p className="text-xs text-slate-500 mt-0.5">Drug poisoning mortality rate + provisional overdose deaths</p>
        </div>
        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">CDC NCHS</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Latest Rate', val: `${profile.latest_rate_per_100k ?? '—'}/100K`, color: 'text-orange-400', warn: (profile.latest_rate_per_100k || 0) > 30 },
          { label: 'Peak Rate',   val: `${profile.peak_rate_per_100k ?? '—'}/100K`,  color: 'text-red-400',    warn: true },
          { label: 'Total Deaths (all years)', val: profile.total_provisional_deaths?.toLocaleString() ?? '—', color: 'text-red-400', warn: false },
          { label: 'Classification', val: profile.urban_rural ?? '—', color: 'text-slate-300', warn: false },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 rounded-xl p-3 border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-sm font-bold font-mono ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Combined chart */}
      <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="year" stroke="#64748b" fontSize={10} />
            <YAxis yAxisId="rate"   stroke="#f97316" fontSize={10} orientation="left"  label={{ value: '/100K', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#f97316' } }} />
            <YAxis yAxisId="deaths" stroke="#ef4444" fontSize={10} orientation="right" label={{ value: 'Deaths/yr', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: '#ef4444' } }} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#ffffff' }}
              formatter={(value, name) => [
                name === 'rate'   ? `${value?.toFixed(1)}/100K` : value?.toLocaleString(),
                name === 'rate'   ? 'Death Rate (model)'        : 'Provisional Deaths',
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area yAxisId="rate"   type="monotone" dataKey="rate"   stroke="#f97316" fill="url(#rateGrad)" name="rate"   dot={false} connectNulls />
            <Bar  yAxisId="deaths" dataKey="deaths" fill="#ef4444"  opacity={0.6}    name="deaths" radius={[2,2,0,0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* OD touchpoints if available */}
      {profile.od_touchpoints && typeof profile.od_touchpoints === 'object' && (
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-3">Annual OD System Touchpoints</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(profile.od_touchpoints).map(([k, v]) => (
              <div key={k} className="flex justify-between items-center bg-slate-800 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-400">{k}</span>
                <span className="text-sm font-bold font-mono text-orange-400">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
