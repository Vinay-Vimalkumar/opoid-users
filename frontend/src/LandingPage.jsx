import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const API = '/api'

const STATS = [
  { value: '80,000+', label: 'Americans die from opioids yearly',      color: '#ef4444', num: 80000, suffix: '+' },
  { value: '2,500+',  label: 'Indiana residents lost every year',    color: '#f97316', num: 2500, suffix: '+' },
  { value: '5,146',   label: 'Lives saveable if Indiana acted in 2016', color: '#22c55e', num: 5146, suffix: '' },
  { value: '$2M',     label: 'Avg county intervention budget',          color: '#a855f7', num: 2, suffix: 'M', prefix: '$' },
]

const STEPS = [
  { step: '01', color: '#f97316', title: 'Select a County',  desc: 'Choose from 20 Indiana counties — each calibrated to 19 years of CDC mortality data, overdose rates, and socioeconomic context.' },
  { step: '02', color: '#9333ea', title: 'Tune the Levers',  desc: 'Adjust naloxone access, prescribing reduction, and treatment capacity. Outcomes update in real time via our epidemiological model.' },
  { step: '03', color: '#22c55e', title: 'Get the Playbook', desc: 'Our XGBoost model — trained on 12,500 simulations — returns the optimal intervention bundle for your county and budget.' },
]

const FEATURES = [
  { icon: '🧠', color: '#f97316', title: 'ML-Powered Optimization',  desc: 'XGBoost trained on 12,500 simulations finds the highest-impact strategy for any county and budget.' },
  { icon: '💬', color: '#9333ea', title: 'AI Policy Assistant',       desc: 'Ask in plain English — "I have $2M for Marion County" — and get a data-backed recommendation instantly.' },
  { icon: '📊', color: '#ec4899', title: '5-Year Projections',         desc: 'Compartmental SIR model tracks OUD, overdoses, treatment rates, and cumulative deaths over 60 months.' },
  { icon: '🗺️', color: '#f97316', title: 'County-Level Granularity',  desc: 'Urban Marion and rural Jay County have very different dynamics. Our calibrated model accounts for all of it.' },
  { icon: '⏱️', color: '#9333ea', title: 'Real-Time Simulation',       desc: 'Every slider triggers a new simulation instantly — no batch delays, no waiting.' },
  { icon: '💰', color: '#22c55e', title: 'Cost-Effectiveness',         desc: 'Every scenario shows cost per life saved, helping policymakers stretch limited public health dollars further.' },
]

const TECH_BADGES = [
  'CDC Mortality Data (2003–2021)',
  'Calibrated SIR Model (R²=0.71)',
  'XGBoost · 12,500 simulations',
  'Counterfactual Analysis',
  'LSTM Forecasting',
  'Gradient Portfolio Optimizer',
]

function riskColor(norm) {
  if (norm > 0.75) return '#ef4444'
  if (norm > 0.5)  return '#f97316'
  if (norm > 0.25) return '#eab308'
  return '#22c55e'
}

/* ── Animated counter ── */
function useCountUp(target, duration = 1800) {
  const [val, setVal] = useState(0)
  const ref = useRef(false)
  useEffect(() => {
    if (ref.current) return
    ref.current = true
    const start = performance.now()
    const num = parseInt(String(target).replace(/\D/g, ''))
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(ease * num))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return val
}

/* ── Grid background ── */
function GridBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(248,250,252,0.04) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }} />
      {/* Ambient glows */}
      <div style={{ position:'absolute', left:'10%',  top:'15%', width:600, height:600, borderRadius:'50%', background:'rgba(249,115,22,0.05)', filter:'blur(100px)' }} />
      <div style={{ position:'absolute', right:'5%',  top:'35%', width:500, height:500, borderRadius:'50%', background:'rgba(147,51,234,0.06)', filter:'blur(90px)' }} />
      <div style={{ position:'absolute', left:'35%',  bottom:'5%', width:400, height:400, borderRadius:'50%', background:'rgba(236,72,153,0.04)', filter:'blur(80px)' }} />
    </div>
  )
}

