import React, { useState, useRef, useEffect } from 'react'

const API = '/api'

export default function ChatInterface({ onResult }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm Morpheus AI. Ask me about opioid intervention strategies for any Indiana county.\n\nTry: \"I have $2M for Marion County, what should I do?\"",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMsg = input.trim()
    setInput('')
    const updatedMessages = [...messages, { role: 'user', content: userMsg }]
    setMessages(updatedMessages)
    setLoading(true)

    // Send conversation history (exclude system intro and simulation metadata)
    const history = updatedMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))
      .slice(0, -1) // exclude the current message (sent separately)

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, history }),
      })
      const data = await res.json()

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          simulation: data.simulation,
        },
      ])

      if (data.simulation) {
        onResult(data.simulation)
      }
    } catch (e) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Make sure the API server is running.' },
      ])
    }

    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col" style={{ height: '70vh' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-200'
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>

                {msg.simulation && (
                  <div className="mt-3 p-3 bg-slate-800 rounded-lg border border-slate-600 text-xs">
                    <p className="font-semibold text-green-400 mb-1">Simulation Results:</p>
                    <p>County: {msg.simulation.county}</p>
                    <p>Baseline Deaths: {msg.simulation.baseline_deaths}</p>
                    <p>With Intervention: {msg.simulation.total_deaths}</p>
                    <p className="text-green-400 font-bold">Lives Saved: {msg.simulation.lives_saved}</p>
                    <p>Cost: ${(msg.simulation.cost / 1_000_000).toFixed(2)}M</p>
                    <button
                      onClick={() => onResult(msg.simulation)}
                      className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs"
                    >
                      View on Dashboard
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-700 rounded-xl px-4 py-3 text-sm text-slate-400">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-slate-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Ask about interventions... e.g. 'What's the best strategy for Allen County with $500K?'"
              className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded-lg text-white text-sm font-medium transition"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
