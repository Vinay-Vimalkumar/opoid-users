import React from 'react'

const FEATURES = [
  { key: 'treatment', label: 'Treatment Access', color: '#a78bfa' },
  { key: 'prescribing', label: 'Prescribing Reduction', color: '#60a5fa' },
  { key: 'naloxone', label: 'Naloxone Access', color: '#34d399' },
  { key: 'population', label: 'County Population', color: '#fbbf24' },
]

export default function FeatureImportance({ importance }) {
  if (!importance) return null

  const maxVal = Math.max(...Object.values(importance))

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300">ML Feature Importance</h2>
        <span className="text-[10px] text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">XGBoost R²=0.91</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Which intervention lever has the most impact on lives saved per dollar?</p>
      <div className="space-y-2.5">
        {FEATURES.map(f => {
          const val = importance[f.key] || 0
          const pct = (val / maxVal) * 100
          return (
            <div key={f.key}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-300">{f.label}</span>
                <span className="text-xs font-mono text-slate-400">{(val * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: f.color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
