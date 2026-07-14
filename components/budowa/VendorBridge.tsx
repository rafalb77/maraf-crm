'use client'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

/**
 * Most wykonawca ↔ kontrahent kosztowy (moduł Budowa, Etap 3). Na karcie
 * podwykonawcy: wybór Vendora z Finansów (podpowiedź po NIP). Dzięki mostkowi
 * karta wykonawcy i /budowa/koszty pokazują jego faktury i alert "nieopłacona FV".
 * PATCH /api/przeroby/subcontractors/[id] { vendorId }.
 */

type Vendor = { id: string; name: string; nip: string | null }

export function VendorBridge({
  subcontractorId,
  subNip,
  vendorId,
  vendors,
}: {
  subcontractorId: string
  subNip: string | null
  vendorId: string | null
  vendors: Vendor[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = vendors.find((v) => v.id === vendorId) || null
  // podpowiedź: kontrahent o tym samym NIP (gdy jeszcze niezmostkowany)
  const nipSuggestion = useMemo(() => {
    if (vendorId || !subNip) return null
    const norm = (s: string) => s.replace(/[^0-9]/g, '')
    return vendors.find((v) => v.nip && norm(v.nip) === norm(subNip)) || null
  }, [vendors, subNip, vendorId])

  async function setVendor(id: string | null) {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/przeroby/subcontractors/${subcontractorId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: id }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(data.error || 'Błąd zapisu')
        return
      }
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span>🏗️</span>
        <h2 className="font-semibold text-gray-900">Powiązanie z Finansami</h2>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Połącz z kontrahentem kosztowym, żeby na budowie widzieć jego faktury i alerty o niezapłaconych.
      </p>

      {current ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
          <span className="text-sm text-green-800">
            ✓ Powiązany z <b>{current.name}</b>
            {current.nip && <span className="text-green-600"> (NIP {current.nip})</span>}
          </span>
          <button
            onClick={() => setVendor(null)}
            disabled={saving}
            className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
          >
            odłącz
          </button>
        </div>
      ) : (
        <>
          {nipSuggestion && (
            <button
              onClick={() => setVendor(nipSuggestion.id)}
              disabled={saving}
              className="w-full mb-2 text-left rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-sm hover:bg-amber-100 disabled:opacity-50"
            >
              💡 Ten sam NIP: <b>{nipSuggestion.name}</b> — kliknij, żeby powiązać
            </button>
          )}
          <select
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white disabled:opacity-50"
            disabled={saving}
            value=""
            onChange={(e) => e.target.value && setVendor(e.target.value)}
          >
            <option value="">— wybierz kontrahenta z Finansów —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.nip ? ` (NIP ${v.nip})` : ''}
              </option>
            ))}
          </select>
        </>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
