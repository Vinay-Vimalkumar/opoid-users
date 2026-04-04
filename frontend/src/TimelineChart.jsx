import React, { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts'

export default function TimelineChart({ result, compact = false }) {
  const data = useMemo(() => {
    if (!result?.timeline) return []
    return Object.entries(result.timeline).map(([month, snap]) => ({
      month: parseInt(month),
      year: (parseInt(month) / 12).toFixed(1),
      deaths: snap.cumulative_deaths,
      monthlyDeaths: snap.deaths_this_month,
      overdoses: snap.overdoses_this_month,
      oud: snap.oud,
      treatment: snap.treatment,
      recovered: snap.recovered,
    }))
  }, [result])

  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        Run a simulation to see results
      </div>
    )
  }

  if (compact) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="deathGradC" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#64748b" fontSize={9} tickFormatter={m => `${Math.floor(m / 12)}y`} interval={11} />
          <YAxis stroke="#64748b" fontSize={9} width={30} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
            labelFormatter={m => `Month ${m}`}
          />
          <Area type="monotone" dataKey="deaths" stroke="#ef4444" fill="url(#deathGradC)" name="Cumulative Deaths" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cumulative deaths */}
      <div>
        <h3 className="text-xs text-slate-400 mb-2">Cumulative Deaths Over Time</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="deathGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="month"
              stroke="#64748b"
              fontSize={10}
              tickFormatter={m => `${Math.floor(m / 12)}y${m % 12}m`}
              interval={11}
            />
            <YAxis stroke="#64748b" fontSize={10} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              labelFormatter={m => `Month ${m} (Year ${(m / 12).toFixed(1)})`}
            />
            <Area type="monotone" dataKey="deaths" stroke="#ef4444" fill="url(#deathGrad)" name="Cumulative Deaths" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Compartment breakdown */}
      <div>
        <h3 className="text-xs text-slate-400 mb-2">Active Compartments</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="month"
              stroke="#64748b"
              fontSize={10}
              tickFormatter={m => `${Math.floor(m / 12)}y`}
              interval={11}
            />
            <YAxis stroke="#64748b" fontSize={10} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="oud" stroke="#f97316" name="OUD" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="treatment" stroke="#8b5cf6" name="In Treatment" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="recovered" stroke="#22c55e" name="Recovered" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
