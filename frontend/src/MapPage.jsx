import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup as LeafletPopup, ZoomControl, useMap, Polyline, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import InterventionSliders from './InterventionSliders'
import TimelineChart from './TimelineChart'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'

const API = '/api'

const COUNTY_COORDS = {
  'Marion':     [39.77, -86.16], 'Lake':       [41.48, -87.33],
  'Allen':      [41.08, -85.08], 'St. Joseph': [41.61, -86.29],
  'Vanderburgh':[37.97, -87.57], 'Tippecanoe': [40.38, -86.86],
  'Delaware':   [40.20, -85.39], 'Wayne':      [39.85, -84.99],
  'Vigo':       [39.47, -87.39], 'Madison':    [40.17, -85.72],
  'Clark':      [38.48, -85.72], 'Floyd':      [38.32, -85.91],
  'Scott':      [38.69, -85.75], 'Lawrence':   [38.84, -86.49],
  'Fayette':    [39.65, -85.17], 'Jay':        [40.44, -84.99],
  'Blackford':  [40.47, -85.32], 'Vermillion': [39.85, -87.46],
  'Henry':      [39.93, -85.39], 'Grant':      [40.52, -85.65],
}

// ── Tile layer options ──
const TILE_LAYERS = {
  dark: {
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    attribution: '&copy; Stadia Maps',
    label: 'Dark',
    preview: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f172a)',
  },
  midnight: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
    label: 'Minimal',
    preview: 'linear-gradient(135deg, #0a0a1a, #111127, #0d0d1e)',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    label: 'Satellite',
    preview: 'linear-gradient(135deg, #1a3a1a, #2d4a2d, #1a3a1a)',
  },
  light: {
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
    attribution: '&copy; Stadia Maps',
    label: 'Light',
    preview: 'linear-gradient(135deg, #e8e8e8, #d0d0d0, #f0f0f0)',
  },
}

// ── Color scheme palettes ──
const COLOR_SCHEMES = {
  heat:    { label: 'Heat',   colors: ['#22c55e','#eab308','#f97316','#ef4444'] },
  plasma:  { label: 'Plasma', colors: ['#7c3aed','#db2777','#f97316','#facc15'] },
  viridis: { label: 'Viridis',colors: ['#440154','#21918c','#5ec962','#fde725'] },
  blues:   { label: 'Blues',  colors: ['#93c5fd','#3b82f6','#1d4ed8','#1e3a5f'] },
  neon:    { label: 'Neon',   colors: ['#06b6d4','#22c55e','#facc15','#ec4899'] },
}

