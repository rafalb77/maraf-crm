'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  id: string
  name: string
  active: boolean
  protocolCount: number
  contractCount: number
}

export function SubcontractorActions({ id, name, active, protocolCount, contractCount }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggleActive() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/przeroby/subcontractors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
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
      const res = await fetch(`/api/przeroby/subcontractors/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Błąd usuwania')
      router.push('/przeroby/podwykonawcy')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleActive}
          disabled={busy}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          title={active ? 'Ukryj z list aktywnych podwykonawców' : 'Przywróć jako aktywnego'}
        >
          {active ? 'Dezaktywuj' : 'Aktywuj'}
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
          className="px-3 py-1.5 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
        >
          🗑 Usuń
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {confirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !busy && setConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Usunąć podwykonawcę?</h2>
            <p className="text-sm text-gray-700 mb-3">
              Czy na pewno chcesz <strong>trwale usunąć</strong> podwykonawcę „{name}"? Tej operacji nie da się cofnąć.
            </p>

            {protocolCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-3 text-xs text-red-800">
                <strong>Operacja niemożliwa.</strong> Podwykonawca ma {protocolCount} {protocolCount === 1 ? 'protokół' : 'protokołów'}.
                Najpierw usuń lub anuluj protokoły, albo wybierz <em>Dezaktywuj</em> żeby zachować historię.
              </div>
            )}

            {protocolCount === 0 && contractCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-3 text-xs text-amber-800">
                Podwykonawca ma {contractCount} {contractCount === 1 ? 'umowę' : 'umów'} (bez protokołów).
                Umowy zostaną usunięte razem z podwykonawcą.
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Anuluj
              </button>
              <button
                onClick={doDelete}
                disabled={busy || protocolCount > 0}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium"
              >
                {busy ? 'Usuwam...' : 'Tak, usuń trwale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
