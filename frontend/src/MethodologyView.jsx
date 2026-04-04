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
    description: 'Rewrote the compartmental model in PyTorch for GPU parallelism. Runs 266,200 scenarios simultaneously on an NVIDIA H100 — all intervention combinations across all counties.',
    detail: '20 counties × 1,331 combos × 10 seeds = 266K scenarios in ~2 seconds',
  },
  {
    title: 'Deep Learning',
    color: 'orange',
    description: 'Two neural networks: (1) Surrogate MLP trained on GPU simulation outputs for real-time prediction. (2) Bidirectional LSTM with temporal attention trained on real CDC time-series for 3-year death rate forecasting.',
    detail: 'LSTM trained on REAL data, not simulation — avoids circular ML',
  },
  {
    title: 'Gradient Optimization',
    color: 'red',
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
  blue: { bg: 'bg-blue-900/30', border: 'border-blue-700/50', dot: 'bg-blue-500', text: 'text-blue-400' },
  purple: { bg: 'bg-purple-900/30', border: 'border-purple-700/50', dot: 'bg-purple-500', text: 'text-purple-400' },
  green: { bg: 'bg-green-900/30', border: 'border-green-700/50', dot: 'bg-green-500', text: 'text-green-400' },
  orange: { bg: 'bg-orange-900/30', border: 'border-orange-700/50', dot: 'bg-orange-500', text: 'text-orange-400' },
  red: { bg: 'bg-red-900/30', border: 'border-red-700/50', dot: 'bg-red-500', text: 'text-red-400' },
  yellow: { bg: 'bg-yellow-900/30', border: 'border-yellow-700/50', dot: 'bg-yellow-500', text: 'text-yellow-400' },
}

export default function MethodologyView() {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-800/50 rounded-xl p-6 border border-slate-700 fade-up">
        <h2 className="text-xl font-bold text-white mb-2">How DrugDiffuse Works</h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-3xl">
          A six-stage pipeline from raw CDC data to actionable policy recommendations.
          Every parameter is data-driven. The model is calibrated — not assumed.
        </p>
      </div>

      {/* Pipeline visualization */}
      <div className="relative">
        {STEPS.map((step, i) => {
          const c = COLOR_MAP[step.color]
          return (
            <div key={i} className={`flex gap-4 mb-4 fade-up fade-up-d${i + 1}`}>
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
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 fade-up fade-up-d7 hover-lift">
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

        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 fade-up fade-up-d8 hover-lift">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Infrastructure</h3>
          <div className="text-xs text-slate-400 space-y-2">
            <div className="flex justify-between">
              <span>Cluster</span>
              <span className="text-slate-300 font-mono">Purdue Gautschi HPC</span>
            </div>
            <div className="flex justify-between">
              <span>GPU</span>
              <span className="text-slate-300 font-mono">NVIDIA H100 80GB HBM3</span>
            </div>
            <div className="flex justify-between">
              <span>Simulation throughput</span>
              <span className="text-slate-300 font-mono">~500K scenarios/sec</span>
            </div>
            <div className="flex justify-between">
              <span>Scheduler</span>
              <span className="text-slate-300 font-mono">SLURM (ai partition)</span>
            </div>
            <div className="flex justify-between">
              <span>Backend</span>
              <span className="text-slate-300 font-mono">FastAPI + PyTorch</span>
            </div>
            <div className="flex justify-between">
              <span>Frontend</span>
              <span className="text-slate-300 font-mono">React + Recharts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Limitations */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700 fade-up">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Limitations & Future Work</h3>
        <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
          <li>Model uses fixed transition rates — cannot capture regime changes like the 2020 fentanyl surge (would need time-varying rates)</li>
          <li>Calibration R² = 0.71 — captures long-term trend but underestimates peak years</li>
          <li>Intervention effect sizes (e.g., "naloxone reduces fatality by up to 50%") are from literature estimates, not independently validated</li>
          <li>Cost model is simplified — real intervention costs vary by county infrastructure and population density</li>
          <li>LSTM has limited training data (120 samples from 20 counties × 6 windows each)</li>
        </ul>
      </div>
    </div>
  )
}
