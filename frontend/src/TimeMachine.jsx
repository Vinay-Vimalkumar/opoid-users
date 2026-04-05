import { useState, useEffect, useRef } from 'react'

const API = '/api'

const TIMELINE_EVENTS = [
  { year: 2003, label: 'OxyContin prescriptions peak nationally', type: 'crisis' },
  { year: 2005, label: 'Scott County sees early prescription spikes', type: 'crisis' },
  { year: 2008, label: 'Pill mills proliferate across rural Indiana', type: 'crisis' },
  { year: 2011, label: 'Heroin begins replacing prescriptions', type: 'crisis' },
  { year: 2013, label: 'Counterfactual: Interventions could begin here', type: 'intervention' },
  { year: 2015, label: 'HIV outbreak — 215 cases in Scott County', type: 'outbreak' },
  { year: 2017, label: 'Fentanyl drives statewide overdose surge', type: 'crisis' },
  { year: 2019, label: 'Indiana OUD deaths reach all-time high', type: 'crisis' },
  { year: 2021, label: 'COVID amplifies crisis — isolation, disrupted treatment', type: 'crisis' },
]

function useAnimatedNumber(target, duration = 1500, active = true) {
  const [val, setVal] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    if (!active) return
    const from = prev.current
    const diff = target - from
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(from + ease * diff))
      if (p < 1) requestAnimationFrame(tick)
      else prev.current = target
    }
    requestAnimationFrame(tick)
  }, [target, duration, active])
  return val
}

