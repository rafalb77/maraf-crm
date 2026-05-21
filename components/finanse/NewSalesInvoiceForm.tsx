'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { COMPANY_LABELS, type Company } from '@/lib/types'

export function NewSalesInvoiceForm() {
  const router = useRouter()
  const [company, setCompany] = useState<string>('MARAF')
  const [number, setNumber] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientCompany, setRecipientCompany] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [vatRate, setVatRate] = useState('23')
  const [amountGross, setAmountGross] = useState('')
  const [amountNet, setAmountNet] = useState('')
  const [amountVat, setAmountVat] = useState('')
  const [deposit, setDeposit] = useState('')
  const [kb, setKb] = useState('')
  const [isAdvance, setIsAdvance] = useState(false)
  const [description, setDescription] = useState('')
  const [autoCalc, setAutoCalc] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!autoCalc) return
    const g = parseFloat(amountGross.replace(',', '.'))
    const r = parseFloat(vatRate.replace(',', '.')) / 100
    if (!isFinite(g) || !isFinite(r)) return
    const net = g / (1 + r)
    setAmountNet(net.toFixed(2))
    setAmountVat((g - net).toFixed(2))
  }, [amountGross, vatRate, autoCalc])

  async function submit() {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/finanse/sales-invoices', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          company, number: number.trim(), recipientName: recipientName.trim(),
          recipientCompany: recipientCompany || null,
          issueDate, dueDate: dueDate || null,
          vatRate: parseFloat(vatRate.replace(',', '.')) / 100,
          amountGross: parseFloat(amountGross.replace(',', '.')),
          amountNet: parseFloat(amountNet.replace(',', '.')),
          amountVat: parseFloat(amountVat.replace(',', '.')),
          deposit: deposit ? parseFloat(deposit.replace(',', '.')) : null,
          buildingCosts: kb ? parseFloat(kb.replace(',', '.')) : null,
          isAdvance, description: description.trim() || null,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Blad'); setLoading(false); return }
      router.push(`/finanse/przychody/${data.id}`)
    } catch (e: any) { setError(e.message || 'Blad sieci'); setLoading(false) }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Row label="Firma wystawiająca">
          <select value={company} onChange={(e) => setCompany(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {(Object.keys(COMPANY_LABELS) as Company[]).map((c) => <option key={c} value={c}>{COMPANY_LABELS[c]}</option>)}
          </select>
        </Row>
        <Row label="Numer faktury">
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="np. FV/12/2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
        </Row>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Row label="Odbiorca (firma)">
          <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="np. Janpol sp. z o.o." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </Row>
        <Row label="Odbiorca to firma grupy?">
          <select value={recipientCompany} onChange={(e) => setRecipientCompany(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Nie (zewnętrzny)</option>
            {(Object.keys(COMPANY_LABELS) as Company[]).map((c) => <option key={c} value={c}>{COMPANY_LABELS[c]}</option>)}
          </select>
        </Row>
      </div>

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
            <option value="23">23%</option><option value="8">8%</option><option value="5">5%</option><option value="0">0%</option>
          </select>
        </Row>
        <Row label="Brutto"><input value={amountGross} onChange={(e) => setAmountGross(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" /></Row>
        <Row label="Netto"><input value={amountNet} onChange={(e) => { setAmountNet(e.target.value); setAutoCalc(false) }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" /></Row>
        <Row label="VAT"><input value={amountVat} onChange={(e) => { setAmountVat(e.target.value); setAutoCalc(false) }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" /></Row>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={autoCalc} onChange={(e) => setAutoCalc(e.target.checked)} />
        Automatycznie licz netto/VAT z brutto
      </label>

      <div className="grid grid-cols-2 gap-4">
        <Row label="Kaucja zatrzymana (opc.)"><input value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="zł" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" /></Row>
        <Row label="Koszty budowy / KB (opc.)"><input value={kb} onChange={(e) => setKb(e.target.value)} placeholder="zł" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" /></Row>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={isAdvance} onChange={(e) => setIsAdvance(e.target.checked)} />
        Faktura zaliczkowa (nie wliczana do CIT/VAT dopóki nie zmieni się na zwykłą)
      </label>

      <Row label="Opis (opc.)">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      </Row>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}

      <div className="flex gap-2 pt-3 border-t border-gray-100">
        <button onClick={submit} disabled={loading || !number || !recipientName || !amountGross} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? 'Zapisuję...' : 'Zapisz fakturę'}
        </button>
        <button onClick={() => router.push('/finanse/przychody')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Anuluj</button>
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
