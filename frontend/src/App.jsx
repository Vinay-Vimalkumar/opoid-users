import React, { useState, useEffect, useCallback, useRef } from 'react'
import CountyMap from './CountyMap'
import InterventionSliders from './InterventionSliders'
import TimelineChart from './TimelineChart'
import LivesCounter from './LivesCounter'
import ComparisonView from './ComparisonView'
import ChatInterface from './ChatInterface'
import MultiCountyView from './MultiCountyView'
import HistoricalChart from './HistoricalChart'
import ScenarioCompare from './ScenarioCompare'
import SensitivityHeatmap from './SensitivityHeatmap'
import FeatureImportance from './FeatureImportance'
import DemoPresets from './DemoPresets'
import StatewideSummary from './StatewideSummary'
import MonteCarloChart from './MonteCarloChart'
import FrontierChart from './FrontierChart'
import CountySelector from './CountySelector'
import CounterfactualView from './CounterfactualView'
import MethodologyView from './MethodologyView'

const API = '/api'

export default function App() {
  const [counties, setCounties] = useState([])
  const [selectedCounty, setSelectedCounty] = useState('Marion')
  const [interventions, setInterventions] = useState({ naloxone: 0, prescribing: 0, treatment: 0 })
  const [baseline, setBaseline] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState(false)
  const [viewMode, setViewMode] = useState('single') // 'single' | 'all' | 'compare' | 'sensitivity' | 'whatif' | 'methodology' | 'chat'
  const [featureImportance, setFeatureImportance] = useState(null)

  // Optimize state
  const [optimizeBudget, setOptimizeBudget] = useState(2000000)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeResult, setOptimizeResult] = useState(null)

  // Debounce ref
  const debounceRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/counties`)
      .then(r => r.json())
      .then(data => { setCounties(data); setApiError(false) })
      .catch(() => setApiError(true))
    fetch(`${API}/feature_importance`)
      .then(r => r.json())
      .then(setFeatureImportance)
      .catch(() => {})
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
      setBaseline({ total_deaths: data.baseline_deaths, timeline: null })
      setApiError(false)
    } catch (e) {
      console.error('Simulation failed:', e)
      setApiError(true)
    }
    setLoading(false)
  }, [selectedCounty, interventions])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSimulation(), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [runSimulation])

  const handleSliderChange = (lever, value) => {
    setInterventions(prev => ({ ...prev, [lever]: value }))
  }

  const handleChatResult = (simData) => {
    if (simData) {
      setSelectedCounty(simData.county)
      setInterventions(simData.interventions)
      setViewMode('single')
    }
  }

  const handleOptimize = async () => {
    setOptimizing(true)
    setOptimizeResult(null)
    try {
      const res = await fetch(`${API}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ county: selectedCounty, budget: optimizeBudget }),
      })
      const data = await res.json()
      setOptimizeResult(data)
      if (data.optimal_interventions) {
        setInterventions({
          naloxone: data.optimal_interventions.naloxone ?? 0,
          prescribing: data.optimal_interventions.prescribing ?? 0,
          treatment: data.optimal_interventions.treatment ?? 0,
        })
      }
    } catch (e) {
      setOptimizeResult({ error: 'Optimization failed. Is the API running?' })
    }
    setOptimizing(false)
  }

  const handleMultiCountySelect = (countyName) => {
    setSelectedCounty(countyName)
    setViewMode('single')
  }

  const handlePreset = (county, interventions) => {
    setSelectedCounty(county)
    setInterventions(interventions)
  }

  const handleExport = () => {
    if (!result) return
    const rows = Object.entries(result.timeline).map(([month, snap]) => ({
      month: parseInt(month),
      year: (parseInt(month) / 12).toFixed(1),
      cumulative_deaths: snap.cumulative_deaths,
      deaths_this_month: snap.deaths_this_month,
      overdoses_this_month: snap.overdoses_this_month,
      oud: snap.oud,
      treatment: snap.treatment,
      recovered: snap.recovered,
    }))
    const header = Object.keys(rows[0]).join(',')
    const csv = [header, ...rows.map(r => Object.values(r).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drugdiffuse_${selectedCounty}_simulation.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const NAV_ITEMS = [
    { key: 'single', label: 'Dashboard' },
    { key: 'compare', label: 'Compare' },
    { key: 'sensitivity', label: 'Sensitivity' },
    { key: 'all', label: 'All Counties' },
    { key: 'whatif', label: 'What If?' },
    { key: 'methodology', label: 'How It Works' },
    { key: 'chat', label: 'AI Chat' },
  ]

  return (
    <div className="min-h-screen bg-slate-900">
      {apiError && (
        <div className="bg-red-900/80 border-b border-red-700 px-4 py-2 text-center text-sm text-red-200">
          API server not running. Start with: <code className="bg-red-800/60 px-2 py-0.5 rounded text-xs font-mono">python run.py</code>
        </div>
      )}

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
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden lg:block mr-2">Policy exploration tool — not medical advice</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.key}
                  onClick={() => setViewMode(item.key)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === item.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {viewMode === 'chat' ? (
          <ChatInterface onResult={handleChatResult} />
        ) : viewMode === 'all' ? (
          <div className="space-y-4">
            <StatewideSummary />
            <MultiCountyView onSelectCounty={handleMultiCountySelect} />
          </div>
        ) : viewMode === 'whatif' ? (
          <CounterfactualView />
        ) : viewMode === 'methodology' ? (
          <MethodologyView />
        ) : viewMode === 'compare' ? (
          <div>
            <CountySelector selected={selectedCounty} onChange={setSelectedCounty} />
            <ScenarioCompare county={selectedCounty} />
          </div>
        ) : viewMode === 'sensitivity' ? (
          <div className="space-y-4">
            <CountySelector selected={selectedCounty} onChange={setSelectedCounty} />
            <FrontierChart county={selectedCounty} />
            <SensitivityHeatmap county={selectedCounty} />
            <FeatureImportance importance={featureImportance} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column */}
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

              {/* Optimize */}
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <h2 className="text-sm font-semibold text-slate-300 mb-3">Budget Optimizer</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Budget ($)</label>
                    <input
                      type="number"
                      value={optimizeBudget}
                      onChange={e => setOptimizeBudget(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                      min={0} step={100000}
                    />
                  </div>
                  <button
                    onClick={handleOptimize}
                    disabled={optimizing}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 rounded-lg text-white text-sm font-medium transition"
                  >
                    {optimizing ? 'Optimizing...' : 'Find Optimal Strategy'}
                  </button>

                  {optimizeResult && !optimizeResult.error && (
                    <div className="p-3 bg-slate-900 rounded-lg border border-purple-800/50 text-xs space-y-1">
                      <p className="font-semibold text-purple-400">Optimal Strategy Found</p>
                      {optimizeResult.estimated_lives_saved != null && (
                        <p className="text-green-400">Est. Lives Saved: <span className="font-mono font-bold">{optimizeResult.estimated_lives_saved}</span></p>
                      )}
                      {optimizeResult.lives_saved_per_million != null && (
                        <p className="text-slate-300">Efficiency: <span className="font-mono">{optimizeResult.lives_saved_per_million} lives/M$</span></p>
                      )}
                      {optimizeResult.estimated_cost != null && (
                        <p className="text-slate-300">Est. Cost: <span className="font-mono">${(optimizeResult.estimated_cost / 1_000_000).toFixed(2)}M</span></p>
                      )}
                      {optimizeResult.optimal_interventions && (
                        <div className="text-slate-400 pt-1 border-t border-slate-700 mt-1">
                          <p>Naloxone: {Math.round((optimizeResult.optimal_interventions.naloxone ?? 0) * 100)}%</p>
                          <p>Prescribing: {Math.round((optimizeResult.optimal_interventions.prescribing ?? 0) * 100)}%</p>
                          <p>Treatment: {Math.round((optimizeResult.optimal_interventions.treatment ?? 0) * 100)}%</p>
                        </div>
                      )}
                    </div>
                  )}

                  {optimizeResult?.error && (
                    <div className="p-3 bg-red-900/30 rounded-lg border border-red-800/50 text-xs text-red-400">
                      {optimizeResult.error}
                    </div>
                  )}
                </div>
              </div>

              {/* Demo Presets */}
              <DemoPresets onApply={handlePreset} />

              {/* Feature Importance */}
              <FeatureImportance importance={featureImportance} />
            </div>

            {/* Right column: Main visualization */}
            <div className="lg:col-span-2 space-y-4">
              <LivesCounter result={result} loading={loading} />

              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-300">
                    5-Year Projection — {selectedCounty} County
                  </h2>
                  <button
                    onClick={handleExport}
                    disabled={!result}
                    className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-slate-300 transition"
                  >
                    Export CSV
                  </button>
                </div>
                <TimelineChart result={result} />
              </div>

              <MonteCarloChart county={selectedCounty} interventions={interventions} />

              <HistoricalChart county={selectedCounty} />

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
