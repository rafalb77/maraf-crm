'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtMoney } from '@/lib/finanse-format'

// === TYPY (te same co w page.tsx server component) ===

export type LoanRow = {
  id: string
  name: string
  bank: string
  contractNumber: string | null
  type: string  // INWESTYCYJNY | VAT | OBROTOWY | INNE
  limit: number
  interestRate: number | null
  signedAt: string
  expiresAt: string | null
  status: string
  notes: string | null
  drawn: number
  principalRepaid: number
  interestPaid: number
  feesPaid: number
  outstanding: number
  available: number
  tranches: { id: string; date: string; amount: number; note: string | null }[]
  repayments: { id: string; date: string; principal: number; interest: number; fees: number; note: string | null }[]
}

export type EscrowRow = {
  id: string
  name: string
  bank: string
  accountNumber: string | null
  type: string
  investmentName: string | null
  status: string
  notes: string | null
  depositsTotal: number
  releasesTotal: number
  balance: number
  deposits: { id: string; date: string; amount: number; buyerName: string | null; contractNumber: string | null; unitNumber: string | null; note: string | null }[]
  releases: { id: string; date: string; amount: number; milestone: string | null; note: string | null }[]
}

export type RefundRow = {
  id: string
  date: string
  amount: number
  periodLabel: string | null
  note: string | null
  appliedToLoan: { id: string; name: string; type: string } | null
}

type Tab = 'loans' | 'escrow' | 'vat'

export function FinansowanieView({
  loans, escrows, refunds, vatLoans,
}: {
  loans: LoanRow[]
  escrows: EscrowRow[]
  refunds: RefundRow[]
  vatLoans: { id: string; name: string }[]
}) {
  const [tab, setTab] = useState<Tab>('loans')

  const loansByType = {
    INWESTYCYJNY: loans.filter((l) => l.type === 'INWESTYCYJNY'),
    VAT: loans.filter((l) => l.type === 'VAT'),
    OBROTOWY: loans.filter((l) => l.type === 'OBROTOWY'),
    INNE: loans.filter((l) => l.type === 'INNE'),
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finansowanie inwestycji</h1>
        <p className="text-gray-500 text-sm mt-1">Kredyty, rachunki powiernicze, zwroty VAT — Maraf Development</p>
      </div>

      {/* Taby */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 flex-wrap">
        <TabBtn active={tab === 'loans'} onClick={() => setTab('loans')}>
          Kredyty <Badge>{loans.length}</Badge>
        </TabBtn>
        <TabBtn active={tab === 'escrow'} onClick={() => setTab('escrow')}>
          Rachunki powiernicze <Badge>{escrows.length}</Badge>
        </TabBtn>
        <TabBtn active={tab === 'vat'} onClick={() => setTab('vat')}>
          Zwroty VAT <Badge>{refunds.length}</Badge>
        </TabBtn>
      </div>

      {tab === 'loans' && <LoansTab loansByType={loansByType} />}
      {tab === 'escrow' && <EscrowTab escrows={escrows} />}
      {tab === 'vat' && <VatTab refunds={refunds} vatLoans={vatLoans} />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
      }`}
    >{children}</button>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="ml-1.5 inline-block bg-gray-200 text-gray-700 text-xs rounded-full px-2 py-0.5">{children}</span>
}

// ========================================================================
// ZAKŁADKA: KREDYTY
// ========================================================================

const TYPE_LABELS: Record<string, string> = {
  INWESTYCYJNY: 'Inwestycyjne',
  VAT: 'VAT',
  OBROTOWY: 'Obrotowe',
  INNE: 'Inne',
}

const TYPE_COLORS: Record<string, string> = {
  INWESTYCYJNY: 'bg-blue-50 text-blue-700 border-blue-200',
  VAT: 'bg-purple-50 text-purple-700 border-purple-200',
  OBROTOWY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INNE: 'bg-gray-100 text-gray-700 border-gray-200',
}

function LoansTab({ loansByType }: { loansByType: Record<string, LoanRow[]> }) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-gray-500">
          Suma limitów:{' '}
          <strong className="text-gray-900 tabular-nums">
            {fmtMoney(Object.values(loansByType).flat().reduce((s, l) => s + l.limit, 0))}
          </strong>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          {showForm ? 'Anuluj' : '+ Nowy kredyt'}
        </button>
      </div>

      {showForm && <LoanForm onDone={() => setShowForm(false)} />}

      {(['INWESTYCYJNY', 'VAT', 'OBROTOWY', 'INNE'] as const).map((type) => {
        const list = loansByType[type]
        if (list.length === 0) return null
        return (
          <div key={type}>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${TYPE_COLORS[type]}`}>
                {TYPE_LABELS[type]}
              </span>
              <span className="text-xs text-gray-400">{list.length}</span>
            </h2>
            <div className="space-y-3">
              {list.map((l) => <LoanCard key={l.id} loan={l} />)}
            </div>
          </div>
        )
      })}

      {Object.values(loansByType).flat().length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          Brak kredytów. Dodaj pierwszy klikając „+ Nowy kredyt".
        </div>
      )}
    </div>
  )
}

