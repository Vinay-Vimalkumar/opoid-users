import React from 'react'

const FEATURES = [
  { key: 'treatment', label: 'Treatment Access', color: '#a78bfa', isIntervention: true },
  { key: 'prescribing', label: 'Prescribing Reduction', color: '#60a5fa', isIntervention: true },
  { key: 'naloxone', label: 'Naloxone Access', color: '#34d399', isIntervention: true },
  { key: 'population', label: 'County Population', color: '#fbbf24' },
  { key: 'overdose_rate_per_100k', label: 'Overdose Death Rate', color: '#f87171' },
  { key: 'pct_uninsured', label: '% Uninsured', color: '#fb923c' },
  { key: 'od_touchpoints', label: 'OD System Touchpoints', color: '#e879f9' },
  { key: 'treatment_facilities', label: 'Treatment Facilities', color: '#38bdf8' },
  { key: 'median_household_income', label: 'Median Income', color: '#a3e635' },
]

export default function FeatureImportance({ importance }) {
  if (!importance) return null

  // Sort by value descending
  const sorted = FEATURES
    .map(f => ({ ...f, val: importance[f.key] || 0 }))
    .sort((a, b) => b.val - a.val)

  const maxVal = Math.max(...sorted.map(f => f.val))
  if (maxVal === 0) return null

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300">ML Feature Importance</h2>
        <span className="text-[10px] text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">XGBoost</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Which factors have the most impact on lives saved per dollar?</p>
      <div className="space-y-2">
        {sorted.map(f => {
          const pct = (f.val / maxVal) * 100
          return (
            <div key={f.key}>
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[11px] text-slate-300">
                  {f.label}
                  {f.isIntervention && (
                    <span className="text-[9px] text-slate-600 ml-1">(lever)</span>
                  )}
                </span>
                <span className="text-[11px] font-mono text-slate-400">{(f.val * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
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