function riskColor(norm, scheme = 'heat') {
  const pal = COLOR_SCHEMES[scheme]?.colors || COLOR_SCHEMES.heat.colors
  if (norm > 0.75) return pal[3]
  if (norm > 0.5)  return pal[2]
  if (norm > 0.25) return pal[1]
  return pal[0]
}
function riskLabel(norm) {
  if (norm > 0.75) return 'Critical'
  if (norm > 0.5)  return 'High'
  if (norm > 0.25) return 'Moderate'
  return 'Low'
}
function fmt(n) {
  if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`
  return `$${n}`
}

function MapResizer() {
  const map = useMap()
  useEffect(() => { setTimeout(() => map.invalidateSize(), 100) }, [map])
  return null
}

// Fly to county when selected
function FlyToCounty({ county }) {
  const map = useMap()
  useEffect(() => {
    const coord = COUNTY_COORDS[county]
    if (coord) map.flyTo(coord, 9, { duration: 0.8 })
  }, [county, map])
  return null
}

// Click ripple effect component
function ClickRipple({ position, onDone }) {
  const map = useMap()
  const [ripples, setRipples] = useState([])

  useEffect(() => {
    if (!position) return
    const id = Date.now()
    setRipples(prev => [...prev, { id, pos: position }])
    const timer = setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id))
      if (onDone) onDone()
    }, 800)
    return () => clearTimeout(timer)
  }, [position])

  return ripples.map(r => (
    <Circle
      key={r.id}
      center={r.pos}
      radius={0}
      pathOptions={{ color: '#a78bfa', weight: 2, fillColor: '#a78bfa', fillOpacity: 0.3, className: 'map-ripple' }}
    />
  ))
}

// Animated polyline wrapper
function AnimatedPolyline({ positions, color, isBW }) {
  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: isBW ? '#444' : color,
        weight: 1.5,
        opacity: 0.5,
        dashArray: '12 12',
        className: 'animated-network-line',
      }}
    />
  )
}

export default function MapPage({ theme = 'default' }) {
  const isBW = theme === 'bw'
  const [counties, setCounties] = useState([])
  const [selected, setSelected] = useState('Marion')
  const [interventions, setInterventions] = useState({ naloxone: 0.3, prescribing: 0.3, treatment: 0.3 })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [maxPop, setMaxPop] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showTimeline, setShowTimeline] = useState(false)
  const [showNetwork, setShowNetwork] = useState(true)
  const [hoveredCounty, setHoveredCounty] = useState(null)
  const [hoverData, setHoverData] = useState({}) // county -> sim result cache
  const [tileLayer, setTileLayer] = useState('dark')
  const [colorScheme, setColorScheme] = useState('heat')
  const [ripplePos, setRipplePos] = useState(null)
  const [viewMode, setViewMode] = useState('numbers') // 'numbers' | 'graphs'
  const [panelSize, setPanelSize] = useState('md') // 'sm' | 'md' | 'lg'

  // Time machine state
  const [timeMachine, setTimeMachine] = useState(false)
  const [currentYear, setCurrentYear] = useState(2021)
  const [playing, setPlaying] = useState(false)
  const [timeseriesData, setTimeseriesData] = useState(null) // county -> year -> {rate, pop, deaths}
  const playRef = useRef(null)

  const containerRef = useRef(null)
  const debounceRef = useRef(null)
  const pulseKeyRef = useRef(0)

  // Load counties + timeseries
  useEffect(() => {
    fetch(`${API}/counties`).then(r => r.json()).then(data => {
      setCounties(data)
      setMaxPop(Math.max(...data.map(c => c.population)))
    }).catch(() => {})
    fetch(`${API}/timeseries`).then(r => r.json()).then(setTimeseriesData).catch(() => {})
  }, [])

  // Time machine auto-play
  useEffect(() => {
    if (!playing) { clearInterval(playRef.current); return }
    playRef.current = setInterval(() => {
      setCurrentYear(y => {
        if (y >= 2021) { setPlaying(false); return 2021 }
        return y + 1
      })
    }, 800)
    return () => clearInterval(playRef.current)
  }, [playing])

  // Run simulation (debounced)
  const runSim = useCallback(async (county, ivs) => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/simulate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ county, ...ivs, months: 60, seed: 42 }),
      })
      const data = await res.json()
      setResult(data)
      setHoverData(prev => ({ ...prev, [county]: data }))
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSim(selected, interventions), 200)
    return () => clearTimeout(debounceRef.current)
  }, [selected, interventions, runSim])

  // Prefetch hover data for a county
  const prefetchCounty = useCallback(async (name) => {
    if (hoverData[name]) return
    try {
      const res = await fetch(`${API}/simulate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ county: name, ...interventions, months: 60, seed: 42 }),
      })
      const data = await res.json()
      setHoverData(prev => ({ ...prev, [name]: data }))
    } catch {}
  }, [interventions, hoverData])

  const handleSlider = (lever, val) => setInterventions(prev => ({ ...prev, [lever]: val }))

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Network lines
  const selectedCoord = COUNTY_COORDS[selected]
  const networkLines = showNetwork && selectedCoord ? counties
    .filter(c => c.name !== selected && COUNTY_COORDS[c.name])
    .map(c => ({ name: c.name, coord: COUNTY_COORDS[c.name], dist: Math.hypot(selectedCoord[0]-COUNTY_COORDS[c.name][0], selectedCoord[1]-COUNTY_COORDS[c.name][1]) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4) : []

  const reductionPct = result?.baseline_deaths > 0
    ? Math.round((result.lives_saved / result.baseline_deaths) * 100) : 0

  const hovered = hoveredCounty ? hoverData[hoveredCounty] : null
  const hoveredPop = hoveredCounty ? counties.find(c => c.name === hoveredCounty)?.population : null

  return (
    <div
      ref={containerRef}
      className={`relative ${isFullscreen ? 'h-screen' : 'h-[calc(100vh-57px)]'}`}
      style={{ background: isBW ? '#090909' : '#020617' }}
    >
      {/* ═══ FULL-SCREEN MAP ═══ */}
      <MapContainer
        center={[39.8, -86.1]}
        zoom={7}
        style={{ width: '100%', height: '100%', background: isBW ? '#0a0a0a' : '#0f172a' }}
        zoomControl={false}
      >
        <MapResizer />
        <FlyToCounty county={selected} />
        <ZoomControl position="bottomright" />
        <TileLayer
          key={tileLayer}
          attribution={TILE_LAYERS[tileLayer].attribution}
          url={TILE_LAYERS[tileLayer].url}
        />

        {/* Click ripple effect */}
        <ClickRipple position={ripplePos} onDone={() => setRipplePos(null)} />

        {/* Network lines with animation */}
        {networkLines.map(n => (
          <AnimatedPolyline
            key={`net-${n.name}`}
            positions={[selectedCoord, n.coord]}
            color={riskColor(0.6, colorScheme)}
            isBW={isBW}
          />
        ))}

        {/* County markers — custom HTML markers for clean look */}
        {counties.map(county => {
          const pos = COUNTY_COORDS[county.name]
          if (!pos) return null

          // Time machine: size and color based on death RATE for the selected year
          const tsCounty = timeseriesData?.[county.name]
          const tsYear = tsCounty?.[String(currentYear)]
          const useTimeMachine = timeMachine && tsYear

          let norm, size, color
          if (useTimeMachine) {
            // Normalize by death rate (max ~85 per 100K for worst county/year)
            norm = Math.min(1, tsYear.rate / 85)
            size = Math.max(12, Math.min(40, 10 + norm * 30)) // size grows with death rate
            color = riskColor(norm, colorScheme)
          } else {
            norm = county.population / maxPop
            size = Math.max(14, Math.min(36, Math.sqrt(county.population / 4000)))
            color = riskColor(norm, colorScheme)
          }

          const isActive = county.name === selected
          const isHovered = county.name === hoveredCounty
          if (isActive) color = isBW ? '#ddd' : '#a78bfa'
          const cachedData = useTimeMachine ? null : hoverData[county.name]

          const icon = L.divIcon({
            className: '',
            iconSize: [size * (isActive ? 1.4 : 1), size * (isActive ? 1.4 : 1)],
            iconAnchor: [size * (isActive ? 0.7 : 0.5), size * (isActive ? 0.7 : 0.5)],
            html: `
              <div class="county-marker ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}" style="
                --marker-color: ${color};
                --marker-size: ${size * (isActive ? 1.4 : 1)}px;
              ">
                <div class="county-marker-core"></div>
                <div class="county-marker-ring"></div>
                ${isActive ? '<div class="county-marker-pulse"></div><div class="county-marker-pulse delay"></div>' : ''}
                ${cachedData && isActive ? `<div class="county-marker-label">${county.name}</div>` : ''}
              </div>
            `,
          })

          return (
            <Marker
              key={county.name}
              position={pos}
              icon={icon}
              eventHandlers={{
                click: () => { setSelected(county.name); setRipplePos(pos); pulseKeyRef.current++ },
                mouseover: () => { setHoveredCounty(county.name); prefetchCounty(county.name) },
                mouseout: () => setHoveredCounty(null),
              }}
            >
              <LeafletPopup offset={[0, -size/2 - 8]} autoPan={false}>
                <div style={{ minWidth: 200, fontSize: 11, lineHeight: 1.7, fontFamily: "'Space Grotesk', sans-serif" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 8px ${color}` }} />
                    {county.name} County
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#94a3b8' }}>Population</span>
                    <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{county.population?.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid rgba(148,163,184,0.15)', paddingBottom: 6, marginBottom: 6 }}>
                    <span style={{ color: '#94a3b8' }}>Risk Level</span>
                    <span style={{ fontWeight: 700, color }}>{riskLabel(norm)}</span>
                  </div>
                  {useTimeMachine && tsYear && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                        <span style={{ color: '#94a3b8' }}>Year</span>
                        <span style={{ fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>{currentYear}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                        <span style={{ color: '#94a3b8' }}>Death Rate</span>
                        <span style={{ fontWeight: 700, color: riskColor(norm, colorScheme), fontFamily: "'JetBrains Mono', monospace" }}>{tsYear.rate}/100K</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                        <span style={{ color: '#94a3b8' }}>Est. Deaths</span>
                        <span style={{ fontWeight: 700, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(tsYear.deaths)}</span>
                      </div>
                    </>
                  )}
                  {!useTimeMachine && cachedData ? (
                    <>
                      {[
                        ['Baseline Deaths', cachedData.baseline_deaths?.toLocaleString(), '#ef4444'],
                        ['With Intervention', cachedData.total_deaths?.toLocaleString(), '#f59e0b'],
                        ['Lives Saved', `+${cachedData.lives_saved?.toLocaleString()}`, '#22c55e'],
                        ['Total Cost', fmt(cachedData.cost), '#94a3b8'],
                      ].map(([label, val, c]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                          <span style={{ color: '#94a3b8' }}>{label}</span>
                          <span style={{ fontWeight: 700, color: c, fontFamily: "'JetBrains Mono', monospace" }}>{val}</span>
                        </div>
                      ))}
                      {cachedData.lives_saved > 0 && cachedData.baseline_deaths > 0 && (
                        <div style={{ marginTop: 6, background: 'rgba(34,197,94,0.1)', borderRadius: 6, padding: '4px 8px', textAlign: 'center' }}>
                          <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                            {Math.round(cachedData.lives_saved / cachedData.baseline_deaths * 100)}% fewer deaths
                          </span>
                        </div>
                      )}
                    </>
                  ) : !useTimeMachine ? (
                    <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: '4px 0' }}>
                      Loading simulation...
                    </div>
                  ) : null}
                </div>
              </LeafletPopup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* ═══ FLOATING OVERLAYS ═══ */}

      {/* Tile layer picker — bottom-right above zoom */}
      <div className="tile-picker">
        {Object.entries(TILE_LAYERS).map(([key, layer]) => (
          <button
            key={key}
            className={`tile-picker-btn ${tileLayer === key ? 'active' : ''}`}
            data-label={layer.label}
            style={{ background: layer.preview }}
            onClick={() => setTileLayer(key)}
            title={layer.label}
          />
        ))}
      </div>

      {/* Color scheme picker — bottom-left above legend */}
      <div className="color-scheme-picker" style={{ bottom: showTimeline && result ? 280 : 90, transition: 'bottom 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        {Object.entries(COLOR_SCHEMES).map(([key, scheme]) => (
          <button
            key={key}
            className={`color-scheme-btn ${colorScheme === key ? 'active' : ''}`}
            onClick={() => setColorScheme(key)}
          >
            <span className="color-swatch">
              {scheme.colors.map((c, i) => <span key={i} style={{ background: c }} />)}
            </span>
            {scheme.label}
          </button>
        ))}
      </div>

      {/* Top-left: Selected county info — Numbers or Graphs */}
      <div className="absolute top-3 left-3 z-[1000] fade-up" style={{ transition: 'width 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        <div className="glass-panel px-5 py-4" style={{
          width: panelSize === 'sm' ? 220 : panelSize === 'lg' ? 440 : (viewMode === 'graphs' ? 340 : 260),
          transition: 'width 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-8 rounded-full" style={{ background: isBW ? '#888' : 'linear-gradient(180deg,#f97316,#a855f7)' }} />
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold">Selected county</p>
                <h2 className={`font-black text-white leading-tight ${panelSize === 'lg' ? 'text-2xl' : 'text-xl'}`}>{selected}</h2>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {loading && <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />}
              <div className="flex rounded-lg overflow-hidden border border-slate-800 bg-black/20">
                {['sm','md','lg'].map(sz => (
                  <button key={sz} onClick={() => setPanelSize(sz)}
                    className={`px-1.5 py-1 text-[9px] font-bold uppercase transition ${panelSize === sz ? 'bg-white/10 text-white' : 'text-slate-700 hover:text-slate-400'}`}>
                    {sz === 'sm' ? 'S' : sz === 'md' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
              <div className="flex rounded-lg overflow-hidden border border-slate-800 bg-black/20">
                <button onClick={() => setViewMode('numbers')}
                  className={`px-2 py-1 text-[10px] font-semibold transition ${viewMode === 'numbers' ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-slate-300'}`}>
                  123
                </button>
                <button onClick={() => setViewMode('graphs')}
                  className={`px-2 py-1 text-[10px] font-semibold transition ${viewMode === 'graphs' ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-slate-300'}`}>
                  <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m2 0v-4a2 2 0 012-2h1a2 2 0 012 2v4" /></svg>
                </button>
              </div>
            </div>
          </div>

          {result && viewMode === 'numbers' && (
            <div className={`grid grid-cols-2 gap-2`}>
              {[
                { label: 'Lives Saved', val: `+${result.lives_saved}`, color: '#22c55e', glow: true },
                { label: 'Reduction', val: `${reductionPct}%`, color: '#a78bfa', glow: false },
                { label: 'Deaths', val: result.total_deaths?.toLocaleString(), color: '#ffffff', glow: false },
                { label: 'Cost', val: fmt(result.cost), color: '#06b6d4', glow: false },
                ...(panelSize === 'lg' ? [
                  { label: 'Baseline', val: result.baseline_deaths?.toLocaleString(), color: '#ef4444', glow: false },
                  { label: 'Overdoses', val: result.total_overdoses?.toLocaleString(), color: '#f97316', glow: false },
                  { label: 'Treated', val: result.total_treated?.toLocaleString(), color: '#3b82f6', glow: false },
                  { label: 'Cost/Life', val: result.lives_saved > 0 ? fmt(Math.round(result.cost / result.lives_saved)) : '—', color: '#94a3b8', glow: false },
                ] : []),
              ].map(s => (
                <div key={s.label} className={`rounded-lg ${panelSize === 'lg' ? 'p-3' : 'p-2'}`} style={{
                  background: s.glow ? `rgba(34,197,94,0.08)` : 'rgba(0,0,0,0.25)',
                  borderTop: `2px solid ${s.color}44`,
                  boxShadow: s.glow ? `0 0 16px rgba(34,197,94,0.15), inset 0 1px 0 rgba(34,197,94,0.1)` : 'none',
                }}>
                  <p className={`text-slate-500 uppercase tracking-wide ${panelSize === 'lg' ? 'text-[10px] mb-0.5' : 'text-[9px]'}`}>{s.label}</p>
                  <p className={`font-black font-mono number-enter ${panelSize === 'lg' ? 'text-lg' : 'text-sm'}`} style={{ color: s.color }}>{s.val}</p>
                </div>
              ))}
            </div>
          )}

          {result && viewMode === 'graphs' && (() => {
            const barData = [
              { name: 'Baseline', deaths: result.baseline_deaths, fill: '#ef4444' },
              { name: 'After', deaths: result.total_deaths, fill: '#f59e0b' },
              { name: 'Saved', deaths: result.lives_saved, fill: '#22c55e' },
            ]
            const pieData = [
              { name: 'Prevented', value: result.lives_saved, color: '#22c55e' },
              { name: 'Remaining', value: result.total_deaths, color: '#ef4444' },
            ]
            const interventionData = [
              { name: 'Nal', value: Math.round(interventions.naloxone * 100), fill: '#f97316' },
              { name: 'Pres', value: Math.round(interventions.prescribing * 100), fill: '#a78bfa' },
              { name: 'Treat', value: Math.round(interventions.treatment * 100), fill: '#06b6d4' },
            ]
            // Monthly deaths from timeline
            const timelineData = result.timeline ? Object.entries(result.timeline).map(([m, snap]) => ({
              month: parseInt(m),
              deaths: snap.cumulative_deaths,
            })) : []

            return (
              <div className="space-y-3">
                {/* Deaths comparison bar */}
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-1">Deaths Comparison</p>
                  <ResponsiveContainer width="100%" height={panelSize === 'lg' ? 110 : panelSize === 'sm' ? 55 : 70}>
                    <BarChart data={barData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                      <Bar dataKey="deaths" radius={[4,4,0,0]}>
                        {barData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
                      </Bar>
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#ffffff' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#fff' }} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#fff' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Outcome pie + intervention bars side by side */}
                <div className="flex gap-3">
                  {/* Outcome donut */}
                  <div className="flex-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-1">Outcome</p>
                    <ResponsiveContainer width="100%" height={panelSize === 'lg' ? 120 : panelSize === 'sm' ? 60 : 80}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={20} outerRadius={32} paddingAngle={3} strokeWidth={0}>
                          {pieData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.85} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10, color: '#fff' }} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#fff' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-3 text-[8px] text-white">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Saved</span>
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Deaths</span>
                    </div>
                  </div>

                  {/* Intervention levels */}
                  <div className="flex-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-1">Interventions</p>
                    <ResponsiveContainer width="100%" height={panelSize === 'lg' ? 120 : panelSize === 'sm' ? 60 : 80}>
                      <BarChart data={interventionData} layout="vertical" margin={{ left: 0, right: 0 }}>
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#ffffff' }} axisLine={false} tickLine={false} width={30} />
                        <Bar dataKey="value" radius={[0,4,4,0]} barSize={10}>
                          {interventionData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
                        </Bar>
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10, color: '#fff' }} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#fff' }} formatter={v => `${v}%`} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Mini cumulative deaths curve */}
                {timelineData.length > 0 && (
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-1">Cumulative Deaths (5yr)</p>
                    <ResponsiveContainer width="100%" height={panelSize === 'lg' ? 80 : panelSize === 'sm' ? 35 : 50}>
                      <AreaChart data={timelineData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="deathGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="deaths" stroke="#ef4444" strokeWidth={1.5} fill="url(#deathGrad)" />
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10, color: '#fff' }} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#fff' }} labelFormatter={m => `Month ${m}`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Top-right: Controls toggle + fullscreen */}
      <div className="absolute top-3 right-3 z-[1000] flex gap-2 fade-up">
        {[
          {
            label: 'Timeline', active: showTimeline, onClick: () => setShowTimeline(v => !v),
            activeColor: 'rgba(147,51,234,0.7)', activeBorder: 'rgba(167,139,250,0.4)',
            icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>,
          },
          {
            label: 'Controls', active: showControls, onClick: () => setShowControls(v => !v),
            activeColor: 'rgba(234,88,12,0.7)', activeBorder: 'rgba(249,115,22,0.4)',
            icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
          },
          {
            label: 'Network', active: showNetwork, onClick: () => setShowNetwork(v => !v),
            activeColor: 'rgba(8,145,178,0.7)', activeBorder: 'rgba(6,182,212,0.4)',
            icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
          },
          {
            label: 'Time Machine', active: timeMachine, onClick: () => { setTimeMachine(v => !v); if (!timeMachine) setCurrentYear(2003) },
            activeColor: 'rgba(220,38,38,0.7)', activeBorder: 'rgba(248,113,113,0.4)',
            icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
          },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.onClick}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl transition-all press-effect"
            style={{
              background: btn.active ? btn.activeColor : 'rgba(15,23,42,0.75)',
              border: `1px solid ${btn.active ? btn.activeBorder : 'rgba(255,255,255,0.08)'}`,
              color: btn.active ? '#fff' : 'rgba(148,163,184,1)',
              boxShadow: btn.active ? `0 0 12px ${btn.activeColor}` : 'none',
            }}
          >
            {btn.icon}{btn.label}
          </button>
        ))}
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl text-slate-300 hover:text-white transition-all press-effect"
          style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {isFullscreen
            ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          }
          {isFullscreen ? 'Exit' : 'Full'}
        </button>
      </div>

      {/* Bottom-left: Legend */}
      <div className="absolute left-3 z-[1000] glass-panel px-3 py-2 flex items-center gap-3 text-[10px] text-slate-400 transition-all duration-300" style={{ borderRadius: 12, bottom: showTimeline && result ? 240 : 16, transition: 'bottom 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        <span className="font-bold text-slate-300 text-[11px]">Risk</span>
        {COLOR_SCHEMES[colorScheme].colors.map((c, i) => {
          const labels = ['Low','Mod','High','Critical']
          return (
            <span key={labels[i]} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />{labels[i]}
            </span>
          )
        })}
        <span className="text-slate-600 ml-1">|</span>
        <span className="text-slate-500">Size = {timeMachine ? 'death rate' : 'population'}</span>
      </div>

      {/* Bottom-center: County quick-select */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000]">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="glass-panel px-4 py-2 text-sm font-semibold text-white focus:outline-none cursor-pointer transition"
          style={{ borderRadius: 12 }}
        >
          {counties.map(c => <option key={c.name} value={c.name}>{c.name} County</option>)}
        </select>
      </div>

      {/* Right side: Floating controls panel */}
      {showControls && (
        <div className="absolute bottom-4 right-3 z-[1000] fade-up" style={{ width: 280 }}>
          <div className="glass-panel px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 rounded-full" style={{ background: isBW ? '#888' : 'linear-gradient(180deg,#f97316,#a78bfa)' }} />
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold">Policy Levers</p>
                  <p className="text-xs font-bold text-white leading-none mt-0.5">Interventions</p>
                </div>
              </div>
              <button
                onClick={() => setInterventions({ naloxone: 0, prescribing: 0, treatment: 0 })}
                className="text-[10px] font-semibold transition px-2 py-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}
                onMouseEnter={e => { e.target.style.color='#fff'; e.target.style.borderColor='rgba(255,255,255,0.2)' }}
                onMouseLeave={e => { e.target.style.color='#64748b'; e.target.style.borderColor='rgba(255,255,255,0.08)' }}
              >
                Reset
              </button>
            </div>
            <InterventionSliders values={interventions} onChange={handleSlider} compact />

            {/* Quick presets */}
            <div className="flex gap-1.5 mt-3">
              {[
                { label: 'None', v: { naloxone: 0, prescribing: 0, treatment: 0 }, color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
                { label: 'Plan A', v: { naloxone: 0.4, prescribing: 0.3, treatment: 0.4 }, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
                { label: 'Plan B', v: { naloxone: 0.8, prescribing: 0.6, treatment: 0.7 }, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
                { label: 'Max', v: { naloxone: 1, prescribing: 1, treatment: 1 }, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
              ].map(p => (
                <button
                  key={p.label}
                  onClick={() => setInterventions(p.v)}
                  className="flex-1 px-2 py-1.5 text-[10px] font-bold rounded-lg transition press-effect"
                  style={{ background: p.bg, border: `1px solid ${p.color}44`, color: p.color }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Generate policy report */}
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`${API}/policy-letter`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ county: selected, budget: 2000000, ...interventions }),
                  })
                  const data = await res.json()
                  const blob = new Blob([data.letter], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `DrugDiffuse_${selected}_Policy_Report.txt`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch {}
              }}
              className="w-full mt-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-green-600/80 to-emerald-600/80 text-white hover:brightness-110 transition press-effect flex items-center justify-center gap-1.5"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download Policy Report
            </button>
          </div>
        </div>
      )}

      {/* ═══ TIME MACHINE ═══ */}
      {timeMachine && timeseriesData && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1001] fade-up" style={{ width: 'min(600px, calc(100% - 32px))' }}>
          <div className="glass-panel px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold text-white">Indiana Opioid Epidemic</p>
                <span className="text-2xl font-black font-mono text-white">{currentYear}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setCurrentYear(2003); setPlaying(false) }}
                  className="w-7 h-7 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition text-xs flex items-center justify-center press-effect"
                >
                  ⏮
                </button>
                <button
                  onClick={() => setPlaying(p => !p)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition press-effect ${
                    playing ? 'bg-red-600 text-white' : 'bg-white/10 text-white border border-slate-600 hover:border-slate-400'
                  }`}
                >
                  {playing ? '⏸' : '▶'}
                </button>
                <button
                  onClick={() => { setCurrentYear(2021); setPlaying(false) }}
                  className="w-7 h-7 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition text-xs flex items-center justify-center press-effect"
                >
                  ⏭
                </button>
              </div>
            </div>

            {/* Year slider */}
            <div className="relative">
              <input
                type="range"
                min={2003}
                max={2021}
                value={currentYear}
                onChange={e => { setCurrentYear(parseInt(e.target.value)); setPlaying(false) }}
                className="w-full"
                style={{ '--pct': `${((currentYear - 2003) / 18) * 100}%` }}
              />
              {/* Year labels */}
              <div className="flex justify-between mt-1">
                {[2003, 2006, 2009, 2012, 2015, 2018, 2021].map(y => (
                  <span
                    key={y}
                    className={`text-[9px] font-mono cursor-pointer transition ${
                      y === currentYear ? 'text-white font-bold' : 'text-slate-600 hover:text-slate-400'
                    }`}
                    onClick={() => { setCurrentYear(y); setPlaying(false) }}
                  >
                    {y}
                  </span>
                ))}
              </div>
            </div>

            {/* Context label */}
            <div className="mt-2 text-[10px] text-slate-400 text-center">
              {currentYear <= 2010 && 'Prescription opioid era — rates rising steadily'}
              {currentYear > 2010 && currentYear <= 2013 && 'Heroin transition — prescription crackdowns push users to street drugs'}
              {currentYear === 2014 && 'Fentanyl enters the supply — death rates begin accelerating'}
              {currentYear === 2015 && '⚠ Scott County HIV outbreak — 235 infected from injection drug use'}
              {currentYear >= 2016 && currentYear <= 2019 && 'Fentanyl surge — death rates nearly double across Indiana'}
              {currentYear >= 2020 && 'COVID-19 pandemic — isolation drives overdoses to record highs'}
            </div>

            {/* Selected county stat for current year */}
            {timeseriesData[selected]?.[String(currentYear)] && (
              <div className="flex items-center justify-center gap-6 mt-2 pt-2 border-t border-slate-700/50">
                <div className="text-center">
                  <p className="text-[9px] text-slate-500 uppercase">{selected}</p>
                  <p className="text-sm font-black font-mono text-red-400">
                    {timeseriesData[selected][String(currentYear)].rate}/100K
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-slate-500 uppercase">Est. Deaths</p>
                  <p className="text-sm font-black font-mono text-white">
                    {Math.round(timeseriesData[selected][String(currentYear)].deaths)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-slate-500 uppercase">Population</p>
                  <p className="text-sm font-black font-mono text-slate-300">
                    {timeseriesData[selected][String(currentYear)].pop?.toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline overlay */}
      {showTimeline && result && (
        <div className="absolute bottom-4 left-3 right-[300px] z-[999] fade-up" style={{ maxWidth: 'calc(100% - 320px)' }}>
          <div className="glass-panel px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                5-Year Projection — {selected}
              </p>
              <button onClick={() => setShowTimeline(false)} className="text-slate-500 hover:text-white text-xs transition">X</button>
            </div>
            <div style={{ height: 160 }}>
              <TimelineChart result={result} compact />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
