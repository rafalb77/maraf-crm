'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type VendorOption = { id: string; name: string }

type Props = {
  invoiceId: string
  vendorId: string
  subVendor: string | null
  number: string
  issueDate: string   // ISO
  dueDate: string | null  // ISO
  vatRate: number     // np. 0.23
  amountGross: number
  amountNet: number
  amountVat: number
  description: string | null
  notes: string | null
  vendors: VendorOption[]
}

// Formularz edycji faktury kosztowej. Domyślnie zwinięty — rozwija się
// przyciskiem "Edytuj fakturę". Przydatny zwłaszcza do poprawiania błędów
// w fakturach importowanych z xlsx (kwoty, daty, numer, kontrahent).
export function EditInvoiceForm(p: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const [vendorId, setVendorId] = useState(p.vendorId)
  const [subVendor, setSubVendor] = useState(p.subVendor || '')
  const [number, setNumber] = useState(p.number)
  const [issueDate, setIssueDate] = useState(p.issueDate.slice(0, 10))
  const [dueDate, setDueDate] = useState(p.dueDate ? p.dueDate.slice(0, 10) : '')
  const [vatRate, setVatRate] = useState(String(Math.round(p.vatRate * 100)))
  const [amountGross, setAmountGross] = useState(String(p.amountGross))
  const [amountNet, setAmountNet] = useState(String(p.amountNet))
  const [amountVat, setAmountVat] = useState(String(p.amountVat))
  const [description, setDescription] = useState(p.description || '')
  const [notes, setNotes] = useState(p.notes || '')
  const [autoCalc, setAutoCalc] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-przelicz netto/VAT z brutto i stawki (jak w formularzu nowej faktury).
  useEffect(() => {
    if (!autoCalc) return
    const gross = parseFloat(amountGross.replace(',', '.'))
    const rate = parseFloat(vatRate.replace(',', '.')) / 100
    if (!isFinite(gross) || !isFinite(rate)) return
    const net = gross / (1 + rate)
    setAmountNet(net.toFixed(2))
    setAmountVat((gross - net).toFixed(2))
  }, [amountGross, vatRate, autoCalc])

  const num = (s: string) => parseFloat(s.replace(',', '.'))

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/finanse/invoices/${p.invoiceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          subVendor: subVendor.trim() || null,
          number: number.trim(),
          issueDate,
          dueDate: dueDate || null,
          vatRate: num(vatRate) / 100,
          amountGross: num(amountGross),
          amountNet: num(amountNet),
          amountVat: num(amountVat),
          description: description.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setError(data.error || 'Błąd zapisu'); return }
      router.refresh()
      setOpen(false)
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
      >
        ✎ Edytuj fakturę
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-300 rounded-xl p-6 space-y-4">
      <p className="text-sm font-semibold text-gray-900">Edycja faktury</p>

      <Row label="Kontrahent">
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          {p.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </Row>
      <Row label="Podkontrahent (opcjonalnie)">
        <input value={subVendor} onChange={(e) => setSubVendor(e.target.value)} placeholder="np. PATRIMEX" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      </Row>
      <Row label="Numer faktury">
        <input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
      </Row>

      <div className="grid grid-cols-2 gap-4">
        <Row label="Data wystawienia">
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </Row>
        <Row label="Termin płatności">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </Row>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Row label="VAT %">
          <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="23">23%</option>
            <option value="8">8%</option>
            <option value="5">5%</option>
            <option value="0">0%</option>
          </select>
        </Row>
        <Row label="Brutto">
          <input value={amountGross} onChange={(e) => setAmountGross(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
        </Row>
        <Row label="Netto">
          <input value={amountNet} onChange={(e) => { setAmountNet(e.target.value); setAutoCalc(false) }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
        </Row>
        <Row label="VAT">
          <input value={amountVat} onChange={(e) => { setAmountVat(e.target.value); setAutoCalc(false) }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
        </Row>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={autoCalc} onChange={(e) => setAutoCalc(e.target.checked)} />
        Automatycznie licz netto/VAT z brutto i stawki
      </label>

      <Row label="Opis">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="np. Materiały budowlane" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      </Row>
      <Row label="Notatka wewnętrzna">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      </Row>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}

      <div className="flex gap-2 pt-3 border-t border-gray-100">
        <button onClick={save} disabled={saving || !number.trim() || !amountGross} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Zapisuję...' : 'Zapisz zmiany'}
        </button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Anuluj</button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 uppercase font-semibold mb-1">{label}</label>
      {children}
    </div>
  )
}
