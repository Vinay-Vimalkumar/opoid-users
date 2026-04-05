import React from 'react'

const STEPS = [
  {
    title: 'Real CDC Data',
    color: 'blue',
    description: 'Downloaded two CDC datasets: VSRR Provisional County-Level Drug Overdose Deaths (2020-2025, 207K rows) and Drug Poisoning Mortality by County (2003-2021, model-based rates). Filtered to 20 Indiana counties.',
    detail: 'Sources: CDC WONDER, NCHS VSRR (data.cdc.gov)',
  },
  {
    title: 'Model Calibration',
    color: 'purple',
    description: 'Fit a 7-compartment stochastic model\'s transition rates to match real death counts using differential evolution (global optimizer). Each county gets its own calibrated parameters.',
    detail: 'R² = 0.71 mean across 20 counties, 19 years of data per county',
  },
  {
    title: 'GPU Simulation',
    color: 'green',
    description: 'Rewrote the compartmental model in PyTorch for GPU parallelism. Ran 9.26 million scenarios simultaneously on an NVIDIA H100 in 0.43 seconds — 21.7 million scenarios per second.',
    detail: '20 counties × 9,261 combos × 50 seeds = 9.26M scenarios on H100 80GB',
  },
  {
    title: 'Monte Carlo Uncertainty',
    color: 'cyan',
    description: '800,000 stochastic simulations (10,000 per county × 4 scenarios) to produce 90% confidence intervals. Every prediction comes with uncertainty bounds, not just point estimates.',
    detail: 'Marion County 90% CI: [4,483 - 4,720] deaths (No Action) · Throughput: 453K sims/sec',
  },
  {
    title: 'Deep Learning',
    color: 'orange',
    description: 'Three ML models: (1) XGBoost surrogate (R² = 0.99) for real-time optimization. (2) Neural network MLP (796K params) trained on 9.26M GPU outputs. (3) Bidirectional LSTM with temporal attention trained on real CDC time-series for 3-year forecasting.',
    detail: 'LSTM trained on REAL CDC data (not simulation outputs) — avoids circular ML',
  },
  {
    title: 'Reinforcement Learning Agent',
    color: 'red',
    description: 'PPO agent that makes budget allocation decisions year-by-year, observing the epidemic state before each decision. Learns temporal strategies: front-load naloxone for immediate impact, ramp treatment in later years.',
    detail: 'Saves 62% more lives than one-shot greedy optimization · Marion: 1,592 vs 361 lives',
  },
  {
    title: 'Gradient Optimization',
    color: 'pink',
    description: 'Differentiable simulation enables torch.autograd to compute ∂deaths/∂interventions. Multi-restart projected gradient descent finds optimal intervention allocation under budget constraints.',
    detail: 'Finds continuous optima, not just grid points — with sensitivity analysis',
  },
  {
    title: 'Counterfactual Analysis',
    color: 'yellow',
    description: 'Calibrated model answers "what if?": If Scott County deployed naloxone before the 2015 HIV outbreak, 47% of deaths could have been prevented. Statewide: 5,146 lives saveable if Indiana acted in 2016.',
    detail: 'Specific, concrete, policy-relevant findings backed by calibrated parameters',
  },
]

const COLOR_MAP = {
  blue:   { bg: 'bg-blue-900/30',   border: 'border-blue-700/50',   dot: 'bg-blue-500',   text: 'text-blue-400' },
  purple: { bg: 'bg-purple-900/30', border: 'border-purple-700/50', dot: 'bg-purple-500', text: 'text-purple-400' },
  green:  { bg: 'bg-green-900/30',  border: 'border-green-700/50',  dot: 'bg-green-500',  text: 'text-green-400' },
  cyan:   { bg: 'bg-cyan-900/30',   border: 'border-cyan-700/50',   dot: 'bg-cyan-500',   text: 'text-cyan-400' },
  orange: { bg: 'bg-orange-900/30', border: 'border-orange-700/50', dot: 'bg-orange-500', text: 'text-orange-400' },
  red:    { bg: 'bg-red-900/30',    border: 'border-red-700/50',    dot: 'bg-red-500',    text: 'text-red-400' },
  pink:   { bg: 'bg-pink-900/30',   border: 'border-pink-700/50',   dot: 'bg-pink-500',   text: 'text-pink-400' },
  yellow: { bg: 'bg-yellow-900/30', border: 'border-yellow-700/50', dot: 'bg-yellow-500', text: 'text-yellow-400' },
}

