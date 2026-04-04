import React from 'react'

// Indiana county approximate positions (normalized to grid)
const COUNTY_POSITIONS = {
  "Marion": { x: 52, y: 52 },
  "Lake": { x: 20, y: 8 },
  "Allen": { x: 85, y: 22 },
  "St. Joseph": { x: 38, y: 8 },
  "Vanderburgh": { x: 22, y: 90 },
  "Tippecanoe": { x: 38, y: 35 },
  "Delaware": { x: 70, y: 42 },
  "Wayne": { x: 88, y: 48 },
  "Vigo": { x: 18, y: 58 },
  "Madison": { x: 62, y: 42 },
  "Clark": { x: 62, y: 92 },
  "Floyd": { x: 58, y: 95 },
  "Scott": { x: 58, y: 85 },
  "Lawrence": { x: 42, y: 72 },
  "Fayette": { x: 78, y: 55 },
  "Jay": { x: 90, y: 32 },
  "Blackford": { x: 78, y: 35 },
  "Vermillion": { x: 12, y: 48 },
  "Henry": { x: 75, y: 48 },
  "Grant": { x: 70, y: 32 },
}

function getColor(population) {
  if (population > 500000) return '#ef4444'
  if (population > 200000) return '#f97316'
  if (population > 100000) return '#eab308'
  if (population > 50000) return '#22c55e'
  return '#3b82f6'
}

export default function CountyMap({ counties, selected, onSelect }) {
  return (
    <div className="relative w-full" style={{ paddingBottom: '120%' }}>
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full"
      >
        {/* Indiana outline (simplified) */}
        <path
          d="M 5 2 L 95 2 L 95 98 L 55 98 L 50 92 L 45 98 L 5 98 Z"
          fill="none"
          stroke="#334155"
          strokeWidth="0.5"
        />

        {counties.map(county => {
          const pos = COUNTY_POSITIONS[county.name]
          if (!pos) return null
          const isSelected = county.name === selected
          const radius = Math.max(2.5, Math.min(6, Math.sqrt(county.population / 50000)))

          return (
            <g key={county.name} onClick={() => onSelect(county.name)} className="cursor-pointer">
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius + (isSelected ? 1.5 : 0)}
                fill={isSelected ? '#8b5cf6' : getColor(county.population)}
                opacity={isSelected ? 1 : 0.7}
                stroke={isSelected ? '#c4b5fd' : 'transparent'}
                strokeWidth={isSelected ? 1 : 0}
                className="transition-all duration-200 hover:opacity-100"
              />
              <text
                x={pos.x}
                y={pos.y + radius + 3.5}
                textAnchor="middle"
                fill={isSelected ? '#e2e8f0' : '#94a3b8'}
                fontSize="2.5"
                fontWeight={isSelected ? 'bold' : 'normal'}
              >
                {county.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-1 left-1 flex gap-2 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> 500K+</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> 200K+</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> 100K+</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 50K+</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> &lt;50K</span>
      </div>
    </div>
  )
}
