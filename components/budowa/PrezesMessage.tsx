'use client'

import { useState } from 'react'

/**
 * „Napisz do Rafała" — jedno duże pole na dole Widoku Prezesa.
 * Tworzy komentarz z flagą „do wyjaśnienia" → Task dla Rafała.
 */
export function PrezesMessage() {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function send() {
    if (text.trim().length < 2) return
    setState('sending')
    try {
      const res = await fetch('/api/budowa/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim(), needsClarification: true }),
      })
      if (!res.ok) throw new Error()
      setText('')
      setState('sent')
      setTimeout(() => setState('idle'), 4000)
    } catch {
      setState('error')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="text-lg font-bold mb-3">✍️ Napisz do Rafała</div>
      <textarea
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
        rows={3}
        placeholder="Np. sprawdź elewację od północy…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={state === 'sending'}
      />
      <button
        type="button"
        onClick={send}
        disabled={state === 'sending' || text.trim().length < 2}
        className="mt-3 w-full py-4 rounded-xl text-lg font-semibold text-white disabled:opacity-50"
        style={{ background: '#1F2D3F' }}
      >
        {state === 'sending' ? 'Wysyłanie…' : 'Wyślij'}
      </button>
      {state === 'sent' && (
        <p className="mt-2 text-center text-green-700 font-semibold">✓ Wysłane — Rafał dostanie zadanie</p>
      )}
      {state === 'error' && (
        <p className="mt-2 text-center text-red-600">Nie udało się wysłać — spróbuj ponownie</p>
      )}
    </div>
  )
}
