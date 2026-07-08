'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { fmtMoney } from '@/lib/finanse-format'

// Statusy, w ktorych API pozwala dodac platnosc (lustro payableStatuses
// w /api/finanse/invoices/[id]/payments). Dla sales blokada tylko ANULOWANA.
const PURCHASE_PAYABLE = new Set(['WPROWADZONA', 'DO_ZATWIERDZENIA', 'ZATWIERDZONA', 'ZAPLANOWANA', 'CZESCIOWO_OPLACONA'])

type Props = {
  invoiceId: string
  remaining: number // pozostalo do zaplaty (po potraceniach)
  status: string
  kind: 'purchase' | 'sales' // kosztowa (płatność) vs przychodowa (wpłata)
}

// Szybkie dodanie platnosci/wplaty z poziomu wiersza tabeli faktur.
// Zwiniete: przycisk "+ płatność"/"+ wpłata". Rozwiniete: kwota (prefill
// pozostalej) + data + zapis. Pelny formularz (tytul, notatka) — w szczegolach FV.
export function QuickPaymentCell({ invoiceId, remaining, status, kind }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payable = kind === 'purchase' ? PURCHASE_PAYABLE.has(status) : status !== 'ANULOWANA'
  if (!payable || remaining <= 0.01) {
    return <span className="text-gray-300 text-xs">—</span>
  }

  const label = kind === 'purchase' ? 'płatność' : 'wpłata'
  const endpoint = kind === 'purchase'
    ? `/api/finanse/invoices/${invoiceId}/payments`
    : `/api/finanse/sales-invoices/${invoiceId}/payments`

  function openForm() {
    setAmount(remaining.toFixed(2))
    setPaidAt(new Date().toISOString().slice(0, 10))
    setError(null)
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount.replace(',', '.')),
          paidAt,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setError(data.error || 'Błąd zapisu'); return }
      setOpen(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap"
        title={`Dodaj ${label} (pozostało ${fmtMoney(remaining)})`}
      >
        + {label}
      </button>
    )
  }

  // Edytor rozwijany pionowo (kwota / data / przyciski) — kolumna zostaje waska,
  // tabela sie nie rozpycha przy dodawaniu platnosci.
  return (
    <div className="flex flex-col gap-1 w-[128px]">
      <input
        autoFocus
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false) }}
        className="px-2 py-1 border border-blue-300 rounded text-xs tabular-nums w-full"
        placeholder="kwota"
        title={`Pozostało: ${fmtMoney(remaining)}`}
      />
      <input
        type="date"
        value={paidAt}
        onChange={(e) => setPaidAt(e.target.value)}
        className="px-1.5 py-1 border border-blue-300 rounded text-xs w-full"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || !amount || !paidAt}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded py-1 text-xs font-medium disabled:opacity-40"
          title="Zapisz"
        >
          {saving ? '…' : 'Zapisz'}
        </button>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm px-1" title="Anuluj">✗</button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
