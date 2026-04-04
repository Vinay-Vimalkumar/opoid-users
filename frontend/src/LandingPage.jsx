import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const API = '/api'

const GLOBAL_STATS = [
  { value: '15,000+', label: 'Hoosiers have died from overdoses since 1999',        color: '#ef4444' },
  { value: '3 of 5',  label: 'overdose deaths in Indiana involve opioids',           color: '#f97316' },
  { value: '57,500',  label: 'Indiana K–12 students with a parent with OUD',         color: '#a855f7' },
  { value: '5/day',   label: 'overdose deaths per day at Indiana\'s peak',           color: '#22c55e' },
]

const HOW_IT_WORKS = [
  {
    step: '01', color: '#f97316',
    title: 'Select a County',
    description: 'Choose from 20 Indiana counties — each loaded with real population data, overdose rates, and socioeconomic context.',
  },
  {
    step: '02', color: '#9333ea',
    title: 'Tune the Levers',
    description: 'Adjust naloxone access, prescribing reduction, and treatment capacity. See projected outcomes update in real time.',
  },
  {
    step: '03', color: '#22c55e',
    title: 'Get the Playbook',
    description: 'Our ML model — trained on 12,500 simulations — returns the optimal intervention bundle for your county and budget.',
  },
]

const BENEFITS = [
  { icon: '🧠', title: 'ML-Powered Optimization',   desc: 'XGBoost trained on thousands of simulations finds the highest-impact strategy for any county and budget.', color: '#f97316' },
  { icon: '💬', title: 'AI Policy Assistant',        desc: 'Ask in plain English — "I have $2M for Marion County" — and get a data-backed recommendation instantly.',  color: '#9333ea' },
  { icon: '📊', title: '5-Year Projections',          desc: 'Compartmental epidemiological model tracks OUD, overdoses, treatment rates, and cumulative deaths over time.', color: '#ec4899' },
  { icon: '🗺️', title: 'County-Level Granularity',   desc: 'Urban Marion County and rural Jay County have very different dynamics. Our model accounts for that.',        color: '#f97316' },
  { icon: '⚡', title: 'Real-Time Simulation',        desc: 'Every slider adjustment triggers a simulation instantly — immediate feedback, no batch delays.',              color: '#9333ea' },
  { icon: '💰', title: 'Cost-Effectiveness',          desc: 'Every scenario shows cost per life saved, helping policymakers stretch limited public health dollars.',        color: '#22c55e' },
]

function riskColor(norm) {
  if (norm > 0.75) return '#ef4444'
  if (norm > 0.5)  return '#f97316'
  if (norm > 0.25) return '#eab308'
  return '#22c55e'
}


/* ── Floating medical background ── */
const BG_PILLS = [
  { left: '8%',  top: '12%', delay: '0s',   dur: '9s',  rot: '-15deg',  rot2: '-7deg'  },
  { left: '78%', top: '8%',  delay: '-4s',  dur: '11s', rot: '30deg',   rot2: '38deg'  },
  { left: '55%', top: '35%', delay: '-2s',  dur: '8s',  rot: '-5deg',   rot2: '3deg'   },
  { left: '20%', top: '65%', delay: '-6s',  dur: '13s', rot: '45deg',   rot2: '53deg'  },
  { left: '88%', top: '55%', delay: '-1.5s',dur: '10s', rot: '-30deg',  rot2: '-22deg' },
  { left: '40%', top: '80%', delay: '-3s',  dur: '12s', rot: '10deg',   rot2: '18deg'  },
  { left: '65%', top: '70%', delay: '-5s',  dur: '9s',  rot: '-50deg',  rot2: '-42deg' },
  { left: '12%', top: '42%', delay: '-7s',  dur: '14s', rot: '20deg',   rot2: '28deg'  },
]

const BG_CROSSES = [
  { left: '33%', top: '18%', delay: '-2s',  dur: '10s' },
  { left: '70%', top: '42%', delay: '-5s',  dur: '13s' },
  { left: '15%', top: '78%', delay: '-1s',  dur: '9s'  },
  { left: '85%', top: '25%', delay: '-3.5s',dur: '11s' },
  { left: '48%', top: '60%', delay: '-6s',  dur: '15s' },
  { left: '92%', top: '75%', delay: '-4s',  dur: '8s'  },
]