/* ── Scroll reveal ── */
function useScrollReveal(deps = []) {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.08 }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/* ── Particle constellation background ── */
function ParticleBackground() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId
    const particles = []
    const COUNT = 30
    const SPEED = 0.3
    const CONNECT_DIST = 120

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * SPEED,
        vy: (Math.random() - 0.5) * SPEED,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < COUNT; i++) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(249,115,22,0.15)'
        ctx.fill()
        for (let j = i + 1; j < COUNT; j++) {
          const q = particles[j]
          const dx = p.x - q.x, dy = p.y - q.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECT_DIST) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.strokeStyle = `rgba(249,115,22,${0.05 * (1 - dist / CONNECT_DIST)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} />
}

/* ── Animated stat number (triggers on scroll) ── */
function AnimatedStatNumber({ num, prefix = '', suffix = '', color, comma = true }) {
  const ref = useRef(null)
  const [display, setDisplay] = useState(0)
  const triggered = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !triggered.current) {
        triggered.current = true
        const start = performance.now()
        const duration = 2000
        const tick = (now) => {
          const p = Math.min((now - start) / duration, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          setDisplay(num < 10 ? parseFloat((ease * num).toFixed(1)) : Math.round(ease * num))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [num])

  const formatted = comma && num >= 100 ? display.toLocaleString() : display
  return <span ref={ref} style={{ color }}>{prefix}{formatted}{suffix}</span>
}

export default function LandingPage({ onNavigate, theme = 'default' }) {
  const isBW = theme === 'bw'
  const [counties, setCounties] = useState([])
  const lives = useCountUp(5146)

  useScrollReveal([counties])

  useEffect(() => {
    fetch(`${API}/counties`).then(r => r.json()).then(setCounties).catch(() => {})
  }, [])

  const maxPop  = counties.length ? Math.max(...counties.map(c => c.population)) : 1
  const top5    = [...counties].sort((a, b) => b.population - a.population).slice(0, 5)
  const bottom5 = [...counties].sort((a, b) => a.population - b.population).slice(0, 5)

  return (
    <div className="min-h-screen relative" style={{ background: isBW ? '#090909' : '#020617' }}>
      <GridBackground />

      {/* ── Hero ── */}
      <section className="relative z-10 overflow-hidden px-4 pt-28 pb-24 text-center">
        {/* Background image */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: 'url(/redpillbluepill.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 40%',
            opacity: 0.35,
            filter: 'blur(1px)',
          }}
        />
        <div className="absolute inset-0 z-0" style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, #020617 75%)',
        }} />
        <ParticleBackground />
        <div className="relative z-10 max-w-4xl mx-auto">

          <div
            className="reveal inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-8"
            style={{
              border:     `1px solid ${isBW ? 'rgba(60,60,60,0.6)' : 'rgba(249,115,22,0.4)'}`,
              background: isBW ? 'rgba(20,20,20,0.4)' : 'rgba(249,115,22,0.08)',
              color:      isBW ? '#aaaaaa' : '#fb923c',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: isBW ? '#888' : '#fb923c' }} />
            Catapult Hackathon 2026 · Indiana
          </div>

          <h1 className="reveal reveal-d1 text-6xl sm:text-8xl font-black tracking-tight text-white mb-5 leading-none">
            Mor<span className="gradient-text">pheus</span>
          </h1>

          <p className="reveal reveal-d2 text-2xl text-slate-300 font-semibold mb-4 leading-snug">
            Indiana loses 2,500 people to opioids every year.<br />
            <span style={{ color: isBW ? '#ccc' : '#fb923c' }}>We built the tool to stop it.</span>
          </p>

          <p className="reveal reveal-d3 text-slate-500 text-base max-w-2xl mx-auto mb-10 leading-relaxed">
            Run policy simulations across 20 Indiana counties. Find the interventions that save the most lives per dollar — backed by 19 years of CDC data and machine learning.
          </p>

          {/* Impact callout */}
          <div
            className="reveal reveal-d3 inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl mb-10"
            style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.2)',
            }}
          >
            <span className="text-5xl font-black font-mono" style={{ color: '#22c55e' }}>
              {lives.toLocaleString()}
            </span>
            <span className="text-sm text-slate-400">lives saveable if Indiana had acted in 2016</span>
          </div>

          <div className="reveal reveal-d4 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="cta-border-wrap">
              <button
                onClick={() => onNavigate('map')}
                className="cta-border-inner px-10 py-3.5 text-white font-bold text-base transition hover:brightness-110"
              >
                Open Simulator →
              </button>
            </div>
            <a
              href="#insights"
              className="px-8 py-3.5 rounded-xl text-slate-400 font-semibold border border-slate-800 hover:border-slate-600 hover:text-white transition"
            >
              See the data ↓
            </a>
          </div>
        </div>
      </section>

      {/* ── Tech credibility strip ── */}
      <div className="relative z-10 border-y border-slate-800/60 bg-slate-900/20 backdrop-blur py-4 overflow-hidden">
        <div className="flex gap-6 animate-[ticker_20s_linear_infinite] whitespace-nowrap">
          {[...TECH_BADGES, ...TECH_BADGES].map((b, i) => (
            <span key={i} className="inline-flex items-center gap-2 text-xs text-slate-500 font-mono flex-shrink-0">
              <span className="w-1 h-1 rounded-full bg-orange-500/60" />
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* ── Stats bar ── */}
      <section className="relative z-10 border-b border-slate-800/80 bg-slate-900/30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-14 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map((s, i) => (
            <div key={i} className="reveal" style={{ transitionDelay: `${i * 0.1}s` }}>
              <p className="text-4xl sm:text-5xl font-black mb-2">
                <AnimatedStatNumber num={s.num} prefix={s.prefix || ''} suffix={s.suffix} color={s.color} comma={s.num >= 100} />
              </p>
              <p className="text-xs text-slate-500 leading-snug max-w-[140px] mx-auto">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problem / Solution ── */}
      <section className="relative z-10 py-24 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="reveal">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-3">The Problem</p>
            <h2 className="text-3xl font-black text-white mb-5 leading-tight">
              Policymakers are flying blind during a crisis
            </h2>
            <p className="text-slate-400 leading-relaxed mb-4">
              Indiana has one of the highest overdose death rates in the Midwest. County health departments are handed limited budgets and asked to make life-or-death decisions with little more than gut instinct and outdated annual reports.
            </p>
            <p className="text-slate-400 leading-relaxed">
              Morpheus changes that. We built an epidemiological simulation engine and an ML optimization layer that finds the intervention mix that saves the most lives per dollar.
            </p>
          </div>
          <div className="reveal reveal-d2 space-y-4">
            {[
              { label: 'Overdose deaths preventable with naloxone', pct: 47, color: '#22c55e' },
              { label: 'OUD cases that never reach treatment',       pct: 80, color: '#ef4444' },
              { label: 'Cost saved with optimized intervention mix', pct: 34, color: '#f97316' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl p-4 border border-slate-800" style={{ background: 'rgba(15,23,42,0.6)' }}>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-slate-400">{item.label}</span>
                  <span className="text-sm font-black text-white font-mono">{item.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${item.pct}%`, background: item.color, boxShadow: `0 0 8px ${item.color}80` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scott County Story ── */}
      <section className="relative z-10 border-t border-slate-800/60 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="reveal rounded-2xl border relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(249,115,22,0.06))',
            borderColor: 'rgba(239,68,68,0.2)',
          }}>
            <div className="p-8 md:p-10">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.25)',
                }}>
                  <span className="text-2xl" style={{ filter: 'none' }}>&#8986;</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-2">Case Study</p>
                  <h3 className="text-2xl font-black text-white mb-3 leading-tight">
                    Scott County, 2015: <span className="text-red-400">215 HIV cases</span> in a town of 4,000
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed mb-4 max-w-2xl">
                    The opioid-fueled HIV outbreak in Scott County was one of the worst in U.S. history.
                    Our model shows that if naloxone and treatment had been deployed just two years earlier,{' '}
                    <span className="text-green-400 font-semibold">47% of overdose deaths could have been prevented</span>.
                  </p>
                  <div className="flex flex-wrap gap-6 mb-5">
                    <div>
                      <p className="text-3xl font-black font-mono text-red-400">188</p>
                      <p className="text-xs text-slate-500">actual deaths</p>
                    </div>
                    <div>
                      <p className="text-3xl font-black font-mono text-green-400">100</p>
                      <p className="text-xs text-slate-500">with intervention</p>
                    </div>
                    <div>
                      <p className="text-3xl font-black font-mono text-yellow-400">47%</p>
                      <p className="text-xs text-slate-500">reduction</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate('timemachine')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition hover:brightness-110"
                    style={{
                      background: 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: '#fca5a5',
                    }}
                  >
                    Open Time Machine
                    <span className="text-xs">&#8594;</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="relative z-10 border-t border-slate-800/60 bg-slate-900/20 py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="reveal text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-3">How It Works</p>
            <h2 className="text-3xl font-black text-white">Three steps to a data-driven policy</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <div
                key={s.step}
                className={`reveal reveal-d${i+1} rounded-2xl p-7 border border-slate-800 card-hover relative overflow-hidden backdrop-blur`}
                style={{ background: 'rgba(15,23,42,0.7)' }}
              >
                <div className="absolute top-0 right-0 text-8xl font-black opacity-[0.04] leading-none select-none" style={{ color: s.color }}>{s.step}</div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black font-mono mb-5"
                  style={{ background: `${s.color}18`, border: `1px solid ${s.color}40`, color: s.color }}
                >
                  {s.step}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── County Data ── */}
      {counties.length > 0 && (
        <section id="insights" className="relative z-10 border-t border-slate-800/60 py-24 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="reveal mb-12">
              <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">County Insights</p>
              <h2 className="text-3xl font-black text-white">Indiana County Overview</h2>
              <p className="text-slate-500 mt-2 text-sm">Population-weighted OUD burden across all 20 modeled counties.</p>
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="reveal lg:col-span-2 rounded-2xl p-6 border border-slate-800 backdrop-blur" style={{ background: 'rgba(15,23,42,0.7)' }}>
                <p className="text-sm font-semibold text-slate-300 mb-5">Population by County (proxy for OUD burden)</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={[...counties].sort((a,b) => b.population - a.population)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#475569" fontSize={10} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : `${(v/1e3).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="name" stroke="#475569" fontSize={10} width={80} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12, color: '#fff' }} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#fff' }} formatter={v => [v.toLocaleString(), 'Population']} />
                    <Bar dataKey="population" radius={[0, 4, 4, 0]}>
                      {[...counties].sort((a,b) => b.population - a.population).map((c, i) => (
                        <Cell key={i} fill={riskColor(c.population / maxPop)} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="reveal reveal-d1 space-y-4">
                <div className="rounded-2xl p-5 border border-red-900/30 backdrop-blur" style={{ background: 'rgba(15,23,42,0.7)' }}>
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-3">Highest Burden</p>
                  <div className="space-y-2.5">
                    {top5.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 w-4 font-mono">{i+1}</span>
                          <span className="text-sm text-slate-300">{c.name}</span>
                        </div>
                        <span className="text-xs font-mono text-red-400">{(c.population/1000).toFixed(0)}K</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl p-5 border border-green-900/30 backdrop-blur" style={{ background: 'rgba(15,23,42,0.7)' }}>
                  <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-3">Lower Burden</p>
                  <div className="space-y-2.5">
                    {bottom5.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 w-4 font-mono">{i+1}</span>
                          <span className="text-sm text-slate-300">{c.name}</span>
                        </div>
                        <span className="text-xs font-mono text-green-400">{(c.population/1000).toFixed(0)}K</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Features ── */}
      <section className="relative z-10 border-t border-slate-800/60 bg-slate-900/20 py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="reveal text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-400 mb-3">Features</p>
            <h2 className="text-3xl font-black text-white">Built for real decisions</h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {FEATURES.map((b, i) => (
              <div
                key={i}
                className={`reveal reveal-d${(i % 3) + 1} rounded-2xl p-6 border border-slate-800 card-hover backdrop-blur`}
                style={{ background: 'rgba(15,23,42,0.7)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-4"
                  style={{ background: `${b.color}18`, border: `1px solid ${b.color}30` }}
                >
                  {b.icon}
                </div>
                <h3 className="text-base font-bold text-white mb-2">{b.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 py-28 px-4 text-center">
        <div className="reveal max-w-xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 mb-4">Ready?</p>
          <h2 className="text-5xl font-black text-white mb-4 leading-tight">
            Find the policy that<br />
            <span className="gradient-text">saves the most lives.</span>
          </h2>
          <p className="text-slate-500 mb-10 text-base">Pick a county, set your budget, run the simulation.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="cta-border-wrap">
              <button
                onClick={() => onNavigate('map')}
                className="cta-border-inner px-12 py-4 text-white font-bold text-lg transition hover:brightness-110"
              >
                Open Simulator →
              </button>
            </div>
            <button
              onClick={() => onNavigate('whatif')}
              className="px-8 py-4 rounded-xl text-slate-400 font-semibold border border-slate-800 hover:border-slate-600 hover:text-white transition text-base"
            >
              See the "What If?" analysis
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
