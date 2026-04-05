import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area, ComposedChart, ReferenceLine
} from 'recharts'

const API = '/api'

const COLORS = {
  green: '#22c55e', yellow: '#eab308', orange: '#f97316',
  red: '#ef4444', purple: '#a78bfa', cyan: '#06b6d4',
}

const RURAL = ['Scott','Fayette','Jay','Blackford','Vermillion','Wayne','Henry']
const URBAN = ['Marion','Lake','Allen','St Joseph','Vanderburgh','Tippecanoe']

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #334155', borderRadius: 10, fontSize: 11, color: '#fff' },
  itemStyle: { color: '#e2e8f0' },
  labelStyle: { color: '#fff', fontWeight: 700 },
}

function rateColor(rate) {
  if (rate < 20) return COLORS.green
  if (rate < 35) return COLORS.yellow
  if (rate < 50) return COLORS.orange
  return COLORS.red
}

function rateColorGradient(rate, min, max) {
  const t = Math.min(1, Math.max(0, (rate - min) / (max - min || 1)))
  if (t < 0.33) {
    const p = t / 0.33
    return lerpColor(COLORS.green, COLORS.yellow, p)
  } else if (t < 0.66) {
    const p = (t - 0.33) / 0.33
    return lerpColor(COLORS.yellow, COLORS.orange, p)
  } else {
    const p = (t - 0.66) / 0.34
    return lerpColor(COLORS.orange, COLORS.red, p)
  }
}

function lerpColor(a, b, t) {
  const parse = c => [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)]
  const [r1,g1,b1] = parse(a)
  const [r2,g2,b2] = parse(b)
  const r = Math.round(r1 + (r2-r1)*t)
  const g = Math.round(g1 + (g2-g1)*t)
  const bl = Math.round(b1 + (b2-b1)*t)
  return `rgb(${r},${g},${bl})`
}

/* Skeleton block */
function Skeleton({ className = '', h = 'h-64' }) {
  return (
    <div className={`${h} ${className} rounded-xl bg-slate-800/50 animate-pulse`} />
  )
}

