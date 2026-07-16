'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  id: string
  number: string
  clientEmail: string | null
  isReservation: boolean
}

export function ContractEmailButton({ id, number, clientEmail, isReservation }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Wyślij mailem
      </button>
      {open && (
        <EmailDialog
          id={id}
          number={number}
          defaultEmail={clientEmail || ''}
          isReservation={isReservation}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function EmailDialog({
  id, number, defaultEmail, isReservation, onClose,
}: { id: string; number: string; defaultEmail: string; isReservation: boolean; onClose: () => void }) {
  const router = useRouter()
  const [to, setTo] = useState(defaultEmail)
  const [subject, setSubject] = useState(`Umowa ${number} — MARAF Development`)
  const [message, setMessage] = useState(
    `Dzień dobry,\n\nw załączeniu przesyłam umowę numer ${number} z inwestycji Nova Staffa.\n\nW razie pytań pozostaję do dyspozycji.\n\nPozdrawiam\nRafał Boruch\nt. 501 629 619`,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd wysyłki')
      setSent(true)
      setTimeout(() => { onClose(); router.refresh() }, 1200)
    } catch (e: any) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Wyślij umowę mailem</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Adres email</label>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Temat</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Wiadomość</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">
              {isReservation
                ? 'Do maila zostanie dołączony plik DOCX z umową.'
                : 'Ta umowa nie ma jeszcze szablonu — mail zostanie wysłany bez załącznika (DOCX tylko dla umów rezerwacyjnych).'}
            </p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        {sent && <p className="text-sm text-green-700 mt-3">✓ Wysłano</p>}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Anuluj
          </button>
          <button onClick={send} disabled={busy || !to}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium">
            {busy ? 'Wysyłam...' : '✉ Wyślij'}
          </button>
        </div>
      </div>
    </div>
  )
}
