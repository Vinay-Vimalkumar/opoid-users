import { useState, useEffect, useCallback } from 'react'
import CountyMap from './CountyMap'
import InterventionSliders from './InterventionSliders'
import TimelineChart from './TimelineChart'
import LivesCounter from './LivesCounter'
import ComparisonView from './ComparisonView'
import ChatInterface from './ChatInterface'

const API = '/api'

const PRESETS = [
  { name: 'Naloxone Push',   values: { naloxone: 0.9, prescribing: 0.1, treatment: 0.2 } },
  { name: 'Treatment Focus', values: { naloxone: 0.2, prescribing: 0.2, treatment: 0.9 } },
  { name: 'Balanced',        values: { naloxone: 0.5, prescribing: 0.5, treatment: 0.5 } },
  { name: 'Policy Reform',   values: { naloxone: 0.2, prescribing: 0.9, treatment: 0.3 } },
]

export default function SimulatorPage() {
  const [counties, setCounties] = useState([])
  const [selectedCounty, setSelectedCounty] = useState('Marion')
  const [interventions, setInterventions] = useState({ naloxone: 0, prescribing: 0, treatment: 0 })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showChat, setShowChat] = useState(false)

  useEffect(() => {
    fetch(`${API}/counties`).then(r => r.json()).then(setCounties).catch(() => {})
  }, [])

  const runSimulation = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ county: selectedCounty, ...interventions, months: 60, seed: 42 }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      console.error('Simulation failed:', e)
    }
    setLoading(false)
  }, [selectedCounty, interventions])

  useEffect(() => { runSimulation() }, [runSimulation])

  const handleSliderChange = (lever, value) =>
    setInterventions(prev => ({ ...prev, [lever]: value }))

  const handleChatResult = (simData) => {
    if (simData) {
      setSelectedCounty(simData.county)
      setInterventions(simData.interventions)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600 font-semibold uppercase tracking-wide">Quick presets:</span>
        {PRESETS.map(p => (
          <button
            key={p.name}
            onClick={() => setInterventions(p.values)}
            className="px-3 py-1 text-xs rounded-lg border border-slate-800 text-slate-400 hover:border-cyan-700 hover:text-cyan-400 transition card-hover"
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={() => setInterventions({ naloxone: 0, prescribing: 0, treatment: 0 })}
          className="px-3 py-1 text-xs rounded-lg border border-slate-800 text-slate-600 hover:border-red-900 hover:text-red-500 transition ml-auto"
        >
          Reset
        </button>
        <button
          onClick={() => setShowChat(!showChat)}
          className="px-4 py-1.5 rounded-lg text-white text-xs font-semibold transition"
          style={{
            background: showChat ? '#334155' : 'linear-gradient(135deg, #0891b2, #7c3aed)',
            boxShadow: showChat ? 'none' : '0 0 12px rgba(6,182,212,0.25)',
          }}
        >
          {showChat ? '← Dashboard' : '✦ AI Chat'}
        </button>
      </div>

      {showChat ? (
        <ChatInterface onResult={handleChatResult} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Map + Sliders */}
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 card-hover">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-300">Select County</h2>
                <select
                  value={selectedCounty}
                  onChange={e => setSelectedCounty(e.target.value)}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-600 cursor-pointer"
                >
                  {counties.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <CountyMap
                counties={counties}
                selected={selectedCounty}
                onSelect={setSelectedCounty}
                result={result}
              />
            </div>

            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 card-hover">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-300">Intervention Levers</h2>
                {result?.cost != null && (
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-900/50 px-2 py-0.5 rounded">
                    {result.cost >= 1_000_000
                      ? `$${(result.cost / 1_000_000).toFixed(1)}M`
                      : `$${(result.cost / 1_000).toFixed(0)}K`}
                  </span>
                )}
              </div>
              <InterventionSliders values={interventions} onChange={handleSliderChange} />
            </div>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-2 space-y-4">
            <LivesCounter result={result} loading={loading} county={selectedCounty} />

            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 card-hover">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                5-Year Projection — {selectedCounty} County
              </h2>
              <TimelineChart result={result} />
            </div>

            <ComparisonView result={result} />
          </div>
        </div>
      )}
    </div>
  )
}