export default function TimeMachine() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [currentYearIdx, setCurrentYearIdx] = useState(0)
  const [showIntervention, setShowIntervention] = useState(false)
  const [rewindMode, setRewindMode] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/counterfactual`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const scott = data?.scott_county
  const chartData = scott?.comparison || []
  const years = chartData.map(r => r.year)

  // Compute cumulative deaths up to current year
  const currentYear = years[currentYearIdx] || 2003
  const currentEvent = TIMELINE_EVENTS.find(e => e.year <= currentYear && (!TIMELINE_EVENTS.find(e2 => e2.year > e.year && e2.year <= currentYear)))
  const activeEvent = [...TIMELINE_EVENTS].reverse().find(e => e.year <= currentYear)

  const cumulativeActual = chartData
    .filter(r => r.year <= currentYear)
    .reduce((sum, r) => sum + Math.round(r.actual_deaths || 0), 0)

  const cumulativeIntervention = chartData
    .filter(r => r.year <= currentYear)
    .reduce((sum, r) => sum + Math.round(r.aggressive_intervention || 0), 0)

  const livesSaved = Math.max(0, cumulativeActual - cumulativeIntervention)

  const animActual = useAnimatedNumber(cumulativeActual, 800)
  const animIntervention = useAnimatedNumber(showIntervention ? cumulativeIntervention : 0, 800)
  const animSaved = useAnimatedNumber(showIntervention ? livesSaved : 0, 800)

  const play = () => {
    setPlaying(true)
    setShowIntervention(false)
    setRewindMode(false)
    setCurrentYearIdx(0)
  }

  const rewind = () => {
    setRewindMode(true)
    setShowIntervention(true)
    setCurrentYearIdx(0)
    setPlaying(true)
  }

  useEffect(() => {
    if (!playing) return
    intervalRef.current = setInterval(() => {
      setCurrentYearIdx(prev => {
        if (prev >= years.length - 1) {
          setPlaying(false)
          clearInterval(intervalRef.current)
          if (!rewindMode) {
            // After first playthrough, prompt rewind
          }
          return prev
        }
        return prev + 1
      })
    }, 600)
    return () => clearInterval(intervalRef.current)
  }, [playing, years.length, rewindMode])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading time machine data...</p>
        </div>
      </div>
    )
  }

  if (!data || !scott) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
        <p className="text-slate-400 text-sm">No counterfactual data available.</p>
      </div>
    )
  }

  const progress = years.length > 1 ? currentYearIdx / (years.length - 1) : 0
  const isHIVYear = currentYear >= 2015 && currentYear <= 2016
  const isPast2013 = currentYear >= 2013

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div
        className="rounded-2xl p-6 border relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(249,115,22,0.08))',
          borderColor: 'rgba(239,68,68,0.2)',
        }}
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <span style={{ filter: 'none' }}>&#8986;</span>
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Scott County Time Machine</h2>
              <p className="text-slate-400 text-xs">What if we could go back and save lives?</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm max-w-3xl leading-relaxed mt-2">
            In 2015, Scott County Indiana experienced one of the worst HIV outbreaks in U.S. history,
            fueled by the opioid crisis. Watch the crisis unfold year by year — then rewind to see
            how many lives could have been saved with early intervention.
          </p>
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="rounded-2xl p-6 border border-slate-800 relative" style={{ background: 'rgba(15,23,42,0.7)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={play}
              disabled={playing}
              className="px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50"
              style={{
                background: playing ? 'rgba(239,68,68,0.15)' : '#ef4444',
                color: playing ? '#ef4444' : 'white',
                border: playing ? '1px solid rgba(239,68,68,0.3)' : 'none',
              }}
            >
              {playing && !rewindMode ? 'Playing...' : 'Play Crisis Timeline'}
            </button>
            {!playing && currentYearIdx > 0 && !rewindMode && (
              <button
                onClick={rewind}
                className="px-4 py-2 rounded-lg text-sm font-bold transition"
                style={{
                  background: '#22c55e',
                  color: 'white',
                  boxShadow: '0 0 20px rgba(34,197,94,0.3)',
                }}
              >
                Rewind &amp; Save Lives
              </button>
            )}
          </div>
          <div className="text-right">
            <span className="text-4xl font-black font-mono text-white">{currentYear}</span>
            {rewindMode && <span className="text-green-400 text-xs font-bold ml-2 uppercase tracking-wide">Intervention Active</span>}
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-3 rounded-full bg-slate-800 overflow-hidden mb-4">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progress * 100}%`,
              background: rewindMode
                ? 'linear-gradient(90deg, #22c55e, #10b981)'
                : isHIVYear
                  ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                  : 'linear-gradient(90deg, #f97316, #ef4444)',
              boxShadow: isHIVYear && !rewindMode ? '0 0 12px rgba(239,68,68,0.5)' : undefined,
            }}
          />
          {/* Year markers */}
          {[2003, 2005, 2010, 2013, 2015, 2018, 2021].map(y => {
            const idx = years.indexOf(y)
            if (idx < 0) return null
            const pct = idx / (years.length - 1) * 100
            return (
              <div key={y} className="absolute top-full mt-1" style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}>
                <span className={`text-[10px] font-mono ${y === 2015 ? 'text-red-400 font-bold' : y === 2013 ? 'text-yellow-400 font-bold' : 'text-slate-600'}`}>
                  {y}
                </span>
              </div>
            )
          })}
        </div>

        {/* Event ticker */}
        {activeEvent && (
          <div
            className="mt-6 rounded-xl p-4 border transition-all duration-500"
            style={{
              borderColor: activeEvent.type === 'outbreak' ? 'rgba(239,68,68,0.5)' :
                           activeEvent.type === 'intervention' ? 'rgba(34,197,94,0.5)' :
                           'rgba(249,115,22,0.3)',
              background: activeEvent.type === 'outbreak' ? 'rgba(239,68,68,0.08)' :
                          activeEvent.type === 'intervention' ? 'rgba(34,197,94,0.08)' :
                          'rgba(249,115,22,0.05)',
              boxShadow: activeEvent.type === 'outbreak' ? '0 0 30px rgba(239,68,68,0.1)' : 'none',
            }}
          >
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-black font-mono ${
                activeEvent.type === 'outbreak' ? 'text-red-400' :
                activeEvent.type === 'intervention' ? 'text-green-400' :
                'text-orange-400'
              }`}>{activeEvent.year}</span>
              <span className="text-sm text-slate-300">{activeEvent.label}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Actual deaths */}
        <div
          className="rounded-2xl p-6 border transition-all duration-500"
          style={{
            borderColor: isHIVYear && !rewindMode ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.2)',
            background: 'rgba(239,68,68,0.05)',
            boxShadow: isHIVYear && !rewindMode ? '0 0 40px rgba(239,68,68,0.15)' : 'none',
          }}
        >
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Cumulative Deaths (Actual)</p>
          <p className="text-5xl font-black font-mono text-red-400">{animActual.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-2">Without any intervention</p>
        </div>

        {/* Intervention deaths */}
        <div
          className="rounded-2xl p-6 border transition-all duration-500"
          style={{
            borderColor: showIntervention ? 'rgba(34,197,94,0.5)' : 'rgba(34,197,94,0.15)',
            background: showIntervention ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.03)',
            boxShadow: showIntervention ? '0 0 40px rgba(34,197,94,0.12)' : 'none',
          }}
        >
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">
            {showIntervention ? 'With Early Intervention' : 'Rewind to see...'}
          </p>
          <p className={`text-5xl font-black font-mono ${showIntervention ? 'text-green-400' : 'text-slate-700'}`}>
            {showIntervention ? animIntervention.toLocaleString() : '???'}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {showIntervention ? 'Naloxone 70% + Treatment 60%' : 'Press "Rewind & Save Lives"'}
          </p>
        </div>

        {/* Lives saved */}
        <div
          className="rounded-2xl p-6 border transition-all duration-500 relative overflow-hidden"
          style={{
            borderColor: showIntervention ? 'rgba(250,204,21,0.5)' : 'rgba(250,204,21,0.15)',
            background: showIntervention ? 'rgba(250,204,21,0.08)' : 'rgba(250,204,21,0.03)',
            boxShadow: showIntervention && livesSaved > 0 ? '0 0 40px rgba(250,204,21,0.12)' : 'none',
          }}
        >
          {showIntervention && livesSaved > 0 && (
            <div className="absolute inset-0 opacity-10"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(250,204,21,0.3), transparent)',
              }}
            />
          )}
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2 relative">Lives Saveable</p>
          <p className={`text-5xl font-black font-mono relative ${showIntervention ? 'text-yellow-400' : 'text-slate-700'}`}>
            {showIntervention ? animSaved.toLocaleString() : '???'}
          </p>
          <p className="text-xs text-slate-500 mt-2 relative">
            {showIntervention
              ? `${livesSaved > 0 ? Math.round(livesSaved / Math.max(cumulativeActual, 1) * 100) : 0}% of all deaths could have been prevented`
              : 'The number that should haunt us'}
          </p>
        </div>
      </div>

      {/* Visual chart — mini sparkline of deaths over time */}
      <div className="rounded-2xl p-6 border border-slate-800" style={{ background: 'rgba(15,23,42,0.7)' }}>
        <h3 className="text-sm font-bold text-slate-300 mb-4">Deaths Over Time — Scott County</h3>
        <div className="relative h-48">
          <svg width="100%" height="100%" viewBox={`0 0 ${chartData.length * 40} 200`} preserveAspectRatio="none">
            {/* Grid lines */}
            {[0, 50, 100, 150, 200].map(y => (
              <line key={y} x1="0" y1={y} x2={chartData.length * 40} y2={y}
                stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            ))}

            {/* Actual deaths line */}
            <polyline
              fill="none"
              stroke="#ef4444"
              strokeWidth="3"
              points={chartData.slice(0, currentYearIdx + 1).map((r, i) => {
                const x = i * 40 + 20
                const maxD = Math.max(...chartData.map(d => d.actual_deaths || 0), 1)
                const y = 190 - ((r.actual_deaths || 0) / maxD) * 170
                return `${x},${y}`
              }).join(' ')}
            />

            {/* Intervention line (only in rewind mode) */}
            {showIntervention && (
              <polyline
                fill="none"
                stroke="#22c55e"
                strokeWidth="3"
                strokeDasharray="6 3"
                points={chartData.slice(0, currentYearIdx + 1).map((r, i) => {
                  const x = i * 40 + 20
                  const maxD = Math.max(...chartData.map(d => d.actual_deaths || 0), 1)
                  const y = 190 - ((r.aggressive_intervention || 0) / maxD) * 170
                  return `${x},${y}`
                }).join(' ')}
              />
            )}

            {/* HIV outbreak marker */}
            {(() => {
              const idx = chartData.findIndex(r => r.year === 2015)
              if (idx >= 0 && currentYearIdx >= idx) {
                const x = idx * 40 + 20
                return (
                  <g>
                    <line x1={x} y1="0" x2={x} y2="200" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                    <text x={x + 5} y="15" fill="#ef4444" fontSize="10" fontWeight="bold">HIV Outbreak</text>
                  </g>
                )
              }
              return null
            })()}

            {/* 2013 intervention marker */}
            {(() => {
              const idx = chartData.findIndex(r => r.year === 2013)
              if (idx >= 0 && showIntervention && currentYearIdx >= idx) {
                const x = idx * 40 + 20
                return (
                  <g>
                    <line x1={x} y1="0" x2={x} y2="200" stroke="#22c55e" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                    <text x={x + 5} y="15" fill="#22c55e" fontSize="10" fontWeight="bold">Intervention starts</text>
                  </g>
                )
              }
              return null
            })()}
          </svg>

          {/* Legend */}
          <div className="absolute top-2 right-2 flex gap-4">
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <span className="w-3 h-0.5 bg-red-400 inline-block" /> Actual
            </span>
            {showIntervention && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-3 h-0.5 bg-green-400 inline-block" style={{ borderTop: '2px dashed #22c55e' }} /> With Intervention
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom insight */}
      {showIntervention && !playing && currentYearIdx >= years.length - 1 && (
        <div
          className="rounded-2xl p-6 border text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(250,204,21,0.08))',
            borderColor: 'rgba(34,197,94,0.3)',
          }}
        >
          <p className="text-3xl font-black text-white mb-2">
            <span className="text-green-400">{livesSaved.toLocaleString()}</span> lives could have been saved.
          </p>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            If naloxone access and treatment expansion had been deployed in Scott County starting 2013 —
            two years before the HIV outbreak — {Math.round(livesSaved / Math.max(cumulativeActual, 1) * 100)}%
            of deaths could have been prevented. Morpheus helps ensure we never miss that window again.
          </p>
        </div>
      )}
    </div>
  )
}