function LoanCard({ loan }: { loan: LoanRow }) {
  const [expanded, setExpanded] = useState(false)
  const usagePct = loan.limit > 0 ? Math.round((loan.outstanding / loan.limit) * 100) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Nagłówek */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 hover:bg-gray-50 text-left"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{loan.name}</h3>
              <span className="text-xs text-gray-500">{loan.bank}</span>
              {loan.contractNumber && <span className="text-xs text-gray-400">• {loan.contractNumber}</span>}
              {loan.status !== 'AKTYWNY' && (
                <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">{loan.status}</span>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Limit: <strong className="text-gray-900 tabular-nums">{fmtMoney(loan.limit)}</strong>
              {loan.interestRate != null && <span> • {loan.interestRate}%</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-gray-500">Do spłaty</div>
            <div className="text-lg font-bold text-gray-900 tabular-nums">{fmtMoney(loan.outstanding)}</div>
            <div className="text-xs text-gray-400">dostępne {fmtMoney(loan.available)}</div>
          </div>
        </div>

        {/* Pasek wykorzystania */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
            <span>Wykorzystanie</span>
            <span className="tabular-nums">{usagePct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full ${usagePct > 80 ? 'bg-rose-500' : usagePct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, usagePct)}%` }}
            />
          </div>
        </div>
      </button>

      {expanded && <LoanDetails loan={loan} />}
    </div>
  )
}

function LoanDetails({ loan }: { loan: LoanRow }) {
  return (
    <div className="border-t border-gray-200 bg-gray-50 px-5 py-4 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <LoanTranchesSection loan={loan} />
        <LoanRepaymentsSection loan={loan} />
      </div>
      {loan.notes && (
        <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded p-2">
          <strong className="text-gray-700">Notatki:</strong> {loan.notes}
        </div>
      )}
    </div>
  )
}

function LoanTranchesSection({ loan }: { loan: LoanRow }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!date || !amount) return
    setSaving(true)
    try {
      const res = await fetch(`/api/finanse/loans/${loan.id}/tranches`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, amount: parseFloat(amount), note: note || undefined }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Błąd'); return }
      setAmount(''); setNote(''); setShowForm(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Usunąć transzę?')) return
    await fetch(`/api/finanse/loan-tranches/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-700">Transze (wypłaty)</h4>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-blue-600 hover:underline">
          {showForm ? 'anuluj' : '+ transza'}
        </button>
      </div>
      <div className="text-xs text-gray-500 mb-2">
        Wypłacono łącznie: <strong className="text-gray-900 tabular-nums">{fmtMoney(loan.drawn)}</strong>
      </div>
      {showForm && (
        <div className="bg-gray-50 rounded p-2 mb-2 space-y-1.5">
          <div className="flex gap-1.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" />
            <input type="number" step="0.01" placeholder="kwota" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 text-xs border border-gray-300 rounded px-2 py-1 tabular-nums" />
          </div>
          <input type="text" placeholder="notatka (opcjonalna)" value={note} onChange={(e) => setNote(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1" />
          <button onClick={submit} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs rounded py-1.5 disabled:opacity-50">
            {saving ? 'Zapis...' : 'Zapisz transzę'}
          </button>
        </div>
      )}
      {loan.tranches.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Brak transz.</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {loan.tranches.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 tabular-nums w-20">{t.date.slice(0, 10)}</span>
              <span className="font-medium tabular-nums flex-1">{fmtMoney(t.amount)}</span>
              {t.note && <span className="text-gray-400 truncate" title={t.note}>{t.note}</span>}
              <button onClick={() => del(t.id)} className="text-rose-500 hover:text-rose-700">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LoanRepaymentsSection({ loan }: { loan: LoanRow }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [principal, setPrincipal] = useState('')
  const [interest, setInterest] = useState('')
  const [fees, setFees] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!date) return
    const p = parseFloat(principal) || 0
    const i = parseFloat(interest) || 0
    const f = parseFloat(fees) || 0
    if (p + i + f <= 0) { alert('Wpisz przynajmniej jedną kwotę'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/finanse/loans/${loan.id}/repayments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, principal: p, interest: i, fees: f, note: note || undefined }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Błąd'); return }
      setPrincipal(''); setInterest(''); setFees(''); setNote(''); setShowForm(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Usunąć spłatę?')) return
    await fetch(`/api/finanse/loan-repayments/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-700">Spłaty</h4>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-blue-600 hover:underline">
          {showForm ? 'anuluj' : '+ spłata'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-500 mb-2">
        <div>Kapitał: <strong className="text-gray-900 tabular-nums block">{fmtMoney(loan.principalRepaid)}</strong></div>
        <div>Odsetki: <strong className="text-gray-900 tabular-nums block">{fmtMoney(loan.interestPaid)}</strong></div>
        <div>Prowizje: <strong className="text-gray-900 tabular-nums block">{fmtMoney(loan.feesPaid)}</strong></div>
      </div>
      {showForm && (
        <div className="bg-gray-50 rounded p-2 mb-2 space-y-1.5">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1" />
          <div className="grid grid-cols-3 gap-1.5">
            <input type="number" step="0.01" placeholder="kapitał" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1 tabular-nums" />
            <input type="number" step="0.01" placeholder="odsetki" value={interest} onChange={(e) => setInterest(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1 tabular-nums" />
            <input type="number" step="0.01" placeholder="prowizje" value={fees} onChange={(e) => setFees(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1 tabular-nums" />
          </div>
          <input type="text" placeholder="notatka (opcjonalna)" value={note} onChange={(e) => setNote(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1" />
          <button onClick={submit} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs rounded py-1.5 disabled:opacity-50">
            {saving ? 'Zapis...' : 'Zapisz spłatę'}
          </button>
        </div>
      )}
      {loan.repayments.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Brak spłat.</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {loan.repayments.map((r) => (
            <div key={r.id} className="text-xs border-b border-gray-100 pb-1 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 tabular-nums w-20">{r.date.slice(0, 10)}</span>
                <span className="font-medium tabular-nums flex-1">{fmtMoney(r.principal + r.interest + r.fees)}</span>
                <button onClick={() => del(r.id)} className="text-rose-500 hover:text-rose-700">×</button>
              </div>
              <div className="text-[10px] text-gray-400 ml-20">
                K {fmtMoney(r.principal)} • O {fmtMoney(r.interest)} • P {fmtMoney(r.fees)}
                {r.note && ` • ${r.note}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LoanForm({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '', bank: '', contractNumber: '', type: 'INWESTYCYJNY',
    limit: '', interestRate: '', signedAt: new Date().toISOString().slice(0, 10), expiresAt: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name || !form.bank || !form.limit || !form.signedAt) {
      alert('Wypełnij nazwę, bank, limit i datę podpisania')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/finanse/loans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, bank: form.bank,
          contractNumber: form.contractNumber || undefined,
          type: form.type, limit: parseFloat(form.limit),
          interestRate: form.interestRate ? parseFloat(form.interestRate) : undefined,
          signedAt: form.signedAt,
          expiresAt: form.expiresAt || undefined,
          notes: form.notes || undefined,
        }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Błąd'); return }
      onDone()
      router.refresh()
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-3">Nowy kredyt</h3>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <Field label="Nazwa">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="np. Kredyt inwestycyjny ING 2026"
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
        <Field label="Bank">
          <input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}
            placeholder="np. ING Bank Śląski"
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
        <Field label="Typ kredytu">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1.5">
            <option value="INWESTYCYJNY">Inwestycyjny</option>
            <option value="VAT">VAT</option>
            <option value="OBROTOWY">Obrotowy</option>
            <option value="INNE">Inne</option>
          </select>
        </Field>
        <Field label="Numer umowy">
          <input value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })}
            placeholder="opcjonalny"
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
        <Field label="Limit kredytu (zł)">
          <input type="number" step="0.01" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1.5 tabular-nums" />
        </Field>
        <Field label="Oprocentowanie (%)">
          <input type="number" step="0.01" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
            placeholder="opcjonalne"
            className="w-full border border-gray-300 rounded px-2 py-1.5 tabular-nums" />
        </Field>
        <Field label="Data podpisania">
          <input type="date" value={form.signedAt} onChange={(e) => setForm({ ...form, signedAt: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
        <Field label="Data wygaśnięcia">
          <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
        <Field label="Notatki" wide>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">
          {saving ? 'Zapis...' : 'Zapisz kredyt'}
        </button>
        <button onClick={onDone} className="text-gray-600 hover:text-gray-900 text-sm px-4 py-2">Anuluj</button>
      </div>
    </div>
  )
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  )
}

// ========================================================================
// ZAKŁADKA: RACHUNKI POWIERNICZE (ESCROW)
// ========================================================================

function EscrowTab({ escrows }: { escrows: EscrowRow[] }) {
  const [showForm, setShowForm] = useState(false)

  const totalBalance = escrows.reduce((s, e) => s + e.balance, 0)
  const totalReleased = escrows.reduce((s, e) => s + e.releasesTotal, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-gray-500 space-x-4">
          <span>W escrow: <strong className="text-gray-900 tabular-nums">{fmtMoney(totalBalance)}</strong></span>
          <span>Uwolnione łącznie: <strong className="text-gray-900 tabular-nums">{fmtMoney(totalReleased)}</strong></span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          {showForm ? 'Anuluj' : '+ Nowy rachunek'}
        </button>
      </div>

      {showForm && <EscrowAccountForm onDone={() => setShowForm(false)} />}

      {escrows.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          Brak rachunków powierniczych. Dodaj pierwszy klikając „+ Nowy rachunek".
        </div>
      )}

      {escrows.map((a) => <EscrowCard key={a.id} account={a} />)}
    </div>
  )
}

function EscrowCard({ account }: { account: EscrowRow }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full px-5 py-4 hover:bg-gray-50 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">{account.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded border ${account.type === 'OMRP' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>{account.type}</span>
              <span className="text-xs text-gray-500">{account.bank}</span>
              {account.investmentName && <span className="text-xs text-gray-400">• {account.investmentName}</span>}
            </div>
            {account.accountNumber && <div className="mt-1 text-xs text-gray-400 font-mono">{account.accountNumber}</div>}
          </div>
          <div className="text-right shrink-0 grid grid-cols-3 gap-3 items-center">
            <div>
              <div className="text-[10px] text-gray-500">Wpłaty</div>
              <div className="text-sm font-semibold text-gray-700 tabular-nums">{fmtMoney(account.depositsTotal)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500">Uwolnione</div>
              <div className="text-sm font-semibold text-emerald-700 tabular-nums">{fmtMoney(account.releasesTotal)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500">Saldo</div>
              <div className="text-base font-bold text-gray-900 tabular-nums">{fmtMoney(account.balance)}</div>
            </div>
          </div>
        </div>
      </button>
      {expanded && <EscrowDetails account={account} />}
    </div>
  )
}

function EscrowDetails({ account }: { account: EscrowRow }) {
  return (
    <div className="border-t border-gray-200 bg-gray-50 px-5 py-4 grid md:grid-cols-2 gap-4">
      <EscrowDepositsSection account={account} />
      <EscrowReleasesSection account={account} />
    </div>
  )
}

function EscrowDepositsSection({ account }: { account: EscrowRow }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [contractNumber, setContractNumber] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!date || !amount) return
    setSaving(true)
    try {
      let unitId: string | undefined
      if (unitNumber) {
        // Spróbuj odnaleźć Unit po numerze
        const r = await fetch(`/api/units?number=${encodeURIComponent(unitNumber)}`)
        if (r.ok) {
          const list = await r.json()
          if (Array.isArray(list) && list[0]) unitId = list[0].id
        }
      }
      const res = await fetch(`/api/finanse/escrow-accounts/${account.id}/deposits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, amount: parseFloat(amount),
          buyerName: buyerName || undefined,
          contractNumber: contractNumber || undefined,
          unitId,
          note: note || undefined,
        }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Błąd'); return }
      setAmount(''); setBuyerName(''); setContractNumber(''); setUnitNumber(''); setNote(''); setShowForm(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Usunąć wpłatę?')) return
    await fetch(`/api/finanse/escrow-deposits/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-700">Wpłaty nabywców</h4>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-blue-600 hover:underline">
          {showForm ? 'anuluj' : '+ wpłata'}
        </button>
      </div>
      {showForm && (
        <div className="bg-gray-50 rounded p-2 mb-2 space-y-1.5">
          <div className="flex gap-1.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" />
            <input type="number" step="0.01" placeholder="kwota" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 text-xs border border-gray-300 rounded px-2 py-1 tabular-nums" />
          </div>
          <input type="text" placeholder="nabywca (imię i nazwisko)" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1" />
          <div className="grid grid-cols-2 gap-1.5">
            <input type="text" placeholder="nr umowy" value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1" />
            <input type="text" placeholder="nr lokalu (np. B1.2.M18)" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <input type="text" placeholder="notatka (opcjonalna)" value={note} onChange={(e) => setNote(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1" />
          <button onClick={submit} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs rounded py-1.5 disabled:opacity-50">
            {saving ? 'Zapis...' : 'Zapisz wpłatę'}
          </button>
        </div>
      )}
      {account.deposits.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Brak wpłat.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {account.deposits.map((d) => (
            <div key={d.id} className="text-xs border-b border-gray-100 pb-1.5 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 tabular-nums w-20">{d.date.slice(0, 10)}</span>
                <span className="font-medium tabular-nums flex-1">{fmtMoney(d.amount)}</span>
                <button onClick={() => del(d.id)} className="text-rose-500 hover:text-rose-700">×</button>
              </div>
              {(d.buyerName || d.contractNumber || d.unitNumber) && (
                <div className="text-[10px] text-gray-400 ml-20">
                  {d.buyerName && <span>{d.buyerName}</span>}
                  {d.contractNumber && <span> • {d.contractNumber}</span>}
                  {d.unitNumber && <span> • {d.unitNumber}</span>}
                </div>
              )}
              {d.note && <div className="text-[10px] text-gray-400 ml-20 italic">{d.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EscrowReleasesSection({ account }: { account: EscrowRow }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [milestone, setMilestone] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!date || !amount) return
    setSaving(true)
    try {
      const res = await fetch(`/api/finanse/escrow-accounts/${account.id}/releases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, amount: parseFloat(amount), milestone: milestone || undefined, note: note || undefined }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Błąd'); return }
      setAmount(''); setMilestone(''); setNote(''); setShowForm(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Usunąć uwolnienie?')) return
    await fetch(`/api/finanse/escrow-releases/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-700">Uwolnienia transz</h4>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-blue-600 hover:underline">
          {showForm ? 'anuluj' : '+ uwolnienie'}
        </button>
      </div>
      {showForm && (
        <div className="bg-gray-50 rounded p-2 mb-2 space-y-1.5">
          <div className="flex gap-1.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" />
            <input type="number" step="0.01" placeholder="kwota" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 text-xs border border-gray-300 rounded px-2 py-1 tabular-nums" />
          </div>
          <input type="text" placeholder="milestone (np. stan surowy zamknięty)" value={milestone} onChange={(e) => setMilestone(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1" />
          <input type="text" placeholder="notatka (opcjonalna)" value={note} onChange={(e) => setNote(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1" />
          <button onClick={submit} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs rounded py-1.5 disabled:opacity-50">
            {saving ? 'Zapis...' : 'Zapisz uwolnienie'}
          </button>
        </div>
      )}
      {account.releases.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Brak uwolnień.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {account.releases.map((r) => (
            <div key={r.id} className="text-xs border-b border-gray-100 pb-1.5 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 tabular-nums w-20">{r.date.slice(0, 10)}</span>
                <span className="font-medium text-emerald-700 tabular-nums flex-1">{fmtMoney(r.amount)}</span>
                <button onClick={() => del(r.id)} className="text-rose-500 hover:text-rose-700">×</button>
              </div>
              {(r.milestone || r.note) && (
                <div className="text-[10px] text-gray-400 ml-20">
                  {r.milestone && <span>{r.milestone}</span>}
                  {r.note && <span className="italic"> • {r.note}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EscrowAccountForm({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', bank: '', accountNumber: '', type: 'OMRP', investmentName: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name || !form.bank) { alert('Wypełnij nazwę i bank'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/finanse/escrow-accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, bank: form.bank,
          accountNumber: form.accountNumber || undefined,
          type: form.type,
          investmentName: form.investmentName || undefined,
          notes: form.notes || undefined,
        }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Błąd'); return }
      onDone(); router.refresh()
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-3">Nowy rachunek powierniczy</h3>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <Field label="Nazwa">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="np. OMRP Nova Staffa etap 1"
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
        <Field label="Bank">
          <input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
        <Field label="Typ">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1.5">
            <option value="OMRP">OMRP — otwarty mieszkaniowy</option>
            <option value="ZMRP">ZMRP — zamknięty mieszkaniowy</option>
          </select>
        </Field>
        <Field label="Inwestycja">
          <input value={form.investmentName} onChange={(e) => setForm({ ...form, investmentName: e.target.value })}
            placeholder="np. Nova Staffa etap 1"
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
        <Field label="Numer rachunku" wide>
          <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            placeholder="opcjonalny"
            className="w-full border border-gray-300 rounded px-2 py-1.5 font-mono text-xs" />
        </Field>
        <Field label="Notatki" wide>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2} className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </Field>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">
          {saving ? 'Zapis...' : 'Zapisz rachunek'}
        </button>
        <button onClick={onDone} className="text-gray-600 hover:text-gray-900 text-sm px-4 py-2">Anuluj</button>
      </div>
    </div>
  )
}

// ========================================================================
// ZAKŁADKA: ZWROTY VAT
// ========================================================================

function VatTab({ refunds, vatLoans }: { refunds: RefundRow[]; vatLoans: { id: string; name: string }[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [periodLabel, setPeriodLabel] = useState('')
  const [appliedToLoanId, setAppliedToLoanId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const totalYTD = refunds
    .filter((r) => new Date(r.date).getFullYear() === new Date().getFullYear())
    .reduce((s, r) => s + r.amount, 0)
  const totalAppliedToLoan = refunds.filter((r) => r.appliedToLoan).reduce((s, r) => s + r.amount, 0)

  const submit = async () => {
    if (!date || !amount) return
    setSaving(true)
    try {
      const res = await fetch('/api/finanse/vat-refunds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, amount: parseFloat(amount),
          periodLabel: periodLabel || undefined,
          appliedToLoanId: appliedToLoanId || undefined,
          note: note || undefined,
        }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Błąd'); return }
      setAmount(''); setPeriodLabel(''); setAppliedToLoanId(''); setNote(''); setShowForm(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Usunąć zwrot VAT?')) return
    await fetch(`/api/finanse/vat-refunds/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-gray-500 space-x-4">
          <span>YTD: <strong className="text-gray-900 tabular-nums">{fmtMoney(totalYTD)}</strong></span>
          <span>Na spłatę kredytu VAT: <strong className="text-gray-900 tabular-nums">{fmtMoney(totalAppliedToLoan)}</strong></span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          {showForm ? 'Anuluj' : '+ Nowy zwrot'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-blue-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Nowy zwrot VAT</h3>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <Field label="Data">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </Field>
            <Field label="Kwota (zł)">
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 tabular-nums" />
            </Field>
            <Field label="Okres VAT">
              <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="np. maj 2026, Q2 2026" className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </Field>
            <Field label="Przeznaczenie">
              <select value={appliedToLoanId} onChange={(e) => setAppliedToLoanId(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5">
                <option value="">Na konto operacyjne</option>
                {vatLoans.map((l) => <option key={l.id} value={l.id}>Spłata: {l.name}</option>)}
              </select>
            </Field>
            <Field label="Notatka" wide>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5" />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">
              {saving ? 'Zapis...' : 'Zapisz zwrot'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-gray-600 hover:text-gray-900 text-sm px-4 py-2">Anuluj</button>
          </div>
        </div>
      )}

      {refunds.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          Brak zwrotów VAT. Marta wpisuje gdy US dokona zwrotu.
        </div>
      )}

      {refunds.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] lg:min-w-0 text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Okres</th>
                  <th className="px-4 py-2 text-right">Kwota</th>
                  <th className="px-4 py-2">Przeznaczenie</th>
                  <th className="px-4 py-2">Notatka</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {refunds.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700 tabular-nums">{r.date.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-gray-600 text-xs">{r.periodLabel || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{fmtMoney(r.amount)}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.appliedToLoan ? (
                        <span className="bg-purple-50 text-purple-700 rounded px-2 py-0.5">Spłata: {r.appliedToLoan.name}</span>
                      ) : (
                        <span className="text-gray-500">Na konto operacyjne</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.note || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => del(r.id)} className="text-rose-500 hover:text-rose-700 text-sm">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
