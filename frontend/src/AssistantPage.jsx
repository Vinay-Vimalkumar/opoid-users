import { useState, useRef, useEffect } from 'react'

const API = '/api'

const SUGGESTIONS = [
  { label: 'Key Findings', q: 'What are the key findings of Morpheus?' },
  { label: 'Scott County', q: 'Tell me about the Scott County HIV outbreak and what could have been prevented' },
  { label: 'Marion $2M', q: 'I have $2M for Marion County. What interventions should I prioritize?' },
  { label: 'Rural vs Urban', q: 'How do rural counties compare to urban counties in overdose rates?' },
  { label: 'Time Machine', q: 'How do I use the time machine feature?' },
  { label: 'Methodology', q: 'How was the simulation model calibrated to real data?' },
  { label: 'GPU Performance', q: 'What GPU was used and what throughput did you achieve?' },
  { label: 'Confidence Intervals', q: 'What are the Monte Carlo confidence intervals for Marion County?' },
]

export default function AssistantPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'API error')
      }

      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        simulation: data.simulation,
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `The AI Assistant requires the backend server to be running. This is a static deployment — to use the AI chat, run the project locally:\n\n\`\`\`\ngit clone https://github.com/Vinay-Vimalkumar/opoid-users.git\ncd opoid-users\npip install -r requirements-server.txt\npython -m uvicorn api.main:app --port 8000\n\`\`\`\n\nThen open http://localhost:8000 and the AI will be available.\n\nIn the meantime, here are some key findings:\n- **5,146 lives** could have been saved if Indiana acted in 2016\n- **47%** of Scott County deaths were preventable\n- **9.26M simulations** ran in 0.43 seconds on an H100 GPU\n- The RL agent saves **62% more lives** than greedy optimization`,
      }])
    }
    setLoading(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 h-[calc(100vh-57px)] flex flex-col">

      {/* Header */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center fade-up">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center text-3xl font-black text-white mb-6 scale-pop gentle-float" style={{ boxShadow: '0 0 40px rgba(249,115,22,0.2), 0 0 80px rgba(147,51,234,0.1)' }}>
            AI
          </div>
          <h1 className="text-4xl font-black text-white mb-3">
            Policy <span className="gradient-text">Assistant</span>
          </h1>
          <p className="text-slate-400 text-center max-w-lg mb-10 leading-relaxed">
            Ask about the data, the model, findings, features, or get
            policy recommendations for any Indiana county.
          </p>

          {/* Suggestion grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => send(s.q)}
                className={`px-4 py-4 rounded-xl border border-slate-700/50 bg-slate-800/30 text-xs text-slate-300 font-medium hover:border-orange-500/30 hover:text-white hover:bg-slate-800/60 transition-all press-effect text-left hover-lift fade-up fade-up-d${i + 1}`}
                style={{ backdropFilter: 'blur(8px)' }}
              >
                <span className="text-orange-400 font-bold block mb-1.5 text-sm">{s.label}</span>
                <span className="text-slate-500 text-[10px] leading-relaxed line-clamp-2">{s.q}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} slide-up`}>
              <div className={`max-w-[80%] rounded-2xl px-5 py-4 ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-orange-600/80 to-purple-600/80 text-white'
                  : 'bg-slate-800/80 border border-slate-700/50 text-slate-200'
              }`} style={{
                backdropFilter: 'blur(12px)',
                boxShadow: msg.role === 'user'
                  ? '0 4px 20px rgba(249,115,22,0.15)'
                  : '0 4px 20px rgba(0,0,0,0.2)',
              }}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(/```json\n([\s\S]*?)\n```/g, '<pre class="bg-slate-900 rounded-lg p-3 text-xs overflow-x-auto border border-slate-700 my-2"><code>$1</code></pre>')
                        .replace(/```([\s\S]*?)```/g, '<pre class="bg-slate-900 rounded-lg p-3 text-xs overflow-x-auto border border-slate-700 my-2"><code>$1</code></pre>')
                        .replace(/## (.*)/g, '<h3 class="text-base font-bold text-white mt-3 mb-1">$1</h3>')
                        .replace(/# (.*)/g, '<h2 class="text-lg font-bold text-white mt-3 mb-1">$1</h2>')
                        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                        .replace(/\n- /g, '\n<br/>• ')
                        .replace(/\n\d+\. /g, (m) => `\n<br/>${m.trim()} `)
                        .replace(/\n/g, '<br/>')
                    }}
                  />
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}

                {/* Simulation result card */}
                {msg.simulation && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-900/80 border border-slate-700 space-y-1">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Simulation Result</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">County:</span>{' '}
                        <span className="text-white font-bold">{msg.simulation.county}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Lives Saved:</span>{' '}
                        <span className="text-green-400 font-bold font-mono">+{msg.simulation.lives_saved}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Deaths:</span>{' '}
                        <span className="text-amber-400 font-mono">{msg.simulation.total_deaths}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Cost:</span>{' '}
                        <span className="text-cyan-400 font-mono">${(msg.simulation.cost / 1e6).toFixed(1)}M</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-slate-500">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 pt-2">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask about the project, data, features, or get policy advice..."
            className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl px-5 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 transition"
            style={{ backdropFilter: 'blur(8px)' }}
            disabled={loading}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="px-6 py-3.5 bg-gradient-to-r from-orange-600 to-purple-600 rounded-xl text-white text-sm font-bold hover:brightness-110 disabled:opacity-30 transition press-effect"
            style={{ boxShadow: input.trim() ? '0 4px 16px rgba(249,115,22,0.25)' : 'none' }}
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-slate-600 text-center mt-2">
          Powered by Claude · Knows all project data, features, and methodology
        </p>
      </div>
    </div>
  )
}
