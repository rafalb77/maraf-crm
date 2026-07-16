'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

export type ContractPaymentRow = {
  id: string
  title: string | null
  type: string
  plannedDate: string | null
  plannedAmount: number
  status: string
  paidDate: string | null
  paidAmount: number | null
  toEscrow: boolean
  note: string | null
  escrowDepositId: string | null
}

const TYPE_LABELS: Record<string, string> = {
  ZALICZKA: 'Zaliczka',
  RATA: 'Rata',
  KONCOWA: 'Końcowa',
  REZERWACYJNA: 'Rezerwacyjna',
}

export function ContractPaymentsPanel({
  contractId,
  contractType,
  initialPayments,
  escrowAccounts,
}: {
  contractId: string
  contractType: string
  initialPayments: ContractPaymentRow[]
  escrowAccounts: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  const payments = initialPayments
  const plannedTotal = payments.reduce((s, p) => s + p.plannedAmount, 0)
  const paidTotal = payments.filter((p) => p.status === 'OPLACONA').reduce((s, p) => s + (p.paidAmount || 0), 0)
  const remaining = plannedTotal - paidTotal
  const overdue = payments.filter((p) => p.status === 'PLANOWANA' && p.plannedDate && p.plannedDate.slice(0, 10) < today)
  const overdueSum = overdue.reduce((s, p) => s + p.plannedAmount, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <h2 className="font-semibold text-gray-900">Harmonogram wpłat</h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 font-medium"
        >
          {showAdd ? 'Anuluj' : '+ Dodaj ratę'}
        </button>
      </div>

      {/* Podsumowanie */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryTile label="Planowane" value={plannedTotal} />
        <SummaryTile label="Zapłacone" value={paidTotal} valueClass="text-emerald-700" />
        <SummaryTile label="Pozostało" value={remaining} valueClass={remaining > 0 ? 'text-gray-900' : 'text-emerald-700'} />
        <SummaryTile
          label={`Zaległe${overdue.length ? ` (${overdue.length})` : ''}`}
          value={overdueSum}
          valueClass={overdueSum > 0 ? 'text-rose-600' : 'text-gray-400'}
        />
      </div>

      {showAdd && (
        <AddPaymentRow
          contractId={contractId}
          defaultToEscrow={contractType === 'DEWELOPERSKA'}
          onDone={() => { setShowAdd(false); router.refresh() }}
        />
      )}

      {payments.length === 0 && !showAdd ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          Brak rat w harmonogramie. Dodaj pierwszą klikając „+ Dodaj ratę".
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {payments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              escrowAccounts={escrowAccounts}
              today={today}
              onChange={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryTile({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-base font-semibold tabular-nums mt-0.5 ${valueClass || 'text-gray-900'}`}>{formatCurrency(value)}</p>
    </div>
  )
}

function PaymentRow({
  payment, escrowAccounts, today, onChange,
}: {
  payment: ContractPaymentRow
  escrowAccounts: { id: string; name: string }[]
  today: string
  onChange: () => void
}) {
  const [payOpen, setPayOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const isPaid = payment.status === 'OPLACONA'
  const isOverdue = !isPaid && payment.plannedDate && payment.plannedDate.slice(0, 10) < today

  const unpay = async () => {
    if (!confirm('Cofnąć odhaczenie? Powiązany wpis na rachunku powierniczym zostanie usunięty.')) return
    setBusy(true)
    await fetch(`/api/contracts/payments/${payment.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unpay' }),
    })
    setBusy(false); onChange()
  }

  const del = async () => {
    if (!confirm('Usunąć ratę z harmonogramu?')) return
    setBusy(true)
    await fetch(`/api/contracts/payments/${payment.id}`, { method: 'DELETE' })
    setBusy(false); onChange()
  }

  return (
    <div className={`py-3 ${isOverdue ? 'bg-rose-50/50 -mx-2 px-2 rounded' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{payment.title || TYPE_LABELS[payment.type] || 'Rata'}</span>
            <span className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{TYPE_LABELS[payment.type] || payment.type}</span>
            {payment.toEscrow && (
              <span className="text-[10px] bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">rachunek powierniczy</span>
            )}
            {isPaid ? (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5">✓ opłacona</span>
            ) : isOverdue ? (
              <span className="text-[10px] bg-rose-100 text-rose-700 rounded px-1.5 py-0.5">⚠ po terminie</span>
            ) : (
              <span className="text-[10px] bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">planowana</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {payment.plannedDate ? `Termin: ${payment.plannedDate.slice(0, 10)}` : 'Bez terminu'}
            {isPaid && payment.paidDate && <span className="text-emerald-700"> • zapłacono {payment.paidDate.slice(0, 10)}</span>}
            {payment.escrowDepositId && (
              <Link href="/finanse/finansowanie" className="text-indigo-600 hover:underline"> • na escrow ✓</Link>
            )}
            {payment.note && <span className="text-gray-400"> • {payment.note}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-gray-900 tabular-nums">
              {formatCurrency(isPaid && payment.paidAmount != null ? payment.paidAmount : payment.plannedAmount)}
            </div>
            {isPaid && payment.paidAmount != null && Math.abs(payment.paidAmount - payment.plannedAmount) > 0.01 && (
              <div className="text-[10px] text-gray-400 tabular-nums">plan: {formatCurrency(payment.plannedAmount)}</div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isPaid ? (
              <button onClick={unpay} disabled={busy} className="text-xs text-amber-600 hover:text-amber-800 px-2 py-1 disabled:opacity-50">Cofnij</button>
            ) : (
              <button onClick={() => setPayOpen((v) => !v)} disabled={busy} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-2.5 py-1 disabled:opacity-50">Odhacz</button>
            )}
            <button onClick={del} disabled={busy} className="text-rose-400 hover:text-rose-600 px-1.5">×</button>
          </div>
        </div>
      </div>

      {payOpen && !isPaid && (
        <PayForm
          payment={payment}
          escrowAccounts={escrowAccounts}
          onDone={() => { setPayOpen(false); onChange() }}
          onCancel={() => setPayOpen(false)}
        />
      )}
    </div>
  )
}

function PayForm({
  payment, escrowAccounts, onDone, onCancel,
}: {
  payment: ContractPaymentRow
  escrowAccounts: { id: string; name: string }[]
  onDone: () => void
  onCancel: () => void
}) {
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10))
  const [paidAmount, setPaidAmount] = useState(payment.plannedAmount.toFixed(2))
  const [escrowAccountId, setEscrowAccountId] = useState(escrowAccounts[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const needAccountChoice = payment.toEscrow && escrowAccounts.length > 1

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/contracts/payments/${payment.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pay',
          paidDate,
          paidAmount: parseFloat(paidAmount.replace(',', '.')),
          escrowAccountId: needAccountChoice ? escrowAccountId : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Błąd'); setBusy(false); return }
      if (data.warning) alert(data.warning)
      onDone()
    } catch (e: any) {
      setErr(e.message || 'Błąd sieci'); setBusy(false)
    }
  }

  return (
    <div className="mt-2 bg-emerald-50/60 border border-emerald-200 rounded-lg p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[11px] text-gray-600 mb-0.5">Data wpłaty</span>
          <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-[11px] text-gray-600 mb-0.5">Kwota wpłaty</span>
          <input type="number" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1 tabular-nums" />
        </label>
      </div>
      {needAccountChoice && (
        <label className="block mt-2">
          <span className="block text-[11px] text-gray-600 mb-0.5">Rachunek powierniczy</span>
          <select value={escrowAccountId} onChange={(e) => setEscrowAccountId(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1">
            {escrowAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
      {payment.toEscrow && escrowAccounts.length === 1 && (
        <p className="text-[11px] text-gray-500 mt-2">→ trafi na: <strong>{escrowAccounts[0].name}</strong></p>
      )}
      {payment.toEscrow && escrowAccounts.length === 0 && (
        <p className="text-[11px] text-amber-600 mt-2">⚠ Brak rachunku powierniczego MD — wpłata zostanie odhaczona, ale bez wpisu na escrow.</p>
      )}
      {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={submit} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg px-3 py-1.5 disabled:opacity-50">
          {busy ? 'Zapis...' : 'Potwierdź wpłatę'}
        </button>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-900 text-sm px-3 py-1.5">Anuluj</button>
      </div>
    </div>
  )
}

function AddPaymentRow({
  contractId, defaultToEscrow, onDone,
}: {
  contractId: string
  defaultToEscrow: boolean
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('RATA')
  const [plannedDate, setPlannedDate] = useState('')
  const [plannedAmount, setPlannedAmount] = useState('')
  const [toEscrow, setToEscrow] = useState(defaultToEscrow)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!plannedAmount) { setErr('Podaj kwotę'); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || undefined,
          type,
          plannedDate: plannedDate || undefined,
          plannedAmount: parseFloat(plannedAmount.replace(',', '.')),
          toEscrow,
          note: note || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Błąd'); setBusy(false); return }
      onDone()
    } catch (e: any) {
      setErr(e.message || 'Błąd sieci'); setBusy(false)
    }
  }

  return (
    <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block sm:col-span-2">
          <span className="block text-[11px] text-gray-600 mb-0.5">Nazwa raty (opcjonalna)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. I rata, Transza po stanie surowym" className="w-full text-sm border border-gray-300 rounded px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-[11px] text-gray-600 mb-0.5">Typ</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1">
            <option value="ZALICZKA">Zaliczka</option>
            <option value="RATA">Rata</option>
            <option value="KONCOWA">Końcowa</option>
            <option value="REZERWACYJNA">Rezerwacyjna</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] text-gray-600 mb-0.5">Kwota planowana</span>
          <input type="number" step="0.01" value={plannedAmount} onChange={(e) => setPlannedAmount(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1 tabular-nums" />
        </label>
        <label className="block">
          <span className="block text-[11px] text-gray-600 mb-0.5">Termin (opcjonalny)</span>
          <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1" />
        </label>
        <label className="flex items-center gap-2 sm:mt-5">
          <input type="checkbox" checked={toEscrow} onChange={(e) => setToEscrow(e.target.checked)} className="rounded" />
          <span className="text-xs text-gray-700">Wpłata na rachunek powierniczy</span>
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[11px] text-gray-600 mb-0.5">Notatka (opcjonalna)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1" />
        </label>
      </div>
      {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={submit} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-3 py-1.5 disabled:opacity-50">
          {busy ? 'Zapis...' : 'Dodaj ratę'}
        </button>
        <button onClick={onDone} className="text-gray-600 hover:text-gray-900 text-sm px-3 py-1.5">Anuluj</button>
      </div>
    </div>
  )
}
