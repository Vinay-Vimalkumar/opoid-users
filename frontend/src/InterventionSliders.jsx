const LEVERS = [
  {
    key: 'naloxone',
    label: 'Naloxone',
    icon: '💉',
    color: '#f97316',
    description: 'Overdose-reversal kits (Narcan)',
    effect: 'Reduces fatality up to 50%',
    costNote: '$75/kit',
  },
  {
    key: 'prescribing',
    label: 'Prescribing',
    icon: '📋',
    color: '#a78bfa',
    description: 'Prescription monitoring & guidelines',
    effect: 'Cuts new Rx up to 60%',
    costNote: '$500K/10%',
  },
  {
    key: 'treatment',
    label: 'Treatment',
    icon: '🏥',
    color: '#06b6d4',
    description: 'MAT slots & recovery programs',
    effect: '2x entry rate, +30% success',
    costNote: '$10K/slot/yr',
  },
]

export default function InterventionSliders({ values, onChange, compact = false }) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {LEVERS.map(lever => {
        const val = Math.round(values[lever.key] * 100)
        const pct = `${val}%`
        return (
          <div key={lever.key}>
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-1.5">
                {!compact && <span className="text-sm">{lever.icon}</span>}
                <label className={`font-semibold text-slate-200 ${compact ? 'text-xs' : 'text-sm'}`}>
                  {lever.label}
                </label>
              </div>
              <span
                className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                style={{
                  color: lever.color,
                  background: `${lever.color}15`,
                  border: `1px solid ${lever.color}30`,
                }}
              >
                {pct}
              </span>
            </div>
            <div className="relative">
              <input
                type="range"
                min="0"
                max="100"
                value={val}
                onChange={e => onChange(lever.key, parseInt(e.target.value) / 100)}
                className="w-full cursor-pointer"
                style={{ '--pct': pct }}
              />
            </div>
            {!compact && (
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-slate-500">{lever.effect}</span>
                <span className="text-[10px] text-slate-600">{lever.costNote}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