const BG_RINGS = [
  { left: '25%', top: '30%', size: 40, delay: '-1s',  dur: '12s' },
  { left: '60%', top: '15%', size: 28, delay: '-4s',  dur: '16s' },
  { left: '82%', top: '65%', size: 50, delay: '-2s',  dur: '11s' },
  { left: '10%', top: '55%', size: 34, delay: '-6s',  dur: '14s' },
  { left: '45%', top: '88%', size: 22, delay: '-3s',  dur: '9s'  },
]

function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      {/* Ambient glow blobs */}
      <div style={{ position:'absolute', left:'15%',  top:'20%', width:500, height:500, borderRadius:'50%', background:'rgba(249,115,22,0.04)', filter:'blur(80px)' }} />
      <div style={{ position:'absolute', right:'10%', top:'40%', width:400, height:400, borderRadius:'50%', background:'rgba(147,51,234,0.05)', filter:'blur(80px)' }} />
      <div style={{ position:'absolute', left:'40%', bottom:'10%', width:350, height:350, borderRadius:'50%', background:'rgba(236,72,153,0.03)', filter:'blur(70px)' }} />

      {/* Pill shapes */}
      {BG_PILLS.map((p, i) => (
        <div
          key={i}
          className="bg-pill"
          style={{
            left: p.left, top: p.top,
            animationDelay: p.delay,
            '--dur': p.dur,
            '--r':  p.rot,
            '--r2': p.rot2,
          }}
        />
      ))}

      {/* Medical cross shapes */}
      {BG_CROSSES.map((c, i) => (
        <div
          key={i}
          className="bg-cross"
          style={{ left: c.left, top: c.top, animationDelay: c.delay, '--dur': c.dur }}
        />
      ))}

      {/* Dot rings (molecular) */}
      {BG_RINGS.map((r, i) => (
        <div
          key={i}
          className="bg-dot-ring"
          style={{
            left: r.left, top: r.top,
            width: r.size, height: r.size,
            animationDelay: r.delay,
            '--dur': r.dur,
          }}
        />
      ))}
    </div>
  )
}

