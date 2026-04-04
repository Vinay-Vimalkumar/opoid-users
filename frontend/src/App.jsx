import React, { useState, useEffect, useCallback } from 'react'
import CountyMap from './CountyMap'
import InterventionSliders from './InterventionSliders'
import TimelineChart from './TimelineChart'
import LivesCounter from './LivesCounter'
import ComparisonView from './ComparisonView'
import ChatInterface from './ChatInterface'

const API = '/api'

export default function App() {
  const [counties, setCounties] = useState([])
  const [selectedCounty, setSelectedCounty] = useState('Marion')
  const [interventions, setInterventions] = useState({ naloxone: 0, prescribing: 0, treatment: 0 })
  const [baseline, setBaseline] = useState(null)
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
        body: JSON.stringify({
          county: selectedCounty,
          ...interventions,
          months: 60,
          seed: 42,
        }),
      })
      const data = await res.json()
      setResult(data)
      setBaseline({ total_deaths: data.baseline_deaths, timeline: null })
    } catch (e) {
      console.error('Simulation failed:', e)
    }
    setLoading(false)
  }, [selectedCounty, interventions])

  // Run simulation on county or intervention change
  useEffect(() => {
    runSimulation()
  }, [runSimulation])

  const handleSliderChange = (lever, value) => {
    setInterventions(prev => ({ ...prev, [lever]: value }))
  }

  const handleChatResult = (simData) => {
    if (simData) {
      setSelectedCounty(simData.county)
      setInterventions(simData.interventions)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              DD
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">DrugDiffuse</h1>
              <p className="text-xs text-slate-400">Indiana Opioid Policy Simulator</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:block">Policy exploration tool — not medical advice</span>
            <button
              onClick={() => setShowChat(!showChat)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition"
            >
              {showChat ? 'Dashboard' : 'AI Chat'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {showChat ? (
          <ChatInterface onResult={handleChatResult} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column: Map + County selector */}
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <h2 className="text-sm font-semibold text-slate-300 mb-3">Select County</h2>
                <CountyMap
                  counties={counties}
                  selected={selectedCounty}
                  onSelect={setSelectedCounty}
                  result={result}
                />
              </div>

              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <h2 className="text-sm font-semibold text-slate-300 mb-3">Intervention Levers</h2>
                <InterventionSliders
                  values={interventions}
                  onChange={handleSliderChange}
                />
              </div>
            </div>

            {/* Center column: Main visualization */}
            <div className="lg:col-span-2 space-y-4">
              {/* Lives counter cards */}
              <LivesCounter result={result} loading={loading} />

              {/* Timeline chart */}
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <h2 className="text-sm font-semibold text-slate-300 mb-3">
                  5-Year Projection — {selectedCounty} County
                </h2>
                <TimelineChart result={result} />
              </div>

              {/* Comparison */}
              <ComparisonView result={result} />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 mt-12 py-4 text-center text-xs text-slate-600">
        DrugDiffuse — Catapult Hackathon 2026 | Simplified model for policy exploration only
      </footer>
    </div>
  )
}