export default function MethodologyView() {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-800/50 rounded-xl p-6 border border-slate-700 fade-up">
        <h2 className="text-xl font-bold text-white mb-2">How Morpheus Works</h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-3xl">
          An eight-stage pipeline from raw CDC data to actionable policy recommendations.
          Every parameter is data-driven. The model is calibrated — not assumed.
        </p>
      </div>

      {/* Key numbers banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 fade-up fade-up-d1">
        {[
          { label: 'GPU Scenarios', value: '9.26M', sub: 'in 0.43 seconds', color: '#22c55e' },
          { label: 'Throughput', value: '21.7M/sec', sub: 'on NVIDIA H100', color: '#06b6d4' },
          { label: 'Monte Carlo', value: '800K', sub: 'stochastic simulations', color: '#a78bfa' },
          { label: 'RL Improvement', value: '+62%', sub: 'vs greedy optimizer', color: '#f97316' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 border border-slate-700 bg-slate-800/50 hover-lift">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-black font-mono" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-slate-500">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Pipeline visualization */}
      <div className="relative">
        {STEPS.map((step, i) => {
          const c = COLOR_MAP[step.color]
          return (
            <div key={i} className={`flex gap-4 mb-4 fade-up fade-up-d${Math.min(i + 1, 8)}`}>
              {/* Timeline */}
              <div className="flex flex-col items-center w-8 flex-shrink-0">
                <div className={`w-4 h-4 rounded-full ${c.dot} ring-2 ring-slate-800 z-10 scale-pop`} style={{ animationDelay: `${i * 0.1}s` }} />
                {i < STEPS.length - 1 && <div className="w-0.5 flex-1 bg-slate-600 draw-line" style={{ animationDelay: `${i * 0.15}s` }} />}
              </div>

              {/* Card */}
              <div className={`flex-1 ${c.bg} rounded-xl p-4 border ${c.border} mb-1 hover-lift`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-mono ${c.text} opacity-60`}>0{i + 1}</span>
                  <h3 className={`text-sm font-bold ${c.text}`}>{step.title}</h3>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{step.description}</p>
                <p className="text-slate-500 text-xs mt-2 font-mono">{step.detail}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Technical details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 fade-up hover-lift">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Compartmental Model</h3>
          <div className="text-xs text-slate-400 font-mono leading-loose space-y-1">
            <p>General Pop → <span className="text-blue-400">Prescribed</span> → <span className="text-yellow-400">Misuse</span> → <span className="text-orange-400">OUD</span></p>
            <p className="ml-8">↓</p>
            <p className="ml-4"><span className="text-orange-400">OUD</span> → <span className="text-red-400">Overdose</span> → <span className="text-red-600">Death</span> | Survived</p>
            <p className="ml-4"><span className="text-orange-400">OUD</span> → <span className="text-green-400">Treatment</span> → <span className="text-green-600">Recovered</span> → (relapse)</p>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            <p>7 compartments, 6 calibrated transition rates per county</p>
            <p>3 intervention levers: naloxone, prescribing reduction, treatment access</p>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 fade-up hover-lift">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Infrastructure</h3>
          <div className="text-xs text-slate-400 space-y-2">
            {[
              ['Cluster', 'Purdue Gautschi HPC'],
              ['GPU', 'NVIDIA H100 80GB HBM3'],
              ['Simulation throughput', '21.7M scenarios/sec'],
              ['Monte Carlo', '800K sims, 453K/sec'],
              ['Total GPU time', '54 minutes (full pipeline)'],
              ['Scheduler', 'SLURM (ai partition, 14 cores)'],
              ['Backend', 'FastAPI + PyTorch + XGBoost'],
              ['Frontend', 'React + Leaflet + Recharts'],
              ['RL Framework', 'Stable-Baselines3 (PPO)'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="text-slate-300 font-mono">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Future Work */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700 fade-up">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Future Work</h3>
        <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
          <li>Add time-varying transition rates to capture regime changes (2016 fentanyl surge, 2020 COVID)</li>
          <li>Integrate real-time PDMP and naloxone distribution data for live model updates</li>
          <li>Expand to all 92 Indiana counties and other states</li>
          <li>Validate intervention effect sizes with published RCT data from SAMHSA and CDC</li>
          <li>Deploy as a hosted tool for county health departments with user accounts and saved scenarios</li>
          <li>Add multi-county portfolio optimization (allocate budget across counties, not just within one)</li>
        </ul>
      </div>
    </div>
  )
}
