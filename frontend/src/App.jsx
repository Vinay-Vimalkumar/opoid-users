import { useState, useEffect, useRef } from 'react'
import LandingPage from './LandingPage'
import MapPage from './MapPage'
import CounterfactualView from './CounterfactualView'
import MethodologyView from './MethodologyView'
import AssistantPage from './AssistantPage'
import RoadmapView from './RoadmapView'
import RLAgentView from './RLAgentView'

const TABS = [
  { key: 'home',        label: 'Overview' },
  { key: 'map',         label: 'Map & Simulator' },
  { key: 'whatif',      label: 'What If?' },
  { key: 'roadmap',     label: 'Roadmap' },
  { key: 'rlagent',     label: 'RL Agent' },
  { key: 'methodology', label: 'How It Works' },
  { key: 'assistant',   label: 'AI Assistant' },
]

const THEMES = [
  { key: 'default',  label: 'Ember',          dots: ['#f97316', '#9333ea'] },
  { key: 'ocean',    label: 'Ocean',          dots: ['#06b6d4', '#3b82f6'] },
  { key: 'emerald',  label: 'Emerald',        dots: ['#10b981', '#059669'] },
  { key: 'rose',     label: 'Rose',           dots: ['#f43f5e', '#ec4899'] },
  { key: 'midnight', label: 'Midnight',       dots: ['#6366f1', '#8b5cf6'] },
  { key: 'light',    label: 'Light Blue',     dots: ['#2563eb', '#0ea5e9'] },
  { key: 'bw',       label: 'Monochrome',     dots: ['#ffffff', '#555555'] },
]

/* ── Tiny tick sound via Web Audio API ── */
function playTick() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 800
    gain.gain.value = 0.03
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.05)
    setTimeout(() => ctx.close(), 200)
  } catch (_) {}
}

/* ── Keyboard shortcuts overlay ── */
const SHORTCUTS = [
  { keys: '1–7', desc: 'Switch tabs' },
  { keys: 'T', desc: 'Toggle time machine (map)' },
  { keys: 'F', desc: 'Fullscreen' },
  { keys: 'Esc', desc: 'Close modals' },
  { keys: '?', desc: 'Show this overlay' },
]

function ShortcutsOverlay({ open, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative z-10 rounded-2xl border border-slate-700/60 p-6 w-80 shadow-2xl"
        style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">Keyboard Shortcuts</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg">&times;</button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(s => (
            <div key={s.keys} className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage]           = useState('home')
  const [theme, setTheme]         = useState(() => localStorage.getItem('dd-theme') || 'default')
  const [themeOpen, setThemeOpen] = useState(false)
  const [soundOn, setSoundOn]     = useState(() => localStorage.getItem('dd-sound') === 'true')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const themeRef                  = useRef(null)

  // Sound preference
  useEffect(() => { localStorage.setItem('dd-sound', soundOn) }, [soundOn])

  // Tab navigation with optional tick sound
  const navigateTo = (key) => {
    setPage(key)
    if (soundOn) playTick()
  }

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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      // Ignore if typing in input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      const key = e.key
      if (key === '?') { setShortcutsOpen(o => !o); return }
      if (key === 'Escape') { setShortcutsOpen(false); return }
      if (key === 'f' || key === 'F') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
        else document.exitFullscreen?.()
        return
      }
      const tabMap = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6 }
      if (tabMap[key] !== undefined && TABS[tabMap[key]]) {
        navigateTo(TABS[tabMap[key]].key)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn])

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
                onClick={() => navigateTo(tab.key)}
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

            {/* Sound toggle */}
            <button
              onClick={() => { setSoundOn(o => !o); if (!soundOn) playTick() }}
              title={soundOn ? 'Mute UI sounds' : 'Enable UI sounds'}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white transition text-xs"
            >
              {soundOn ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
            </button>

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
            : page === 'roadmap'
            ? <RoadmapView />
            : page === 'rlagent'
            ? <RLAgentView />
            : page === 'methodology'
            ? <div className="max-w-7xl mx-auto px-4 py-6"><MethodologyView /></div>
            : page === 'assistant'
            ? <AssistantPage />
            : <MapPage theme={theme} />
          }
        </div>
      </div>

      {/* Footer */}
      {(page === 'home' || page === 'whatif' || page === 'roadmap' || page === 'rlagent' || page === 'methodology' || page === 'assistant') && (
        <footer
          className="py-4 text-center text-xs flex-shrink-0"
          style={{ borderTop: `1px solid ${isBW ? '#111' : '#0f172a'}`, color: '#334155' }}
        >
          DrugDiffuse &nbsp;·&nbsp; Catapult Hackathon 2026 &nbsp;·&nbsp; Simplified model for policy exploration only
        </footer>
      )}

      {/* Keyboard shortcuts overlay */}
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Floating ? button */}
      <button
        onClick={() => setShortcutsOpen(o => !o)}
        title="Keyboard shortcuts (?)"
        className="fixed bottom-5 right-5 z-[999] w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition shadow-lg"
        style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)' }}
      >
        ?
      </button>
    </div>
  )
}
