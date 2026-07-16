'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type Vendor = {
  id: string
  name: string
  category: string
  defaultDepositPct: number | null
  defaultBuildingCostsPct: number | null
  depositReturnMonths?: number | null // z warunkow umownych — auto-termin zwrotu kaucji
}

export function NewInvoiceForm({ vendors, company }: { vendors: Vendor[]; company: string }) {
  const router = useRouter()
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '')
  const [number, setNumber] = useState('')
  const [subVendor, setSubVendor] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [vatRate, setVatRate] = useState('23')
  const [amountGross, setAmountGross] = useState('')
  const [amountNet, setAmountNet] = useState('')
  const [amountVat, setAmountVat] = useState('')
  const [depositPct, setDepositPct] = useState('')
  const [buildingCostsPct, setBuildingCostsPct] = useState('')
  const [description, setDescription] = useState('')
  const [autoCalc, setAutoCalc] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedVendor = vendors.find((v) => v.id === vendorId) || null

  // Prefill % kaucji + % KB z domyślnych ustawień kontrahenta gdy zmienia się vendor
  useEffect(() => {
    if (selectedVendor) {
      setDepositPct(selectedVendor.defaultDepositPct != null ? String(selectedVendor.defaultDepositPct) : '')
      setBuildingCostsPct(selectedVendor.defaultBuildingCostsPct != null ? String(selectedVendor.defaultBuildingCostsPct) : '')
    }
  }, [vendorId, selectedVendor])

  // Auto-przelicz net/vat z brutto przy zmianie brutto lub stawki
  useEffect(() => {
    if (!autoCalc) return
    const gross = parseFloat(amountGross.replace(',', '.'))
    const rate = parseFloat(vatRate.replace(',', '.')) / 100
    if (!isFinite(gross) || !isFinite(rate)) return
    const net = gross / (1 + rate)
    const vat = gross - net
    setAmountNet(net.toFixed(2))
    setAmountVat(vat.toFixed(2))
  }, [amountGross, vatRate, autoCalc])

  async function submit() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/finanse/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          company,
          vendorId,
          number: number.trim(),
          subVendor: subVendor.trim() || null,
          issueDate,
          dueDate: dueDate || null,
          vatRate: parseFloat(vatRate.replace(',', '.')) / 100,
          amountGross: parseFloat(amountGross.replace(',', '.')),
          amountNet: parseFloat(amountNet.replace(',', '.')),
          amountVat: parseFloat(amountVat.replace(',', '.')),
          depositPct: depositPct ? parseFloat(depositPct.replace(',', '.')) : null,
          buildingCostsPct: buildingCostsPct ? parseFloat(buildingCostsPct.replace(',', '.')) : null,
          description: description.trim() || null,
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Blad')
        setLoading(false)
        return
      }
      router.push(`/finanse/faktury/${data.id}`)
    } catch (e: any) {
      setError(e.message || 'Blad sieci')
      setLoading(false)
    }
  }

  if (vendors.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        Najpierw musisz mieć przynajmniej jednego kontrahenta. Zaimportuj historię z xlsx — vendorzy utworzą się automatycznie.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <Row label="Kontrahent">
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </Row>
      <Row label="Podkontrahent (opcjonalnie)">
        <input
          value={subVendor}
          onChange={(e) => setSubVendor(e.target.value)}
          placeholder="np. PATRIMEX (gdy faktura zbiorcza)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </Row>
      <Row label="Numer faktury">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="np. F/000299/26"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
        />
      </Row>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Row label="Data wystawienia">
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </Row>
        <Row label="Termin płatności">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </Row>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Row label="VAT %">
          <select
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="23">23%</option>
            <option value="8">8%</option>
            <option value="5">5%</option>
            <option value="0">0%</option>
          </select>
        </Row>
        <Row label="Brutto">
          <input
            value={amountGross}
            onChange={(e) => setAmountGross(e.target.value)}
            placeholder="np. 1230,00"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
          />
        </Row>
        <Row label="Netto">
          <input
            value={amountNet}
            onChange={(e) => { setAmountNet(e.target.value); setAutoCalc(false) }}
            placeholder="auto"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
          />
        </Row>
        <Row label="VAT">
          <input
            value={amountVat}
            onChange={(e) => { setAmountVat(e.target.value); setAutoCalc(false) }}
            placeholder="auto"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
          />
        </Row>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={autoCalc}
          onChange={(e) => setAutoCalc(e.target.checked)}
        />
        Automatycznie licz netto/VAT z brutto i stawki
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Row label="Kaucja % (opc.)">
          <input value={depositPct} onChange={(e) => setDepositPct(e.target.value)} placeholder="np. 5" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
        </Row>
        <Row label="KB % (opc.)">
          <input value={buildingCostsPct} onChange={(e) => setBuildingCostsPct(e.target.value)} placeholder="np. 1" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
        </Row>
      </div>
      {selectedVendor && (selectedVendor.defaultDepositPct != null || selectedVendor.defaultBuildingCostsPct != null || selectedVendor.depositReturnMonths != null) && (
        <p className="text-xs text-gray-400">
          Warunki umowne kontrahenta <strong>{selectedVendor.name}</strong>
          {selectedVendor.depositReturnMonths != null && depositPct && (
            <> — termin zwrotu kaucji ustawi się automatycznie na <strong>+{selectedVendor.depositReturnMonths} mc</strong> od daty wystawienia</>
          )}
          {' '}(edycja w <a href="/finanse/kontrahenci" className="text-blue-600 hover:underline">/finanse/kontrahenci</a>).
        </p>
      )}

      <Row label="Opis (opcjonalnie)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="np. Materiały budowlane, beton C25/30"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </Row>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}

      <div className="flex gap-2 pt-3 border-t border-gray-100">
        <button
          onClick={submit}
          disabled={loading || !vendorId || !number || !amountGross}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Zapisuję...' : 'Zapisz fakturę'}
        </button>
        <button
          onClick={() => router.push('/finanse/faktury')}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          Anuluj
        </button>
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
