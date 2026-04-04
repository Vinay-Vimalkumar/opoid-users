import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip as LeafletTooltip, ZoomControl, useMap, Polyline, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import InterventionSliders from './InterventionSliders'
import TimelineChart from './TimelineChart'

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
  const containerRef = useRef(null)
  const debounceRef = useRef(null)
  const pulseKeyRef = useRef(0)

  // Load counties
  useEffect(() => {
    fetch(`${API}/counties`).then(r => r.json()).then(data => {
      setCounties(data)
      setMaxPop(Math.max(...data.map(c => c.population)))
    }).catch(() => {})
  }, [])

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
          const norm = county.population / maxPop
          const isActive = county.name === selected
          const isHovered = county.name === hoveredCounty
          const size = Math.max(14, Math.min(36, Math.sqrt(county.population / 4000)))
          const color = isActive ? (isBW ? '#ddd' : '#a78bfa') : riskColor(norm, colorScheme)
          const cachedData = hoverData[county.name]

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
              <LeafletTooltip direction="top" offset={[0, -size/2 - 8]}>
                <div style={{ minWidth: 200, fontSize: 11, lineHeight: 1.7, fontFamily: "'Space Grotesk', sans-serif" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 8px ${color}` }} />
                    {county.name} County
                  </div>
                  <div class="tt-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#94a3b8' }}>Population</span>
                    <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{county.population?.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid rgba(148,163,184,0.15)', paddingBottom: 6, marginBottom: 6 }}>
                    <span style={{ color: '#94a3b8' }}>Risk Level</span>
                    <span style={{ fontWeight: 700, color }}>{riskLabel(norm)}</span>
                  </div>
                  ${cachedData ? '' : ''}
                  {cachedData ? (
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
                  ) : (
                    <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: '4px 0' }}>
                      Loading simulation...
                    </div>
                  )}
                </div>
              </LeafletTooltip>
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
      <div className="color-scheme-picker" style={{ bottom: 50 }}>
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

      {/* Top-left: Selected county info */}
      <div className="absolute top-3 left-3 z-[1000] fade-up">
        <div className="glass-panel px-5 py-4" style={{ minWidth: 240 }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Selected</p>
              <h2 className="text-xl font-black text-white leading-tight">{selected}</h2>
            </div>
            {loading && (
              <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {result && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Lives Saved', val: `+${result.lives_saved}`, color: '#22c55e' },
                { label: 'Reduction', val: `${reductionPct}%`, color: '#a78bfa' },
                { label: 'Deaths', val: result.total_deaths?.toLocaleString(), color: '#f59e0b' },
                { label: 'Cost', val: fmt(result.cost), color: '#06b6d4' },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wide">{s.label}</p>
                  <p className="text-sm font-black font-mono" style={{ color: s.color }}>{s.val}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top-right: Controls toggle + fullscreen */}
      <div className="absolute top-3 right-3 z-[1000] flex gap-2 fade-up">
        <button
          onClick={() => setShowTimeline(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl transition-all press-effect ${
            showTimeline ? 'bg-purple-600/80 text-white' : 'text-slate-300 hover:text-white'
          }`}
          style={{ background: showTimeline ? undefined : 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Timeline
        </button>
        <button
          onClick={() => setShowControls(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl transition-all press-effect ${
            showControls ? 'bg-orange-600/80 text-white' : 'text-slate-300 hover:text-white'
          }`}
          style={{ background: showControls ? undefined : 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Controls
        </button>
        <button
          onClick={() => setShowNetwork(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl transition-all press-effect ${
            showNetwork ? 'bg-cyan-600/80 text-white' : 'text-slate-300 hover:text-white'
          }`}
          style={{ background: showNetwork ? undefined : 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Network
        </button>
        <button
          onClick={toggleFullscreen}
          className="px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl text-slate-300 hover:text-white transition-all press-effect"
          style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {isFullscreen ? 'Exit' : 'Fullscreen'}
        </button>
      </div>

      {/* Bottom-left: Legend */}
      <div className="absolute bottom-4 left-3 z-[1000] glass-panel px-3 py-2 flex items-center gap-3 text-[10px] text-slate-400" style={{ borderRadius: 12 }}>
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
        <span className="text-slate-500">Size = population</span>
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
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Interventions</p>
              <button
                onClick={() => setInterventions({ naloxone: 0, prescribing: 0, treatment: 0 })}
                className="text-[10px] text-slate-500 hover:text-white transition px-1.5 py-0.5 rounded border border-slate-700 hover:border-slate-500"
              >
                Reset
              </button>
            </div>
            <InterventionSliders values={interventions} onChange={handleSlider} />

            {/* Quick presets */}
            <div className="flex gap-1.5 mt-3">
              {[
                { label: 'None', v: { naloxone: 0, prescribing: 0, treatment: 0 } },
                { label: 'Plan A', v: { naloxone: 0.4, prescribing: 0.3, treatment: 0.4 } },
                { label: 'Plan B', v: { naloxone: 0.8, prescribing: 0.6, treatment: 0.7 } },
                { label: 'Max', v: { naloxone: 1, prescribing: 1, treatment: 1 } },
              ].map(p => (
                <button
                  key={p.label}
                  onClick={() => setInterventions(p.v)}
                  className="flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition press-effect"
                >
                  {p.label}
                </button>
              ))}
            </div>
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
              <TimelineChart result={result} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