/* ── Scroll reveal hook ── */
// Re-runs when `deps` changes so dynamically rendered elements (e.g. after API load) get observed
function useScrollReveal(deps = []) {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible')
        // no unobserve — newly rendered elements need continuous checking
      }),
      { threshold: 0.08 }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export default function LandingPage({ onNavigate, theme = 'default' }) {
  const isBW = theme === 'bw'
  const [counties, setCounties] = useState([])

  useScrollReveal([counties])

  useEffect(() => {
    fetch(`${API}/counties`).then(r => r.json()).then(setCounties).catch(() => {})
  }, [])

  const maxPop = counties.length ? Math.max(...counties.map(c => c.population)) : 1
  const top5    = [...counties].sort((a, b) => b.population - a.population).slice(0, 5)
  const bottom5 = [...counties].sort((a, b) => a.population - b.population).slice(0, 5)

  return (
    <div className="min-h-screen relative" style={{ background: isBW ? '#090909' : '#020617' }}>
      <AnimatedBackground />

      {/* ── Hero ── */}
      <section className="relative z-10 overflow-hidden px-4 pt-24 pb-20 text-center">
        <div className="relative max-w-4xl mx-auto">

          <div
            className="reveal inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-8"
            style={{
              border:     `1px solid ${isBW ? 'rgba(60,60,60,0.6)' : 'rgba(154,52,18,0.6)'}`,
              background: isBW ? 'rgba(20,20,20,0.4)' : 'rgba(67,20,7,0.3)',
              color:      isBW ? '#aaaaaa' : '#fb923c',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: isBW ? '#888' : '#fb923c' }} />
            Catapult Hackathon 2026 · Indiana
          </div>

          <h1 className="reveal reveal-d1 text-5xl sm:text-7xl font-black tracking-tight text-white mb-4 leading-none">
            Drug<span className="gradient-text">Diffuse</span>
          </h1>

          <p className="reveal reveal-d2 text-xl text-slate-300 font-medium mb-3">
            Indiana's Opioid Policy Simulator
          </p>

          <p className="reveal reveal-d3 text-slate-500 text-base max-w-2xl mx-auto mb-12 leading-relaxed">
            Since 1999, 15,000+ Hoosiers have died from overdoses —
            with 57,500 Indiana children living in the shadow of parental addiction right now.
            Run policy scenarios across 20 Indiana counties and find the interventions that save the most lives per dollar.
          </p>

          <div className="reveal reveal-d4 flex flex-col sm:flex-row gap-4 justify-center items-center">
            {/* Animated tracing border CTA */}
            <div className="cta-border-wrap">
              <button
                onClick={() => onNavigate('map')}
                className="cta-border-inner px-9 py-3.5 text-white font-bold text-base transition hover:brightness-110"
              >
                Open Map &amp; Simulator →
              </button>
            </div>

            <a
              href="#insights"
              className="px-8 py-3.5 rounded-xl text-slate-300 font-semibold border border-slate-700 hover:border-orange-700/50 hover:text-white transition"
            >
              View Insights ↓
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="relative z-10 border-y border-slate-800/80 bg-slate-900/30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {GLOBAL_STATS.map((s, i) => (
            <div key={i} className="reveal" style={{ transitionDelay: `${i * 0.1}s` }}>
              <p className="text-3xl sm:text-4xl font-black mb-1" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500 leading-snug">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why / Problem ── */}
      <section className="relative z-10 border-t border-slate-800 bg-slate-900/20 py-20 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-14 items-center">
          <div className="reveal">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-3">The Problem</p>
            <h2 className="text-3xl font-black text-white mb-5 leading-tight">
              An intergenerational crisis — and policymakers are flying blind
            </h2>
            <p className="text-slate-400 leading-relaxed mb-4">
              Since 1999, over 15,000 Hoosiers have died from overdoses — roughly 5 per day at the peak. Fifty-eight Indiana counties recorded nearly 100 opioid prescriptions per 100 residents for multiple years running, indicating systemic overprescribing, not isolated incidents.
            </p>
            <p className="text-slate-400 leading-relaxed">
              The damage doesn't stop there. Approximately 2.2 million children nationwide — including 57,500 Indiana K–12 students — have a parent with opioid use disorder, making them significantly more likely to experience trauma, foster care, and future addiction. The crisis is self-perpetuating without targeted, data-driven intervention.
            </p>
          </div>
          <div className="reveal reveal-d2 space-y-4">
            {[
              { label: 'Indiana overdose deaths that involve opioids',     pct: 60, color: '#ef4444' },
              { label: 'OUD cases estimated to never reach treatment',     pct: 80, color: '#f97316' },
              { label: 'K–12 students impacted by parental OUD statewide', pct: 57, note: '57,500 students', color: '#a855f7' },
            ].map((item, i) => (
              <div key={i} className="bg-slate-900/80 rounded-xl p-4 border border-slate-800">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-slate-400">{item.label}</span>
                  <span className="text-sm font-bold text-white font-mono">{item.note ?? `${item.pct}%`}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${item.pct}%`, background: item.color, boxShadow: `0 0 8px ${item.color}80` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 py-20">
        <div className="reveal text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-3">How It Works</p>
          <h2 className="text-3xl font-black text-white">Three steps to a data-driven policy</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((s, i) => {
            const stepCol = isBW ? ['#cccccc', '#aaaaaa', '#888888'][i] : s.color
            return (
              <div
                key={s.step}
                className={`reveal reveal-d${i+1} bg-slate-900/80 rounded-2xl p-6 border border-slate-800 card-hover relative overflow-hidden backdrop-blur`}
              >
                <div className="absolute top-0 right-0 text-7xl font-black opacity-[0.05] leading-none select-none" style={{ color: stepCol }}>{s.step}</div>
                <div className="text-3xl font-black font-mono mb-4" style={{ color: stepCol }}>{s.step}</div>
                <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── County Data (chart only) ── */}
      {counties.length > 0 && (
        <section id="insights" className="relative z-10 border-t border-slate-800 bg-slate-900/20 py-20 px-4">
          <div className="max-w-6xl mx-auto">
            {/* County dispensing rate spotlight */}
            <div className="reveal mb-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { county: 'Scott County',  rate: 87.2, note: 'Epicenter of 2015 HIV outbreak tied to IV drug use' },
                { county: 'Knox County',   rate: 85.7, note: 'Rural county with limited treatment access' },
                { county: 'Wayne County',  rate: 65.3, note: 'Urban-rural mix; high prescription exposure' },
              ].map(({ county, rate, note }) => (
                <div key={county} className="bg-slate-900/80 rounded-2xl p-4 border border-red-900/30 backdrop-blur">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">High-Risk County</p>
                  <p className="text-lg font-black text-white">{county}</p>
                  <p className="text-2xl font-black font-mono text-red-400 my-1">{rate} <span className="text-sm font-normal text-slate-500">Rx / 100 residents</span></p>
                  <p className="text-xs text-slate-500 leading-snug">{note}</p>
                </div>
              ))}
            </div>

            <div className="reveal mb-10">
              <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">County Insights</p>
              <h2 className="text-3xl font-black text-white">Indiana County Overview</h2>
              <p className="text-slate-500 mt-2 text-sm">58 Indiana counties recorded ~100 opioid prescriptions per 100 residents for multiple years. Select any county below to run a simulation.</p>
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Bar chart */}
              <div className="reveal lg:col-span-2 bg-slate-900/80 rounded-2xl p-5 border border-slate-800 backdrop-blur">
                <p className="text-sm font-semibold text-slate-300 mb-4">County Population (scale of OUD exposure)</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={[...counties].sort((a,b) => b.population - a.population)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#475569" fontSize={10} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
                    <YAxis type="category" dataKey="name" stroke="#475569" fontSize={10} width={80} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                      formatter={v => [v.toLocaleString(), 'Population']}
                    />
                    <Bar dataKey="population" radius={[0, 4, 4, 0]}>
                      {[...counties].sort((a,b) => b.population - a.population).map((c, i) => (
                        <Cell key={i} fill={riskColor(c.population / maxPop)} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top / Bottom lists */}
              <div className="reveal reveal-d1 space-y-4">
                <div className="bg-slate-900/80 rounded-2xl p-4 border border-red-900/30 backdrop-blur">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-3">Largest Counties</p>
                  <p className="text-[10px] text-slate-600 mb-2">Highest total OUD exposure by scale</p>
                  <div className="space-y-2">
                    {top5.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 w-4">{i+1}</span>
                          <span className="text-sm text-slate-300">{c.name}</span>
                        </div>
                        <span className="text-xs font-mono text-red-400">{(c.population/1000).toFixed(0)}K pop.</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-900/80 rounded-2xl p-4 border border-amber-900/30 backdrop-blur">
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-3">Rural Counties</p>
                  <p className="text-[10px] text-slate-600 mb-2">Smallest — often highest per-capita overdose rates</p>
                  <div className="space-y-2">
                    {bottom5.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 w-4">{i+1}</span>
                          <span className="text-sm text-slate-300">{c.name}</span>
                        </div>
                        <span className="text-xs font-mono text-amber-400">{(c.population/1000).toFixed(0)}K pop.</span>
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
      <section className="relative z-10 border-t border-slate-800 bg-slate-900/20 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="reveal text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-400 mb-3">Features</p>
            <h2 className="text-3xl font-black text-white">Built for real decisions</h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {BENEFITS.map((b, i) => {
              const iconBg     = isBW ? 'rgba(40,40,40,0.8)'  : `${b.color}18`
              const iconBorder = isBW ? '1px solid #2a2a2a'   : `1px solid ${b.color}40`
              return (
                <div
                  key={i}
                  className={`reveal reveal-d${(i % 3) + 1} bg-slate-900/80 rounded-2xl p-5 border border-slate-800 card-hover backdrop-blur`}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-4"
                    style={{ background: iconBg, border: iconBorder }}
                  >
                    {b.icon}
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">{b.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{b.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 py-24 px-4 text-center">
        <div className="reveal max-w-xl mx-auto">
          <h2 className="text-4xl font-black text-white mb-4">Ready to simulate?</h2>
          <p className="text-slate-500 mb-10">Pick a county, set your budget, find the policy that saves the most lives.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="cta-border-wrap">
              <button
                onClick={() => onNavigate('map')}
                className="cta-border-inner px-12 py-4 text-white font-bold text-lg transition hover:brightness-110"
              >
                Open Map &amp; Simulator →
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
