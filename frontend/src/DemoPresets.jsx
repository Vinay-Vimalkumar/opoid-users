import React from 'react'

const PRESETS = [
  {
    label: 'No Intervention',
    desc: 'Baseline — what happens if we do nothing',
    county: 'Marion',
    interventions: { naloxone: 0, prescribing: 0, treatment: 0 },
    color: 'border-red-800/50 hover:border-red-700',
    badge: 'bg-red-900/50 text-red-400',
  },
  {
    label: 'Naloxone Blitz',
    desc: 'Maximum naloxone deployment only',
    county: 'Marion',
    interventions: { naloxone: 1.0, prescribing: 0, treatment: 0 },
    color: 'border-green-800/50 hover:border-green-700',
    badge: 'bg-green-900/50 text-green-400',
  },
  {
    label: 'Balanced $2M',
    desc: 'Optimal allocation for a $2M budget',
    county: 'Marion',
    interventions: { naloxone: 0.3, prescribing: 0.25, treatment: 0.4 },
    color: 'border-blue-800/50 hover:border-blue-700',
    badge: 'bg-blue-900/50 text-blue-400',
  },
  {
    label: 'Rural Crisis (Scott)',
    desc: 'All-out intervention for hardest-hit county',
    county: 'Scott',
    interventions: { naloxone: 0.9, prescribing: 0.7, treatment: 0.9 },
    color: 'border-purple-800/50 hover:border-purple-700',
    badge: 'bg-purple-900/50 text-purple-400',
  },
  {
    label: 'Treatment-Only',
    desc: 'Focus entirely on treatment access',
    county: 'Marion',
    interventions: { naloxone: 0, prescribing: 0, treatment: 1.0 },
    color: 'border-amber-800/50 hover:border-amber-700',
    badge: 'bg-amber-900/50 text-amber-400',
  },
  {
    label: 'Max Everything',
    desc: 'What if we could do it all?',
    county: 'Marion',
    interventions: { naloxone: 1.0, prescribing: 1.0, treatment: 1.0 },
    color: 'border-cyan-800/50 hover:border-cyan-700',
    badge: 'bg-cyan-900/50 text-cyan-400',
  },
]

export default function DemoPresets({ onApply }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h2 className="text-sm font-semibold text-slate-300 mb-3">Quick Scenarios</h2>
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => onApply(p.county, p.interventions)}
            className={`text-left p-2.5 rounded-lg border ${p.color} bg-slate-900/30 transition hover:bg-slate-900/60`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.badge}`}>{p.label}</span>
            </div>
            <p className="text-[10px] text-slate-500">{p.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
