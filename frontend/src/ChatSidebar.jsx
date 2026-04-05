import { useState, useRef, useEffect } from 'react'

const API = '/api'

const SUGGESTIONS = [
  'What should Marion County do with $2M?',
  'Compare naloxone vs treatment for Allen County',
  'Which county has the highest overdose risk?',
]

export default function ChatSidebar({ county, onResult }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I'm the Morpheus AI. Ask me about opioid intervention strategies for any Indiana county.\n\nTry: "I have $2M for Marion County, what should I do?"`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        simulation: data.simulation,
      }])
      if (data.simulation) onResult?.(data.simulation)
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I could not reach the API. Make sure the backend is running.',
      }])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-semibold text-white">AI Policy Assistant</span>
        </div>
        <p className="text-[11px] text-slate-600 mt-0.5">Powered by Claude · {county} County selected</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-cyan-700/80 text-white'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>

              {msg.simulation && (
                <div className="mt-2 p-2 bg-slate-900 rounded-lg border border-slate-700 text-[11px]">
                  <p className="font-bold text-green-400 mb-1">Simulation Result</p>
                  <p className="text-slate-400">{msg.simulation.county} County</p>
                  <p className="text-green-400 font-bold text-sm">{msg.simulation.lives_saved} lives saved</p>
                  <p className="text-slate-500">Cost: ${(msg.simulation.cost / 1_000_000).toFixed(2)}M</p>
                  <button
                    onClick={() => onResult?.(msg.simulation)}
                    className="mt-1.5 px-2 py-1 bg-cyan-700 hover:bg-cyan-600 rounded text-white text-[11px] w-full transition"
                  >
                    Apply to map →
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-xl px-3 py-2 text-xs text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length < 3 && (
        <div className="px-3 pb-2 space-y-1.5 flex-shrink-0">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              className="w-full text-left text-[11px] text-slate-400 bg-slate-800/60 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2 transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-800 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask about interventions…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-600 min-w-0"
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg text-white text-xs font-semibold transition disabled:opacity-40 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0891b2, #7c3aed)' }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
