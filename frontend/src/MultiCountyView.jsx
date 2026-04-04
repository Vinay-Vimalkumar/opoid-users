import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const API = '/api'

export default function MultiCountyView({ onSelectCounty }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hoveredCounty, setHoveredCounty] = useState(null)
  const [sortBy, setSortBy] = useState('deaths') // 'deaths' | 'rate'

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      setError(null)
      try {
        // Get county list first
        const countiesRes = await fetch(`${API}/counties`)
        const counties = await countiesRes.json()
        const countyNames = counties.map(c => c.name)

        // Use /compare endpoint for efficiency (single batch request)
        const compareRes = await fetch(`${API}/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ counties: countyNames }),
        })
        const compareData = await compareRes.json()
        const results = (compareData.results || compareData).map(r => ({
          ...r,
          deaths_per_100k: r.deaths_per_100k || (r.population > 0
            ? Math.round(r.baseline_deaths / r.population * 100000 * 10) / 10
            : 0),
        }))

        results.sort((a, b) => b.baseline_deaths - a.baseline_deaths)
        setData(results)
      } catch (e) {
        setError('Failed to load county data. Make sure the API is running.')
      }
      setLoading(false)
    }
    fetchAll()
  }, [])

  const sortedData = [...data].sort((a, b) => {
    if (sortBy === 'rate') return b.deaths_per_100k - a.deaths_per_100k
    return b.baseline_deaths - a.baseline_deaths
  })

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">All Counties — Baseline Deaths (5-Year)</h2>
        <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
          Loading all county simulations...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">All Counties</h2>
        <div className="flex items-center justify-center h-64 text-red-400 text-sm">{error}</div>
      </div>
    )
  }

  const chartKey = sortBy === 'rate' ? 'deaths_per_100k' : 'baseline_deaths'
  const chartLabel = sortBy === 'rate' ? 'Deaths per 100K (5yr)' : 'Total Baseline Deaths (5yr)'

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300">{chartLabel} — No Intervention</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sort by:</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              <button
                onClick={() => setSortBy('deaths')}
                className={`px-2 py-1 text-xs transition ${
                  sortBy === 'deaths' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Total Deaths
              </button>
              <button
                onClick={() => setSortBy('rate')}
                className={`px-2 py-1 text-xs transition ${
                  sortBy === 'rate' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Per 100K
              </button>
            </div>
            <span className="text-xs text-slate-500 ml-2">Click a bar to select</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(480, sortedData.length * 28)}>
          <BarChart data={sortedData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" stroke="#64748b" fontSize={10} />
            <YAxis
              type="category"
              dataKey="county"
              stroke="#64748b"
              fontSize={11}
              width={100}
            />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(value) => [
                sortBy === 'rate' ? `${value} per 100K` : `${value} deaths`,
                chartLabel
              ]}
            />
            <Bar
              dataKey={chartKey}
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              onClick={(entry) => {
                if (entry && entry.county) onSelectCounty(entry.county)
              }}
              onMouseEnter={(_, index) => setHoveredCounty(index)}
              onMouseLeave={() => setHoveredCounty(null)}
            >
              {sortedData.map((entry, idx) => (
                <Cell
                  key={entry.county}
                  fill={hoveredCounty === idx ? '#a78bfa' : (sortBy === 'rate' ? '#f97316' : '#ef4444')}
                  opacity={hoveredCounty === idx ? 1 : 0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Counties</p>
          <p className="text-2xl font-bold text-white font-mono">{data.length}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Baseline Deaths</p>
          <p className="text-2xl font-bold text-red-400 font-mono">
            {data.reduce((sum, d) => sum + d.baseline_deaths, 0).toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">across all 20 counties</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Highest Rate</p>
          <p className="text-2xl font-bold text-orange-400 font-mono">
            {Math.max(...data.map(d => d.deaths_per_100k)).toFixed(0)}
          </p>
          <p className="text-xs text-slate-500 mt-1">per 100K ({data.reduce((max, d) => d.deaths_per_100k > max.deaths_per_100k ? d : max, data[0])?.county})</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Pop Covered</p>
          <p className="text-2xl font-bold text-blue-400 font-mono">
            {(data.reduce((sum, d) => sum + d.population, 0) / 1_000_000).toFixed(1)}M
          </p>
        </div>
      </div>
    </div>
  )
}
