import { useState, useEffect, useRef } from 'react'
import LandingPage from './LandingPage'
import MapPage from './MapPage'
import CounterfactualView from './CounterfactualView'
import MethodologyView from './MethodologyView'

const TABS = [
  { key: 'home', label: 'Overview' },
  { key: 'map',  label: 'Map & Simulator' },
  { key: 'whatif', label: 'What If?' },
  { key: 'methodology', label: 'How It Works' },
]

const THEMES = [
  { key: 'default',  label: 'Ember',          dots: ['#f97316', '#9333ea'] },
  { key: 'ocean',    label: 'Ocean',          dots: ['#06b6d4', '#3b82f6'] },
  { key: 'emerald',  label: 'Emerald',        dots: ['#10b981', '#059669'] },
  { key: 'rose',     label: 'Rose',           dots: ['#f43f5e', '#ec4899'] },
  { key: 'midnight', label: 'Midnight',       dots: ['#6366f1', '#8b5cf6'] },
  { key: 'bw',       label: 'Monochrome',     dots: ['#ffffff', '#555555'] },
]

export default function App() {
  const [page, setPage]           = useState('home')
  const [theme, setTheme]         = useState(() => localStorage.getItem('dd-theme') || 'default')
  const [themeOpen, setThemeOpen] = useState(false)
  const themeRef                  = useRef(null)

  // Sync theme to <html data-theme="..."> so CSS overrides work globally
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('dd-theme', theme)
  }, [theme])

  // Close theme dropdown on outside click
  useEffect(() => {
    const handler = e => { if (themeRef.current && !themeRef.current.contains(e.target)) setThemeOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isBW = theme === 'bw'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: isBW ? '#090909' : '#020617' }}>

      {/* Nav */}
      <header
        className="border-b sticky top-0 z-50 flex-shrink-0 backdrop-blur"
        style={{ borderColor: isBW ? '#1a1a1a' : 'rgba(30,41,59,0.8)', background: isBW ? 'rgba(9,9,9,0.97)' : 'rgba(2,6,23,0.97)' }}
      >
        <div className="max-w-full px-4 py-0 flex items-center h-14 gap-6">

          {/* Logo */}
          <button onClick={() => setPage('home')} className="flex items-center gap-2.5 group flex-shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-sm transition group-hover:scale-105"
              style={{
                background:  isBW ? 'linear-gradient(135deg,#444,#888)' : 'linear-gradient(135deg,#f97316,#7c3aed)',
                boxShadow:   isBW ? '0 0 12px rgba(255,255,255,0.08)' : '0 0 12px rgba(249,115,22,0.3)',
              }}
            >
              DD
            </div>
            <span className="hidden sm:block text-base font-black text-white leading-none">
              Drug<span className="gradient-text">Diffuse</span>
            </span>
          </button>

          {/* Tab nav */}
          <nav className="flex items-center h-full gap-1.5">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setPage(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 press-effect ${
                  page === tab.key
                    ? 'text-white shadow-lg'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
                style={page === tab.key ? {
                  background: isBW ? 'rgba(255,255,255,0.12)' : 'linear-gradient(135deg,rgba(249,115,22,0.25),rgba(124,58,237,0.25))',
                  border: `1px solid ${isBW ? 'rgba(255,255,255,0.15)' : 'rgba(249,115,22,0.35)'}`,
                } : { border: '1px solid transparent' }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-slate-700 hidden lg:block italic">Policy exploration tool — not medical advice</span>

            {/* Theme picker */}
            <div ref={themeRef} className="relative">
              <button
                onClick={() => setThemeOpen(o => !o)}
                title="Change color scheme"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white transition text-xs font-medium"
              >
                <span>🎨</span>
                <span className="hidden sm:inline">Theme</span>
              </button>

              {themeOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-slate-700 shadow-2xl p-1.5 z-50"
                  style={{ background: isBW ? '#111111' : '#0f172a' }}
                >
                  <p className="px-3 py-1.5 text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Color Scheme</p>
                  {THEMES.map(t => (
                    <button
                      key={t.key}
                      onClick={() => { setTheme(t.key); setThemeOpen(false) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                        theme === t.key ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <div className="flex gap-1 flex-shrink-0">
                        {t.dots.map((c, i) => (
                          <div key={i} className="w-3 h-3 rounded-full border border-slate-600" style={{ background: c }} />
                        ))}
                      </div>
                      <span>{t.label}</span>
                      {theme === t.key && <span className="ml-auto text-[11px] text-slate-500">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {page !== 'map' && (
              <button
                onClick={() => setPage('map')}
                className="px-4 py-1.5 rounded-lg text-white text-sm font-semibold transition hover:scale-105"
                style={{
                  background:  isBW ? 'linear-gradient(135deg,#333,#555)' : 'linear-gradient(135deg,#f97316,#7c3aed)',
                  boxShadow:   isBW ? '0 0 12px rgba(255,255,255,0.08)' : '0 0 12px rgba(249,115,22,0.25)',
                }}
              >
                Open Simulator →
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Page */}
      <div className="flex-1 min-h-0">
        <div key={page} className="page-enter">
          {page === 'home'
            ? <LandingPage onNavigate={setPage} theme={theme} />
            : page === 'whatif'
            ? <div className="max-w-7xl mx-auto px-4 py-6"><CounterfactualView /></div>
            : page === 'methodology'
            ? <div className="max-w-7xl mx-auto px-4 py-6"><MethodologyView /></div>
            : <MapPage theme={theme} />
          }
        </div>
      </div>

      {/* Footer */}
      {(page === 'home' || page === 'whatif' || page === 'methodology') && (
        <footer
          className="py-4 text-center text-xs flex-shrink-0"
          style={{ borderTop: `1px solid ${isBW ? '#111' : '#0f172a'}`, color: '#334155' }}
        >
          Morpheus &nbsp;·&nbsp; Catapult Hackathon 2026 &nbsp;·&nbsp; Simplified model for policy exploration only
        </footer>
      )}
    </div>
  )
}
