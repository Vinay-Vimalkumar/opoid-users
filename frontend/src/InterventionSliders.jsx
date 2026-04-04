import React from 'react'

const LEVERS = [
  {
    key: 'naloxone',
    label: 'Naloxone Access',
    description: 'Reduces overdose fatality rate by up to 50%',
    color: 'from-green-500 to-emerald-600',
    costNote: '~$75/kit',
  },
  {
    key: 'prescribing',
    label: 'Prescribing Reduction',
    description: 'Reduces new opioid prescriptions by up to 60%',
    color: 'from-blue-500 to-indigo-600',
    costNote: '~$500K per 10%',
  },
  {
    key: 'treatment',
    label: 'Treatment Access',
    description: 'Doubles treatment entry, +30% success rate',
    color: 'from-purple-500 to-pink-600',
    costNote: '~$10K/slot/yr',
  },
]

export default function InterventionSliders({ values, onChange }) {
  return (
    <div className="space-y-5">
      {LEVERS.map(lever => (
        <div key={lever.key}>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-slate-200">{lever.label}</label>
            <span className="text-sm font-mono text-white bg-slate-700 px-2 py-0.5 rounded">
              {Math.round(values[lever.key] * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(values[lever.key] * 100)}
            onChange={e => onChange(lever.key, parseInt(e.target.value) / 100)}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${values[lever.key] * 100}%, #334155 ${values[lever.key] * 100}%, #334155 100%)`,
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-slate-500">{lever.description}</span>
            <span className="text-xs text-slate-600">{lever.costNote}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
