import { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, ZoomControl, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import InterventionSliders from './InterventionSliders'
import TimelineChart from './TimelineChart'
import Recommendations from './Recommendations'
import ChatSidebar from './ChatSidebar'
import FrontierChart from './FrontierChart'
import SensitivityHeatmap from './SensitivityHeatmap'
import ScenarioCompare from './ScenarioCompare'
import StatewideSummary from './StatewideSummary'
import FeatureImportance from './FeatureImportance'
import DemoPresets from './DemoPresets'

const API = '/api'

// Approximate lat/lng centers for each Indiana county
const COUNTY_COORDS = {
  'Marion':     [39.77, -86.16],
  'Lake':       [41.48, -87.33],
  'Allen':      [41.08, -85.08],
  'St. Joseph': [41.61, -86.29],
  'Vanderburgh':[37.97, -87.57],
  'Tippecanoe': [40.38, -86.86],
  'Delaware':   [40.20, -85.39],
  'Wayne':      [39.85, -84.99],
  'Vigo':       [39.47, -87.39],
  'Madison':    [40.17, -85.72],
  'Clark':      [38.48, -85.72],
  'Floyd':      [38.32, -85.91],
  'Scott':      [38.69, -85.75],
  'Lawrence':   [38.84, -86.49],
  'Fayette':    [39.65, -85.17],
  'Jay':        [40.44, -84.99],
  'Blackford':  [40.47, -85.32],
  'Vermillion': [39.85, -87.46],
  'Henry':      [39.93, -85.39],
  'Grant':      [40.52, -85.65],
}

// Risk color: green → yellow → orange → red
function riskColor(norm) {
  if (norm > 0.75) return '#ef4444'
  if (norm > 0.5)  return '#f97316'
  if (norm > 0.25) return '#eab308'
  return '#22c55e'
}

function riskLabel(norm) {
  if (norm > 0.75) return 'High'
  if (norm > 0.5)  return 'Elevated'
  if (norm > 0.25) return 'Moderate'
  return 'Low'
}

const PANEL_TABS = [
  { key: 'Simulation',        icon: '📊' },
  { key: 'Cost vs. Impact',   icon: '🔬' },
  { key: 'Compare Strategies', icon: '⚖️' },
  { key: 'Indiana Overview',  icon: '🗺️' },
  { key: 'Recommendations',   icon: '📋' },
  { key: 'Compare Counties',  icon: '🔀' },
]

const PRESETS = [
  { name: 'Naloxone Push',   values: { naloxone: 0.9, prescribing: 0.1, treatment: 0.2 } },
  { name: 'Treatment Focus', values: { naloxone: 0.2, prescribing: 0.2, treatment: 0.9 } },
  { name: 'Balanced',        values: { naloxone: 0.5, prescribing: 0.5, treatment: 0.5 } },
  { name: 'Policy Reform',   values: { naloxone: 0.2, prescribing: 0.9, treatment: 0.3 } },
]

// Tells Leaflet to re-render whenever the container height changes
function MapResizer({ heightPct }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [heightPct, map])
  return null
}

