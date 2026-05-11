'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Props = {
  id: string
  number: string
  status: string
  clientEmail: string | null
  hasClient: boolean
  hasUnitsForReservation: boolean
}

export function OfferActions({ id, number, status, clientEmail, hasClient, hasUnitsForReservation }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)

  const editable = status !== 'ZAAKCEPTOWANA' && status !== 'ANULOWANA'

  async function setStatus(newStatus: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/oferty/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Błąd')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    }
    setBusy(false)
  }

  async function doDelete() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/oferty/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Błąd')
      router.push('/oferty')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 justify-end">
        {/* Akcje statusu */}
        {status === 'SZKIC' && (
          <button onClick={() => setStatus('WYSLANA')} disabled={busy}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            → Oznacz jako wysłaną
          </button>
        )}
        {status === 'WYSLANA' && (
          <>
            <button onClick={() => setStatus('ZAAKCEPTOWANA')} disabled={busy}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              ✓ Zaakceptowana
            </button>
            <button onClick={() => setStatus('ODRZUCONA')} disabled={busy}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              ✗ Odrzucona
            </button>
          </>
        )}
        {(status === 'ODRZUCONA' || status === 'ZAAKCEPTOWANA') && (
          <button onClick={() => setStatus('SZKIC')} disabled={busy}
            className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm">
            Cofnij do szkicu
          </button>
        )}

        {/* Konwersja → umowa rezerwacyjna */}
        {status === 'ZAAKCEPTOWANA' && hasClient && hasUnitsForReservation && (
          <button onClick={() => setConvertOpen(true)} disabled={busy}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium">
            → Umowa rezerwacyjna
          </button>
        )}

        {/* Edycja / Drukuj / Email */}
        {editable && (
          <Link href={`/oferty/${id}/edytuj`}
            className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium">
            ✏ Edytuj
          </Link>
        )}
        <Link href={`/oferty/${id}/druk`} target="_blank"
          className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm">
          🖨 Drukuj / PDF
        </Link>
        <button onClick={() => setEmailOpen(true)}
          className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm">
          ✉ Wyślij mailem
        </button>

        {/* Status anulowania + usuwanie */}
        {status !== 'ANULOWANA' && status !== 'ZAAKCEPTOWANA' && (
          <button onClick={() => setStatus('ANULOWANA')} disabled={busy}
            className="px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded-lg text-sm">
            Anuluj
          </button>
        )}
        <button onClick={() => setConfirmDelete(true)} disabled={busy}
          className="px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded-lg text-sm">
          🗑 Usuń
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2 text-right">{error}</p>}

      {confirmDelete && (
        <ConfirmDialog
          title="Usunąć ofertę?"
          body={`Czy na pewno chcesz trwale usunąć ofertę ${number}? Tej operacji nie da się cofnąć.`}
          confirmLabel="Tak, usuń"
          busy={busy}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {emailOpen && (
        <EmailDialog
          id={id}
          number={number}
          defaultEmail={clientEmail || ''}
          onClose={() => setEmailOpen(false)}
          onSent={() => { setEmailOpen(false); router.refresh() }}
        />
      )}

      {convertOpen && (
        <ConvertDialog
          id={id}
          number={number}
          onClose={() => setConvertOpen(false)}
          onDone={(contractId) => router.push(`/sales/${contractId}`)}
        />
      )}
    </>
  )
}

function ConfirmDialog({ title, body, confirmLabel, busy, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && onCancel()}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-700 mb-4">{body}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Anuluj
          </button>
          <button onClick={onConfirm} disabled={busy}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium">
            {busy ? 'Pracuję...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmailDialog({
  id, number, defaultEmail, onClose, onSent,
}: { id: string; number: string; defaultEmail: string; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState(defaultEmail)
  const [subject, setSubject] = useState(`Wiadomość od MARAF Development — ${number}`)
  const [message, setMessage] = useState(
    `Dzień dobry,\n\nw załączeniu przesyłam ofertę numer ${number} z inwestycji Nova Staffa.\n\nW razie pytań pozostaję do dyspozycji.\n\nPozdrawiam`,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/oferty/${id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd wysyłki')
      setSent(true)
      setTimeout(onSent, 1200)
    } catch (e: any) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Wyślij ofertę mailem</h2>
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
              Do maila zostanie dołączony plik PDF z ofertą (do druku) + pełna treść w HTML.
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

function ConvertDialog({
  id, number, onClose, onDone,
}: { id: string; number: string; onClose: () => void; onDone: (contractId: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function convert() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/oferty/${id}/convert-to-contract`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd')
      onDone(data.contractId)
    } catch (e: any) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Utworzyć umowę rezerwacyjną?</h2>
        <p className="text-sm text-gray-700 mb-3">
          System utworzy nową umowę typu <strong>REZERWACYJNA</strong> z klientem i lokalami z oferty {number}.
          Wartość umowy = kwota brutto po rabacie z oferty.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-xs text-blue-800">
          Lokale z oferty zostaną oznaczone jako <strong>ZAREZERWOWANY</strong>.
        </div>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Anuluj
          </button>
          <button onClick={convert} disabled={busy}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium">
            {busy ? 'Tworzę...' : 'Utwórz umowę'}
          </button>
        </div>
      </div>
    </div>
  )
}
