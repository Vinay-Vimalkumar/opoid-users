import React, { useState, useEffect, useRef } from 'react'

export default function AnimatedNumber({ value, duration = 800, prefix = '', suffix = '', className = '' }) {
  const [display, setDisplay] = useState(value)
  const prevValue = useRef(value)
  const animRef = useRef(null)

  useEffect(() => {
    const from = prevValue.current
    const to = value
    prevValue.current = value

    if (from === to) return

    const start = performance.now()
    const animate = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(from + (to - from) * eased)
      setDisplay(current)
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate)
      }
    }
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [value, duration])

  const formatted = typeof display === 'number'
    ? display.toLocaleString()
    : display

  return <span className={className}>{prefix}{formatted}{suffix}</span>
}
