const LEVERS = [
  {
    key: 'naloxone',
    label: 'Naloxone Access',
    description: 'Distribute overdose-reversal nasal spray (Narcan) to first responders, pharmacies, and community members',
    effect: 'Reduces overdose fatality rate by up to 50%',
    costNote: '~$75/kit',
  },
  {
    key: 'prescribing',
    label: 'Prescribing Reduction',
    description: 'Implement prescription drug monitoring programs (PDMPs), provider education, and prescribing guidelines',
    effect: 'Reduces new opioid prescriptions by up to 60%',
    costNote: '~$500K per 10%',
  },
  {
    key: 'treatment',
    label: 'Treatment Access',
    description: 'Fund medication-assisted treatment (MAT) slots, outpatient programs, and recovery support services',
    effect: 'Doubles treatment entry rate, +30% success rate',
    costNote: '~$10K/slot/yr',
  },
]

export default function InterventionSliders({ values, onChange }) {
  return (
    <div className="space-y-5">
      {LEVERS.map(lever => {
        const pct = `${Math.round(values[lever.key] * 100)}%`
        return (
          <div key={lever.key}>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-slate-200">{lever.label}</label>
              <span className="text-xs font-mono text-orange-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
                {pct}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(values[lever.key] * 100)}
              onChange={e => onChange(lever.key, parseInt(e.target.value) / 100)}
              className="w-full cursor-pointer"
              // --pct drives the track fill in CSS via ::-webkit-slider-runnable-track
              style={{ '--pct': pct }}
            />
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{lever.description}</p>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-cyan-600">{lever.effect}</span>
              <span className="text-[10px] text-slate-600">{lever.costNote}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
