import React, { useState, useEffect } from 'react'

const API = '/api'
const LEVELS = [0, 0.25, 0.5, 0.75, 1.0]

function getHeatColor(value, max) {
  const ratio = max > 0 ? value / max : 0
  if (ratio < 0.2) return '#1e293b'
  if (ratio < 0.4) return '#164e63'
  if (ratio < 0.6) return '#0e7490'
  if (ratio < 0.8) return '#0891b2'
  return '#22d3ee'
}

export default function SensitivityHeatmap({ county }) {
  const [data, setData] = useState(null)
  const [fixedLever, setFixedLever] = useState('naloxone')
  const [fixedValue, setFixedValue] = useState(0.5)
  const [loading, setLoading] = useState(false)

  const otherLevers = ['naloxone', 'prescribing', 'treatment'].filter(l => l !== fixedLever)

  useEffect(() => {
    let cancelled = false
    async function compute() {
      setLoading(true)
      const grid = []
      const requests = []

      for (const xVal of LEVELS) {
        for (const yVal of LEVELS) {
          const params = { county, months: 60, seed: 42 }
          params[fixedLever] = fixedValue
          params[otherLevers[0]] = xVal
          params[otherLevers[1]] = yVal
          requests.push(
            fetch(`${API}/simulate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(params),
            }).then(r => r.json()).then(d => ({
              x: xVal,
              y: yVal,
              lives_saved: d.lives_saved,
              cost: d.cost,
            }))
          )
        }
      }

      try {
        const results = await Promise.all(requests)
        if (!cancelled) setData(results)
      } catch (e) {
        console.error(e)
      }
      if (!cancelled) setLoading(false)
    }
    compute()
    return () => { cancelled = true }
  }, [county, fixedLever, fixedValue])

  const maxLives = data ? Math.max(...data.map(d => d.lives_saved)) : 0

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h2 className="text-sm font-semibold text-slate-300 mb-1">Sensitivity Analysis</h2>
      <p className="text-xs text-slate-500 mb-3">How do two levers interact? Fix one, vary the other two.</p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Fixed lever:</span>
          {['naloxone', 'prescribing', 'treatment'].map(l => (
            <button key={l} onClick={() => setFixedLever(l)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition capitalize ${
                fixedLever === l ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">at:</span>
          <input type="range" min="0" max="100" value={fixedValue * 100}
            onChange={e => setFixedValue(parseInt(e.target.value) / 100)}
            className="w-24 h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-xs font-mono text-slate-300">{Math.round(fixedValue * 100)}%</span>
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Computing 25 scenarios...</div>
      ) : data ? (
        <div>
          {/* Grid */}
          <div className="flex items-end gap-1">
            {/* Y-axis label */}
            <div className="flex flex-col items-end mr-1" style={{ width: 60 }}>
              <span className="text-[10px] text-slate-400 capitalize mb-1">{otherLevers[1]}</span>
              {[...LEVELS].reverse().map(y => (
                <div key={y} className="h-10 flex items-center">
                  <span className="text-[10px] font-mono text-slate-500">{Math.round(y * 100)}%</span>
                </div>
              ))}
            </div>
            <div>
              {/* Heatmap grid */}
              <div className="flex flex-col">
                {[...LEVELS].reverse().map(y => (
                  <div key={y} className="flex gap-0.5 mb-0.5">
                    {LEVELS.map(x => {
                      const cell = data.find(d => d.x === x && d.y === y)
                      const lives = cell?.lives_saved ?? 0
                      return (
                        <div
                          key={`${x}-${y}`}
                          className="w-14 h-10 rounded flex items-center justify-center text-[10px] font-mono transition-colors duration-300 cursor-default"
                          style={{ backgroundColor: getHeatColor(lives, maxLives) }}
                          title={`${otherLevers[0]}=${Math.round(x*100)}%, ${otherLevers[1]}=${Math.round(y*100)}%: ${lives} lives saved`}
                        >
                          <span className={lives > maxLives * 0.5 ? 'text-slate-900 font-bold' : 'text-slate-300'}>
                            {lives}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              {/* X-axis */}
              <div className="flex gap-0.5 mt-1">
                {LEVELS.map(x => (
                  <div key={x} className="w-14 text-center text-[10px] font-mono text-slate-500">{Math.round(x * 100)}%</div>
                ))}
              </div>
              <div className="text-center text-[10px] text-slate-400 mt-1 capitalize">{otherLevers[0]}</div>
            </div>

            {/* Color legend */}
            <div className="ml-3 flex flex-col items-center">
              <span className="text-[10px] text-slate-500 mb-1">Lives saved</span>
              <div className="flex flex-col gap-0.5">
                {['#22d3ee', '#0891b2', '#0e7490', '#164e63', '#1e293b'].map((c, i) => (
                  <div key={i} className="w-4 h-4 rounded" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className="text-[9px] text-slate-600 mt-1">high</span>
              <span className="text-[9px] text-slate-600">low</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