export default function MapPage({ theme = 'default' }) {
  const isBW = theme === 'bw'
  const [counties, setCounties]           = useState([])
  const [selected, setSelected]           = useState('Marion')
  const [compareWith, setCompareWith]     = useState('')
  const [interventions, setInterventions] = useState({ naloxone: 0.3, prescribing: 0.3, treatment: 0.3 })
  const [result, setResult]               = useState(null)
  const [compareResult, setCompareResult] = useState(null)
  const [loading, setLoading]             = useState(false)
  const [panelTab, setPanelTab]           = useState('Simulation')
  const [maxPop, setMaxPop]               = useState(1)
  const [mapHeightPct, setMapHeightPct]   = useState(32)
  const [featureImportance, setFeatureImportance] = useState(null)
  const containerRef                      = useRef(null)
  const dragging                          = useRef(false)

  useEffect(() => {
    fetch(`${API}/counties`)
      .then(r => r.json())
      .then(data => {
        setCounties(data)
        const max = Math.max(...data.map(c => c.population))
        setMaxPop(max)
      })
      .catch(() => {})
    fetch(`${API}/feature_importance`)
      .then(r => r.json())
      .then(setFeatureImportance)
      .catch(() => {})
  }, [])

  const runSim = useCallback(async (county, ivs) => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ county, ...ivs, months: 60, seed: 42 }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [])

  const runCompareSim = useCallback(async (county, ivs) => {
    if (!county) return
    try {
      const res = await fetch(`${API}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ county, ...ivs, months: 60, seed: 42 }),
      })
      setCompareResult(await res.json())
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { runSim(selected, interventions) }, [selected, interventions, runSim])
  useEffect(() => { if (compareWith) runCompareSim(compareWith, interventions) }, [compareWith, interventions, runCompareSim])

  const handleSlider = (lever, val) =>
    setInterventions(prev => ({ ...prev, [lever]: val }))

  const handleChatResult = (simData) => {
    if (!simData) return
    setSelected(simData.county)
    setInterventions(simData.interventions)
  }

  const handlePreset = (county, ivs) => {
    setSelected(county)
    setInterventions(ivs)
  }

  const selectedCountyData = counties.find(c => c.name === selected)
  const compareCountyData  = counties.find(c => c.name === compareWith)

  const onDragStart = useCallback((e) => {
    e.preventDefault()
    dragging.current = true

    const onMove = (moveEvent) => {
      if (!dragging.current || !containerRef.current) return
      const clientY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY
      const { top, height } = containerRef.current.getBoundingClientRect()
      const newPct = ((clientY - top) / height) * 100
      setMapHeightPct(Math.min(70, Math.max(15, newPct)))
    }

    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }, [])

  return (
    <div className="flex h-[calc(100vh-57px)]" style={{ background: isBW ? '#090909' : '#020617' }}>

      {/* ── Main area ── */}
      <div ref={containerRef} className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Map */}
        <div className="relative flex-shrink-0" style={{ height: `${mapHeightPct}%` }}>
          <MapContainer
            center={[39.8, -86.1]}
            zoom={7}
            style={{ width: '100%', height: '100%', background: isBW ? '#0a0a0a' : '#0f172a' }}
            zoomControl={false}
          >
            <MapResizer heightPct={mapHeightPct} />
            <ZoomControl position="bottomright" />
            <TileLayer
              attribution='&copy; <a href="https://carto.com">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {counties.map(county => {
              const pos      = COUNTY_COORDS[county.name]
              if (!pos) return null
              const norm     = county.population / maxPop
              const isActive = county.name === selected
              const isCmp    = county.name === compareWith
              const baseR    = Math.max(10, Math.min(22, Math.sqrt(county.population / 5000)))
              const activeColor = isBW ? '#dddddd' : '#a78bfa'
              const cmpColor    = isBW ? '#aaaaaa' : '#06b6d4'
              const color       = isCmp ? cmpColor : isActive ? activeColor : riskColor(norm)

              return [
                /* Outer dashed ring for selected / compare */
                (isActive || isCmp) && (
                  <CircleMarker
                    key={`${county.name}-ring`}
                    center={pos}
                    radius={baseR + 7}
                    pathOptions={{
                      color:       color,
                      weight:      2,
                      fillColor:   'transparent',
                      fillOpacity: 0,
                      opacity:     0.55,
                      dashArray:   '4 3',
                    }}
                    interactive={false}
                  />
                ),
                /* Main marker */
                <CircleMarker
                  key={county.name}
                  center={pos}
                  radius={isActive ? baseR + 3 : baseR}
                  pathOptions={{
                    color:       isActive || isCmp ? '#fff' : color,
                    weight:      isActive ? 2.5 : isCmp ? 2 : 1,
                    fillColor:   color,
                    fillOpacity: isActive || isCmp ? 0.95 : 0.6,
                    opacity:     1,
                  }}
                  eventHandlers={{ click: () => setSelected(county.name) }}
                >
                  <LeafletTooltip direction="top" offset={[0, -4]}>
                    <div style={{ fontSize: 11 }}>
                      <strong>{county.name} County</strong>
                      <br />Pop: {county.population?.toLocaleString()}
                      <br />Risk: {riskLabel(norm)}
                    </div>
                  </LeafletTooltip>
                </CircleMarker>,
              ]
            })}
          </MapContainer>

          {/* Legend — bottom left */}
          <div className="absolute bottom-3 left-3 z-[1000] bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 flex items-center gap-3 text-[11px] text-slate-400 backdrop-blur">
            <span className="font-semibold text-slate-300">OUD Burden</span>
            {[['#22c55e','Low'],['#eab308','Moderate'],['#f97316','Elevated'],['#ef4444','High']].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
                {l}
              </span>
            ))}
          </div>

          {/* Selected county badge — top right */}
          <div
            className="absolute top-3 right-3 z-[1000] rounded-xl px-3 py-2 backdrop-blur flex items-center gap-2"
            style={{
              background: 'rgba(8,8,8,0.88)',
              border:     `1px solid ${isBW ? 'rgba(80,80,80,0.5)' : 'rgba(167,139,250,0.4)'}`,
            }}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: isBW ? '#888' : '#a78bfa',
                boxShadow:  isBW ? '0 0 6px rgba(180,180,180,0.5)' : '0 0 6px #a78bfa',
              }}
            />
            <div>
              <p className="text-[11px] text-slate-500 leading-none">Selected county</p>
              <p className="text-sm font-bold leading-tight" style={{ color: isBW ? '#cccccc' : '#c4b5fd' }}>{selected}</p>
            </div>
            {loading && <span className="text-[10px] animate-pulse ml-1" style={{ color: isBW ? '#aaa' : '#22d3ee' }}>Simulating…</span>}
          </div>
        </div>

        {/* ── Drag handle ── */}
        <div
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          className="group flex-shrink-0 h-3 flex items-center justify-center cursor-row-resize bg-slate-900 border-y border-slate-800 hover:border-cyan-800 transition-colors z-10"
          title="Drag to resize"
        >
          <div className="w-16 h-1 rounded-full bg-slate-700 group-hover:bg-cyan-600 transition-colors" />
        </div>

        {/* ── Bottom panel ── */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">

          {/* Tab bar */}
          <div className="flex items-stretch border-b border-slate-800 bg-slate-950/80 flex-shrink-0 overflow-x-auto">
            {PANEL_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setPanelTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap flex-shrink-0 ${
                  panelTab === t.key
                    ? 'border-cyan-500 text-white bg-slate-900/60'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900/30'
                }`}
              >
                <span>{t.icon}</span>
                {t.key}
              </button>
            ))}

            {/* Stat pills on the right */}
            {result && (
              <div className="flex items-center gap-2 px-4 ml-auto flex-shrink-0">
                <span className="text-xs bg-green-950/60 border border-green-900/50 text-green-400 font-bold font-mono px-2 py-1 rounded-lg whitespace-nowrap">
                  +{result.lives_saved} saved
                </span>
                <span className="text-xs bg-slate-800 text-cyan-400 font-mono px-2 py-1 rounded-lg whitespace-nowrap">
                  {result.cost >= 1e6 ? `$${(result.cost/1e6).toFixed(1)}M` : `$${(result.cost/1e3).toFixed(0)}K`}
                </span>
              </div>
            )}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-0 h-full">

              {/* Left: Sliders (always visible) */}
              <div className="lg:col-span-1 p-4 border-r border-slate-800 space-y-4 overflow-y-auto">
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Interventions</span>
                    <div className="flex flex-wrap gap-1">
                      {PRESETS.map(p => (
                        <button
                          key={p.name}
                          onClick={() => setInterventions(p.values)}
                          className="px-2 py-0.5 text-[10px] rounded border border-slate-700 text-slate-500 hover:text-cyan-400 hover:border-cyan-800 transition"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <InterventionSliders values={interventions} onChange={handleSlider} />
                </div>

                {/* Demo Presets */}
                <DemoPresets onApply={handlePreset} />

                {/* Feature Importance */}
                {featureImportance && <FeatureImportance importance={featureImportance} />}
              </div>

              {/* Right: Tab content */}
              <div className="lg:col-span-3 p-4 overflow-y-auto">

                {panelTab === 'Simulation' && (
                  <div className="space-y-4">
                    {/* How It Works */}
                    <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800">
                      <h3 className="text-sm font-bold text-white mb-2">How This Simulation Works</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        This tool models the opioid epidemic across 20 Indiana counties using{' '}
                        <span className="text-slate-300 font-medium">real CDC overdose death data</span>.
                        Adjust three policy levers on the left to simulate different intervention strategies
                        and see how many lives could be saved over a 5-year period. The model tracks how
                        people move through stages — from prescription use to misuse, opioid use disorder,
                        overdose, treatment, and recovery — and estimates the impact of each policy change.
                      </p>
                    </div>

                    {result ? (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { label: 'Lives Saved',       val: result.lives_saved,     color: 'text-green-400',
                              sub: result.cost_per_life_saved ? `$${(result.cost_per_life_saved/1000).toFixed(0)}K per life` : null },
                            { label: 'Baseline Deaths',   val: result.baseline_deaths, color: 'text-red-400',
                              sub: result.baseline_deaths_per_100k ? `${result.baseline_deaths_per_100k}/100K rate` : null },
                            { label: 'With Intervention', val: result.total_deaths,    color: 'text-amber-400',
                              sub: result.deaths_per_100k ? `${result.deaths_per_100k}/100K rate` : null },
                            { label: 'Reduction',
                              val: `${result.baseline_deaths > 0 ? ((result.lives_saved/result.baseline_deaths)*100).toFixed(1) : 0}%`,
                              color: 'text-cyan-400',
                              sub: result.overdoses_prevented ? `${result.overdoses_prevented} ODs prevented` : null },
                          ].map(s => (
                            <div key={s.label} className="bg-slate-900 rounded-xl p-3 border border-slate-800">
                              <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">{s.label}</p>
                              <p className={`text-2xl font-black font-mono ${s.color}`}>{s.val}</p>
                              {s.sub && <p className="text-[10px] text-slate-500 mt-1">{s.sub}</p>}
                            </div>
                          ))}
                        </div>
                        <TimelineChart result={result} />
                      </>
                    ) : (
                      <div className="text-slate-600 text-sm text-center py-12">Loading simulation…</div>
                    )}
                  </div>
                )}

                {panelTab === 'Cost vs. Impact' && (
                  <div className="space-y-6">
                    <FrontierChart county={selected} />
                    <SensitivityHeatmap county={selected} />
                  </div>
                )}

                {panelTab === 'Compare Strategies' && (
                  <ScenarioCompare county={selected} />
                )}

                {panelTab === 'Indiana Overview' && (
                  <StatewideSummary />
                )}

                {panelTab === 'Recommendations' && (
                  <Recommendations interventions={interventions} county={selected} />
                )}

                {panelTab === 'Compare Counties' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1">County A (selected)</p>
                        <div className="bg-slate-800 border border-purple-800/50 text-purple-300 rounded-lg px-3 py-2 text-sm font-semibold">
                          {selected}
                        </div>
                      </div>
                      <div className="text-slate-600 text-lg font-bold mt-4">vs</div>
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1">County B</p>
                        <select
                          value={compareWith}
                          onChange={e => setCompareWith(e.target.value)}
                          className="bg-slate-800 border border-cyan-800/50 text-cyan-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none cursor-pointer"
                        >
                          <option value="">— Select county —</option>
                          {counties.filter(c => c.name !== selected).map(c => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {result && compareResult && compareWith ? (
                      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-800">
                              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Metric</th>
                              <th className="text-right px-4 py-3 text-xs text-purple-400 font-semibold">{selected}</th>
                              <th className="text-right px-4 py-3 text-xs text-cyan-400 font-semibold">{compareWith}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { label: 'Baseline Deaths',    a: result.baseline_deaths,  b: compareResult.baseline_deaths },
                              { label: 'Deaths w/ Interv.',  a: result.total_deaths,     b: compareResult.total_deaths    },
                              { label: 'Lives Saved',        a: result.lives_saved,      b: compareResult.lives_saved,    highlight: true },
                              { label: 'Mortality Reduction',
                                a: result.baseline_deaths > 0 ? `${((result.lives_saved/result.baseline_deaths)*100).toFixed(1)}%` : '—',
                                b: compareResult.baseline_deaths > 0 ? `${((compareResult.lives_saved/compareResult.baseline_deaths)*100).toFixed(1)}%` : '—' },
                              { label: 'Total Cost',
                                a: result.cost >= 1e6 ? `$${(result.cost/1e6).toFixed(1)}M` : `$${(result.cost/1e3).toFixed(0)}K`,
                                b: compareResult.cost >= 1e6 ? `$${(compareResult.cost/1e6).toFixed(1)}M` : `$${(compareResult.cost/1e3).toFixed(0)}K` },
                              { label: 'Cost per Life Saved',
                                a: result.lives_saved > 0 ? `$${(result.cost/result.lives_saved/1000).toFixed(0)}K` : '—',
                                b: compareResult.lives_saved > 0 ? `$${(compareResult.cost/compareResult.lives_saved/1000).toFixed(0)}K` : '—' },
                            ].map((row, i) => (
                              <tr key={i} className={`border-b border-slate-800/50 ${row.highlight ? 'bg-green-950/20' : ''}`}>
                                <td className="px-4 py-3 text-slate-400 text-xs">{row.label}</td>
                                <td className={`px-4 py-3 text-right font-mono font-bold text-sm ${row.highlight ? 'text-green-400' : 'text-purple-300'}`}>{row.a}</td>
                                <td className={`px-4 py-3 text-right font-mono font-bold text-sm ${row.highlight ? 'text-green-400' : 'text-cyan-300'}`}>{row.b}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : compareWith ? (
                      <div className="text-slate-600 text-sm text-center py-8">Loading comparison…</div>
                    ) : (
                      <div className="text-slate-600 text-sm text-center py-8">Select a county above to compare.</div>
                    )}

                    {selectedCountyData && compareCountyData && compareWith && (
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { county: selectedCountyData, color: '#a78bfa' },
                          { county: compareCountyData,  color: '#06b6d4' },
                        ].map(({ county, color }) => (
                          <div key={county.name} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                            <p className="text-sm font-bold mb-1" style={{ color }}>{county.name} County</p>
                            <p className="text-xs text-slate-500">Population</p>
                            <p className="text-xl font-black text-white font-mono">{county.population?.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chat Sidebar ── */}
      <div className="w-72 xl:w-80 flex-shrink-0 hidden md:flex flex-col border-l border-slate-800">
        <ChatSidebar county={selected} onResult={handleChatResult} />
      </div>
    </div>
  )
}
