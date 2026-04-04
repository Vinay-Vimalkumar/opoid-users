import React from 'react'

function StatCard({ label, value, subtitle, color = 'text-white', bgColor = 'bg-slate-800' }) {
  return (
    <div className={`${bgColor} rounded-xl p-4 border border-slate-700`}>
      <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color} font-mono`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  )
}

export default function LivesCounter({ result, loading }) {
  if (!result) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-slate-800 rounded-xl p-4 border border-slate-700 animate-pulse">
            <div className="h-3 bg-slate-700 rounded w-20 mb-2" />
            <div className="h-8 bg-slate-700 rounded w-16" />
          </div>
        ))}
      </div>
    )
  }

  const costFormatted = result.cost >= 1_000_000
    ? `$${(result.cost / 1_000_000).toFixed(1)}M`
    : `$${(result.cost / 1_000).toFixed(0)}K`

  const costPerLife = result.lives_saved > 0
    ? `$${(result.cost / result.lives_saved / 1000).toFixed(0)}K per life`
    : 'N/A'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="Lives Saved"
        value={result.lives_saved}
        subtitle="over 5 years"
        color="text-green-400"
      />
      <StatCard
        label="Baseline Deaths"
        value={result.baseline_deaths}
        subtitle="without intervention"
        color="text-red-400"
      />
      <StatCard
        label="Deaths w/ Intervention"
        value={result.total_deaths}
        subtitle={`${result.total_overdoses} overdoses total`}
        color="text-amber-400"
      />
      <StatCard
        label="Total Cost"
        value={costFormatted}
        subtitle={costPerLife}
        color="text-blue-400"
      />
    </div>
  )
}
