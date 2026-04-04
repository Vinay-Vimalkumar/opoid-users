import React, { useState, useEffect } from 'react'

const API = '/api'

export default function CountySelector({ selected, onChange }) {
  const [counties, setCounties] = useState([])

  useEffect(() => {
    fetch(`${API}/counties`)
      .then(r => r.json())
      .then(setCounties)
      .catch(() => {})
  }, [])

  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs text-slate-400">County:</span>
      <select
        value={selected}
        onChange={e => onChange(e.target.value)}
        className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
      >
        {counties.map(c => (
          <option key={c.name} value={c.name}>{c.name} ({(c.population / 1000).toFixed(0)}K)</option>
        ))}
      </select>
    </div>
  )
}
