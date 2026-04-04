import React, { useState, useEffect, useMemo } from 'react'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const API = '/api'

export default function HistoricalChart({ county }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!county) return
    setLoading(true)
    fetch(`${API}/county/${county}`)
      .then(r => r.json())
      .then(data => {
        setProfile(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [county])

  const rateData = useMemo(() => {
    if (!profile?.yearly_data) return []
    return profile.yearly_data
      .filter(yr => yr.model_death_rate_per_100k)
      .map(yr => ({
        year: yr.year,
        rate: yr.model_death_rate_per_100k,
        deaths: yr.provisional_deaths || null,
      }))
  }, [profile])

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Loading real CDC data...</div>
      </div>
    )
  }

  if (!rateData.length) {
    return null
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-300">
          Real CDC Data — {county} County
        </h2>
        <span className="text-[10px] text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
          Source: CDC NCHS
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Drug poisoning mortality rate (model-based estimate per 100K)</p>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={rateData}>
          <defs>
            <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="year" stroke="#64748b" fontSize={10} />
          <YAxis stroke="#64748b" fontSize={10} label={{ value: 'per 100K', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#64748b' } }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            formatter={(value, name) => [
              name === 'rate' ? `${value}/100K` : value,
              name === 'rate' ? 'Death Rate' : 'Provisional Deaths'
            ]}
          />
          <Area type="monotone" dataKey="rate" stroke="#f97316" fill="url(#rateGrad)" name="rate" />
        </AreaChart>
      </ResponsiveContainer>

      {/* Key stats */}
      {profile && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500 uppercase">Latest Rate</p>
            <p className="text-sm font-bold text-orange-400 font-mono">{profile.latest_rate_per_100k}/100K</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500 uppercase">Peak Rate</p>
            <p className="text-sm font-bold text-red-400 font-mono">{profile.peak_rate_per_100k}/100K</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <p className="text-[10px] text-slate-500 uppercase">Classification</p>
            <p className="text-sm font-medium text-slate-300">{profile.urban_rural || 'N/A'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