/* Section wrapper */
function Section({ title, subtitle, delay = '', children, className = '' }) {
  return (
    <div className={`glass-panel rounded-2xl border border-slate-700/60 p-6 fade-up ${delay} ${className}`}>
      <div className="mb-5">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

export default function CountyDashboard() {
  const [counties, setCounties] = useState(null)
  const [compare, setCompare] = useState(null)
  const [timeseries, setTimeseries] = useState(null)
  const [simResults, setSimResults] = useState(null)
  const [interventionLevel, setInterventionLevel] = useState(50)
  const [highlightCounty, setHighlightCounty] = useState(null)
  const [simulating, setSimulating] = useState(false)

  /* ── Load all data on mount ── */
  useEffect(() => {
    const FALLBACK_COUNTIES = [
      { name: 'Marion', population: 971102 }, { name: 'Lake', population: 498558 },
      { name: 'Allen', population: 388608 }, { name: 'St. Joseph', population: 272212 },
      { name: 'Vanderburgh', population: 179987 }, { name: 'Tippecanoe', population: 187076 },
      { name: 'Delaware', population: 111871 }, { name: 'Vigo', population: 105994 },
      { name: 'Madison', population: 130782 }, { name: 'Grant', population: 66263 },
      { name: 'Lawrence', population: 45070 }, { name: 'Floyd', population: 80454 },
      { name: 'Clark', population: 122738 }, { name: 'Scott', population: 24355 },
      { name: 'Fayette', population: 23360 }, { name: 'Jay', population: 20248 },
      { name: 'Blackford', population: 12091 }, { name: 'Vermillion', population: 15341 },
      { name: 'Wayne', population: 66456 }, { name: 'Henry', population: 48935 },
    ]
    const load = async () => {
      try {
        let countiesRes, timeseriesRes
        try {
          [countiesRes, timeseriesRes] = await Promise.all([
            fetch(`${API}/counties`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
            fetch(`${API}/timeseries`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
          ])
        } catch {
          countiesRes = FALLBACK_COUNTIES
          timeseriesRes = await fetch('/data/county_timeseries.json').then(r => r.json()).catch(() => ({}))
        }
        setCounties(countiesRes)
        setTimeseries(timeseriesRes)

        // Compare all counties
        const names = countiesRes.map(c => c.name)
        try {
          const cmpRes = await fetch(`${API}/compare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ counties: names }),
          }).then(r => { if (!r.ok) throw new Error(); return r.json() })
          setCompare(cmpRes.results || cmpRes)
        } catch {
          // Build compare data from timeseries
          const lastYear = '2021'
          setCompare(names.map(name => {
            const ts = timeseriesRes[name]?.[lastYear]
            const pop = countiesRes.find(c => c.name === name)?.population || 0
            return {
              county: name, population: pop,
              baseline_deaths: Math.round(ts?.deaths || 0),
              deaths_per_100k: ts?.rate || 0,
            }
          }))
        }
      } catch (e) {
        console.error('CountyDashboard load error:', e)
      }
    }
    load()
  }, [])

  /* ── Simulate all counties when slider changes ── */
  const runSimulation = useCallback(async (level) => {
    if (!counties) return
    setSimulating(true)
    try {
      const pct = level / 100
      const results = await Promise.all(
        counties.map(c =>
          fetch(`${API}/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              county: c.name,
              naloxone: pct,
              prescribing: pct,
              treatment: pct,
            }),
          }).then(r => r.json()).then(d => ({ county: c.name, ...d }))
        )
      )
      setSimResults(results)
    } catch (e) {
      console.error('Simulation error:', e)
    }
    setSimulating(false)
  }, [counties])

  useEffect(() => {
    if (counties) runSimulation(interventionLevel)
  }, [counties, interventionLevel, runSimulation])

  /* ── Derived data ── */
  const compareData = useMemo(() => {
    if (!compare) return []
    return [...compare].sort((a, b) => b.deaths_per_100k - a.deaths_per_100k)
  }, [compare])

  const rateRange = useMemo(() => {
    if (!compareData.length) return { min: 0, max: 100 }
    const rates = compareData.map(c => c.deaths_per_100k)
    return { min: Math.min(...rates), max: Math.max(...rates) }
  }, [compareData])

  const statewideTrend = useMemo(() => {
    if (!timeseries) return []
    const yearMap = {}
    Object.values(timeseries).forEach(countyData => {
      Object.entries(countyData).forEach(([year, d]) => {
        const y = parseInt(year)
        if (y >= 2003 && y <= 2021) {
          yearMap[y] = (yearMap[y] || 0) + (d.deaths || 0)
        }
      })
    })
    return Object.entries(yearMap)
      .map(([year, deaths]) => ({ year: parseInt(year), deaths }))
      .sort((a, b) => a.year - b.year)
  }, [timeseries])

  const top5 = useMemo(() => compareData.slice(0, 5), [compareData])
  const bottom5 = useMemo(() => compareData.slice(-5).reverse(), [compareData])

  const ruralUrban = useMemo(() => {
    if (!compare) return null
    let ruralDeaths = 0, ruralPop = 0, urbanDeaths = 0, urbanPop = 0
    compare.forEach(c => {
      const isRural = RURAL.includes(c.county)
      const isUrban = URBAN.includes(c.county)
      if (isRural) { ruralDeaths += c.baseline_deaths; ruralPop += c.population }
      else if (isUrban) { urbanDeaths += c.baseline_deaths; urbanPop += c.population }
    })
    return {
      data: [
        { name: 'Rural', value: ruralDeaths, pop: ruralPop },
        { name: 'Urban', value: urbanDeaths, pop: urbanPop },
      ],
      ruralRate: ruralPop ? ((ruralDeaths / ruralPop) * 100000).toFixed(1) : 0,
      urbanRate: urbanPop ? ((urbanDeaths / urbanPop) * 100000).toFixed(1) : 0,
    }
  }, [compare])

  const interventionData = useMemo(() => {
    if (!simResults) return []
    return simResults
      .map(s => ({
        county: s.county,
        lives_saved: s.lives_saved || 0,
        baseline: s.baseline_deaths || 0,
        cost: s.cost || 0,
      }))
      .sort((a, b) => b.lives_saved - a.lives_saved)
  }, [simResults])

  const loading = !counties || !compare || !timeseries

  /* ── Annotated events for trend line ── */
  const annotations = [
    { year: 2015, label: '2015 Scott County outbreak' },
    { year: 2016, label: '2016 Fentanyl surge' },
    { year: 2020, label: '2020 COVID' },
  ]

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-8 md:px-8 lg:px-12">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-10 fade-up">
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Indiana County <span className="gradient-text">Analytics Dashboard</span>
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          Comprehensive opioid crisis analytics across all 20 monitored Indiana counties
        </p>
        <div className="flex gap-3 mt-4">
          <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded uppercase tracking-wide">
            {counties?.length || '—'} counties
          </span>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded uppercase tracking-wide">
            CDC WONDER data
          </span>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded uppercase tracking-wide">
            Real-time simulation
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">

        {/* ═══════════════ 1. HEATMAP GRID ═══════════════ */}
        <Section title="Deaths per 100K — Heatmap Grid" subtitle="Click any county to highlight it across all charts" delay="fade-up-d1">
          {loading ? <Skeleton /> : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {compareData.map((c, i) => {
                const bg = rateColorGradient(c.deaths_per_100k, rateRange.min, rateRange.max)
                const active = highlightCounty === c.county
                return (
                  <button
                    key={c.county}
                    onClick={() => setHighlightCounty(active ? null : c.county)}
                    className={`
                      relative rounded-xl p-3 text-left transition-all duration-200 hover-lift press-effect
                      ${active ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-105 z-10' : ''}
                    `}
                    style={{
                      background: `linear-gradient(135deg, ${bg}22, ${bg}44)`,
                      border: `1px solid ${bg}66`,
                    }}
                  >
                    <div className="text-[10px] text-slate-300 font-medium truncate">{c.county}</div>
                    <div className="text-xl font-bold font-mono mt-1" style={{ color: bg }}>
                      {c.deaths_per_100k.toFixed(1)}
                    </div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wide">per 100K</div>
                  </button>
                )
              })}
            </div>
          )}
          {/* Legend */}
          {!loading && (
            <div className="flex items-center gap-2 mt-4 justify-center">
              <span className="text-[10px] text-slate-500">Low</span>
              <div className="w-40 h-2 rounded-full" style={{
                background: `linear-gradient(to right, ${COLORS.green}, ${COLORS.yellow}, ${COLORS.orange}, ${COLORS.red})`
              }} />
              <span className="text-[10px] text-slate-500">High</span>
            </div>
          )}
        </Section>

        {/* ═══════════════ 2. SCATTER PLOT ═══════════════ */}
        <Section title="Population vs Death Rate" subtitle="Each dot is a county. Size = total deaths. Color = risk level." delay="fade-up-d2">
          {loading ? <Skeleton /> : (
            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  type="number" dataKey="population" name="Population"
                  scale="log" domain={['auto', 'auto']}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={v => v >= 1000000 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                  label={{ value: 'Population (log scale)', position: 'bottom', fill: '#64748b', fontSize: 10 }}
                />
                <YAxis
                  type="number" dataKey="deaths_per_100k" name="Deaths per 100K"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  label={{ value: 'Deaths per 100K', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(val, name) => {
                    if (name === 'Population') return [val.toLocaleString(), name]
                    if (name === 'Deaths per 100K') return [val.toFixed(1), name]
                    return [val, name]
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.county || ''}
                />
                <Scatter
                  data={compareData.map(c => ({
                    ...c,
                    size: Math.max(40, Math.min(400, c.baseline_deaths * 3)),
                  }))}
                  shape={(props) => {
                    const { cx, cy, payload } = props
                    const color = rateColor(payload.deaths_per_100k)
                    const r = Math.max(5, Math.min(22, Math.sqrt(payload.baseline_deaths) * 2))
                    const isHL = highlightCounty === payload.county
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={isHL ? 0.9 : 0.6}
                          stroke={isHL ? '#fff' : color} strokeWidth={isHL ? 2.5 : 1}
                          style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                          onClick={() => setHighlightCounty(isHL ? null : payload.county)}
                        />
                        {(isHL || r > 12) && (
                          <text x={cx} y={cy - r - 4} textAnchor="middle" fill="#e2e8f0" fontSize={9} fontWeight={600}>
                            {payload.county}
                          </text>
                        )}
                      </g>
                    )
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ═══════════════ 3. STATEWIDE TREND LINE ═══════════════ */}
        <Section title="Statewide Death Trend (2003 — 2021)" subtitle="Total opioid deaths across all 20 monitored counties by year" delay="fade-up-d3">
          {!statewideTrend.length ? <Skeleton /> : (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={statewideTrend} margin={{ top: 30, right: 30, bottom: 20, left: 20 }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.orange} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.orange} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }}
                  label={{ value: 'Total Deaths', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="deaths" stroke="none" fill="url(#trendGrad)" />
                <Line type="monotone" dataKey="deaths" stroke={COLORS.orange} strokeWidth={2.5}
                  dot={{ r: 3, fill: COLORS.orange, strokeWidth: 0 }}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                />
                {annotations.map(a => (
                  <ReferenceLine key={a.year} x={a.year} stroke={COLORS.purple} strokeDasharray="4 4" strokeOpacity={0.6}
                    label={{
                      value: a.label, position: 'top', fill: COLORS.purple,
                      fontSize: 9, fontWeight: 600,
                    }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ═══════════════ 4. TOP 5 vs BOTTOM 5 ═══════════════ */}
        <Section title="Highest vs Lowest Rate Counties" subtitle="Top 5 vs Bottom 5 counties by deaths per 100K" delay="fade-up-d4">
          {loading ? <Skeleton /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top 5 */}
              <div>
                <p className="text-[10px] text-red-400 uppercase tracking-wide font-semibold mb-3">Highest Rate</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={top5} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis type="category" dataKey="county" tick={{ fill: '#e2e8f0', fontSize: 11 }} width={75} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="deaths_per_100k" name="Deaths/100K" radius={[0,6,6,0]}>
                      {top5.map((c, i) => (
                        <Cell key={i} fill={rateColor(c.deaths_per_100k)}
                          fillOpacity={highlightCounty && highlightCounty !== c.county ? 0.3 : 0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Bottom 5 */}
              <div>
                <p className="text-[10px] text-green-400 uppercase tracking-wide font-semibold mb-3">Lowest Rate</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={bottom5} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis type="category" dataKey="county" tick={{ fill: '#e2e8f0', fontSize: 11 }} width={75} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="deaths_per_100k" name="Deaths/100K" radius={[0,6,6,0]}>
                      {bottom5.map((c, i) => (
                        <Cell key={i} fill={COLORS.green}
                          fillOpacity={highlightCounty && highlightCounty !== c.county ? 0.3 : 0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Section>

        {/* ═══════════════ 5. INTERVENTION SIMULATION ═══════════════ */}
        <Section title="Intervention Impact Simulation" subtitle="Apply a uniform intervention level to all counties and see projected lives saved" delay="fade-up-d5">
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wide">Intervention Level</label>
              <span className="text-xl font-bold font-mono text-white">{interventionLevel}%</span>
              {simulating && <span className="text-[10px] text-cyan-400 animate-pulse">Simulating...</span>}
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={interventionLevel}
              onChange={e => setInterventionLevel(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${COLORS.green} 0%, ${COLORS.cyan} ${interventionLevel}%, #334155 ${interventionLevel}%)`,
              }}
            />
            <div className="flex justify-between text-[9px] text-slate-600 mt-1 font-mono">
              <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>
          {!interventionData.length ? <Skeleton /> : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={interventionData} margin={{ top: 10, right: 20, bottom: 60, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="county" tick={{ fill: '#94a3b8', fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }}
                  label={{ value: 'Lives Saved', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                <Tooltip {...TOOLTIP_STYLE}
                  formatter={(val, name) => {
                    if (name === 'Lives Saved') return [val.toFixed(1), name]
                    return [val, name]
                  }}
                />
                <Bar dataKey="lives_saved" name="Lives Saved" radius={[6,6,0,0]}>
                  {interventionData.map((d, i) => (
                    <Cell key={i}
                      fill={highlightCounty === d.county ? '#fff' :
                        d.lives_saved > 20 ? COLORS.cyan : d.lives_saved > 10 ? COLORS.green : COLORS.purple}
                      fillOpacity={highlightCounty && highlightCounty !== d.county ? 0.25 : 0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {interventionData.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Total Lives Saved</p>
                <p className="text-2xl font-bold font-mono text-cyan-400">
                  {interventionData.reduce((s, d) => s + d.lives_saved, 0).toFixed(0)}
                </p>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Most Impact</p>
                <p className="text-lg font-bold text-white">{interventionData[0]?.county}</p>
                <p className="text-sm font-mono text-green-400">{interventionData[0]?.lives_saved.toFixed(1)} saved</p>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Est. Total Cost</p>
                <p className="text-2xl font-bold font-mono text-orange-400">
                  ${(interventionData.reduce((s, d) => s + d.cost, 0) / 1e6).toFixed(1)}M
                </p>
              </div>
            </div>
          )}
        </Section>

        {/* ═══════════════ 6. RURAL vs URBAN ═══════════════ */}
        <Section title="Rural vs Urban Breakdown" subtitle="Death distribution between rural and urban counties" delay="fade-up-d6">
          {!ruralUrban ? <Skeleton /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Donut */}
              <div className="flex justify-center">
                <ResponsiveContainer width={280} height={280}>
                  <PieChart>
                    <Pie
                      data={ruralUrban.data}
                      cx="50%" cy="50%"
                      innerRadius={70} outerRadius={110}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      <Cell fill={COLORS.orange} />
                      <Cell fill={COLORS.cyan} />
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE}
                      formatter={(val, name) => [`${val} deaths`, name]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      formatter={(value) => <span style={{ color: '#e2e8f0', fontSize: 11 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Stats */}
              <div className="space-y-4">
                <div className="bg-slate-800/60 rounded-xl p-4 border border-orange-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS.orange }} />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">Rural Counties</span>
                  </div>
                  <p className="text-sm text-slate-400 mb-1">{RURAL.join(', ')}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-mono text-orange-400">{ruralUrban.ruralRate}</span>
                    <span className="text-[10px] text-slate-500">per 100K</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {ruralUrban.data[0].value} deaths / {ruralUrban.data[0].pop.toLocaleString()} pop
                  </p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-4 border border-cyan-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS.cyan }} />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">Urban Counties</span>
                  </div>
                  <p className="text-sm text-slate-400 mb-1">{URBAN.join(', ')}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-mono text-cyan-400">{ruralUrban.urbanRate}</span>
                    <span className="text-[10px] text-slate-500">per 100K</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {ruralUrban.data[1].value} deaths / {ruralUrban.data[1].pop.toLocaleString()} pop
                  </p>
                </div>
                {Number(ruralUrban.ruralRate) > Number(ruralUrban.urbanRate) && (
                  <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-3">
                    <p className="text-xs text-red-300">
                      Rural rate is <span className="font-bold font-mono">{(ruralUrban.ruralRate / ruralUrban.urbanRate).toFixed(1)}x</span> higher than urban
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* Footer */}
        <div className="text-center py-8 fade-up fade-up-d8">
          <p className="text-[10px] text-slate-600 uppercase tracking-wide">
            Data sourced from CDC WONDER and Indiana State Department of Health
          </p>
        </div>
      </div>
    </div>
  )
}
