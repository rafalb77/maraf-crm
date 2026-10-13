'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { fmtDate, fmtMoney } from '@/lib/finanse-format'
import { CHARGE_TYPE_LABELS, CHARGE_TYPE_COLORS, type ChargeItem, type ChargeType } from '@/lib/obciazenia-types'
import { MarkDepositReturnedButton } from '@/components/finanse/MarkDepositReturnedButton'

type Props = {
  label: string
  items: ChargeItem[]
  netKaucje: number
  netKb: number
  netPrad: number
  netKary: number
  netTotal: number
  overdueReturns: number
  isAdmin: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100
const TYPE_ORDER: ChargeType[] = ['KAUCJA', 'KB', 'KARA', 'PRAD']
// Kolory segmentow paska struktury (spojne z badge'ami typow).
const BAR_COLORS: Record<ChargeType, string> = {
  KAUCJA: 'bg-amber-400', KB: 'bg-blue-400', KARA: 'bg-rose-400', PRAD: 'bg-sky-400',
}

// Widok obciazen kontrahenta: KPI + pasek struktury, zakladki typow, tabela
// pozycji z CHECKBOXAMI (suma zaznaczonych netto/kwota na zywo), akcje
// (zwrot kaucji, rozliczenie/usuniecie kary) i formularz nowej kary.
export function ObciazeniaKontrahent(p: Props) {
  const [typeFilter, setTypeFilter] = useState<ChargeType | 'ALL'>('ALL')
  const [hideClosed, setHideClosed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: p.items.length }
    for (const t of TYPE_ORDER) c[t] = p.items.filter((i) => i.type === t).length
    return c
  }, [p.items])

  const visible = useMemo(() => p.items.filter((i) => {
    if (typeFilter !== 'ALL' && i.type !== typeFilter) return false
    if (hideClosed && (i.status === 'ZWROCONA' || i.status === 'ROZLICZONA')) return false
    return true
  }), [p.items, typeFilter, hideClosed])

  const sel = useMemo(() => visible.filter((i) => selected.has(i.key)), [visible, selected])
  const selNet = r2(sel.reduce((s, i) => s + i.amountNet, 0))
  const selAmount = r2(sel.reduce((s, i) => s + i.amount, 0))
  // Suma netto WIDOCZNYCH pozycji (wg aktywnego filtra) — do stopki.
  const visNet = r2(visible.reduce((s, i) => s + i.amountNet, 0))
  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.key))

  function toggle(key: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((i) => i.key)))
  }

  // Pasek struktury obciazen (proporcje netto aktywnych skladnikow).
  const barParts = [
    { t: 'KAUCJA' as ChargeType, v: p.netKaucje },
    { t: 'KB' as ChargeType, v: p.netKb },
    { t: 'KARA' as ChargeType, v: p.netKary },
    { t: 'PRAD' as ChargeType, v: p.netPrad },
  ].filter((x) => x.v > 0.004)

  return (
    <div>
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <Kpi label="Razem obciążenia netto" value={fmtMoney(p.netTotal)} bold />
        <Kpi label="Kaucje (trzymane)" value={fmtMoney(p.netKaucje)} sub={p.overdueReturns > 0 ? `⚠ ${p.overdueReturns} po terminie zwrotu` : undefined} warn={p.overdueReturns > 0} />
        <Kpi label="Koszty budowy" value={fmtMoney(p.netKb)} />
        <Kpi label="Kary (aktywne)" value={fmtMoney(p.netKary)} />
        <Kpi label="Prąd" value={fmtMoney(p.netPrad)} />
      </div>

      {/* Struktura obciazen */}
      {p.netTotal > 0.004 && (
        <div className="mb-5">
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
            {barParts.map((x) => (
              <div key={x.t} className={BAR_COLORS[x.t]} style={{ width: `${Math.max(2, (x.v / p.netTotal) * 100)}%` }} title={`${CHARGE_TYPE_LABELS[x.t]}: ${fmtMoney(x.v)}`} />
            ))}
          </div>
          <div className="flex gap-4 mt-1.5 text-[11px] text-gray-500 flex-wrap">
            {barParts.map((x) => (
              <span key={x.t} className="inline-flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-full ${BAR_COLORS[x.t]}`} />
                {CHARGE_TYPE_LABELS[x.t]} {Math.round((x.v / p.netTotal) * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Zakladki typow + opcje */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex flex-wrap gap-1">
          <TypeTab active={typeFilter === 'ALL'} onClick={() => setTypeFilter('ALL')} label={`Wszystkie (${counts.ALL})`} />
          {TYPE_ORDER.map((t) => (
            <TypeTab key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)} label={`${CHARGE_TYPE_LABELS[t]} (${counts[t]})`} />
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
          ukryj zwrócone/rozliczone
        </label>
      </div>

      {/* Nowa kara — osobny blok (przycisk / rozwiniety formularz) */}
      <div className="mb-3">
        <AddKaraButton label={p.label} />
      </div>

      {/* Pasek zaznaczonych */}
      {sel.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-3 flex items-center justify-between flex-wrap gap-2 text-sm">
          <span className="font-medium text-blue-900">Zaznaczono {sel.length} {sel.length === 1 ? 'pozycję' : 'pozycji'}</span>
          <span className="text-blue-900 flex items-center gap-4 flex-wrap">
            <span>Netto: <strong className="tabular-nums">{fmtMoney(selNet)}</strong></span>
            <span className="text-blue-700">Kwota potrąceń: <strong className="tabular-nums">{fmtMoney(selAmount)}</strong></span>
            <button onClick={() => setSelected(new Set())} className="text-blue-600 hover:text-blue-800 text-xs">wyczyść</button>
          </span>
        </div>
      )}

      {/* Tabela pozycji */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[880px] lg:min-w-0">
            <thead className="bg-gray-50 border-b border-gray-200 text-left">
              <tr>
                <th className="px-3 py-3 w-8"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} title="Zaznacz widoczne" /></th>
                <th className="px-3 py-3 font-medium text-gray-700">Typ</th>
                <th className="px-3 py-3 font-medium text-gray-700">Data</th>
                <th className="px-3 py-3 font-medium text-gray-700">Nr FV / noty</th>
                <th className="px-3 py-3 font-medium text-gray-700">Opis</th>
                <th className="px-3 py-3 font-medium text-gray-700">Status</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right" title="Kwota potrącenia (z płatności brutto); dla kar = netto">Kwota</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right">Netto</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                  Brak pozycji{typeFilter !== 'ALL' ? ` typu ${CHARGE_TYPE_LABELS[typeFilter as ChargeType]}` : ''}.
                  {typeFilter === 'KARA' && ' Dodaj karę przyciskiem „+ Dodaj karę".'}
                </td></tr>
              )}
              {visible.map((i) => {
                const closed = i.status === 'ZWROCONA' || i.status === 'ROZLICZONA'
                return (
                  <tr key={i.key} className={`${selected.has(i.key) ? 'bg-blue-50/50' : 'hover:bg-gray-50'} ${closed ? 'text-gray-400' : ''}`}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(i.key)} onChange={() => toggle(i.key)} /></td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CHARGE_TYPE_COLORS[i.type]}`}>
                        {CHARGE_TYPE_LABELS[i.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{fmtDate(i.date)}</td>
                    <td className="px-3 py-2.5">
                      {i.invoiceId ? (
                        <Link href={`/finanse/faktury/${i.invoiceId}`} className="text-blue-600 hover:underline font-mono text-xs">{i.number}</Link>
                      ) : (
                        <span className="font-mono text-xs">{i.number || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs max-w-[260px]">
                      {i.title || (i.pct != null ? `${i.pct}% z faktury` : '—')}
                      {i.notes && <div className="text-gray-400 truncate" title={i.notes}>{i.notes}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {i.status === 'AKTYWNA' && i.type === 'KAUCJA' && <>trzymana{i.returnDate && <span className="text-gray-400"> • zwrot {fmtDate(i.returnDate)}</span>}</>}
                      {i.status === 'AKTYWNA' && i.type === 'KARA' && <span className="text-rose-700 font-medium">aktywna</span>}
                      {i.status === 'PO_TERMINIE' && <span className="text-red-600 font-semibold">⚠ po terminie zwrotu {i.returnDate ? `(${fmtDate(i.returnDate)})` : ''}</span>}
                      {i.status === 'ZWROCONA' && <span className="text-green-700">✓ zwrócona {i.returnedAt ? fmtDate(i.returnedAt) : ''}</span>}
                      {i.status === 'ROZLICZONA' && <span className="text-green-700">✓ rozliczona {i.settledAt ? fmtDate(i.settledAt) : ''}</span>}
                      {i.status === null && <span className="text-gray-400">potrącone</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(i.amount)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${closed ? '' : 'text-gray-900'}`}>{fmtMoney(i.amountNet)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {i.type === 'KAUCJA' && (i.status === 'AKTYWNA' || i.status === 'PO_TERMINIE') && i.invoiceId && (
                        <MarkDepositReturnedButton invoiceId={i.invoiceId} />
                      )}
                      {i.type === 'KARA' && i.chargeId && <KaraActions chargeId={i.chargeId} settled={!!i.settledAt} isAdmin={p.isAdmin} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {visible.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-gray-900">
                <tr>
                  <td colSpan={7} className="px-3 py-3">
                    Suma widocznych ({visible.length}){hideClosed ? ' — bez zwróconych/rozliczonych' : ''}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(visNet)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Zaznacz pozycje checkboxami, aby zsumować dowolny wybór (np. kaucje do zwrotu w tym kwartale).
        Netto pozycji z faktur = kwota ÷ (1 + VAT faktury); kary wpisywane są od razu netto.
      </p>
    </div>
  )
}

function Kpi({ label, value, sub, bold, warn }: { label: string; value: string; sub?: string; bold?: boolean; warn?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${warn ? 'border-red-200' : 'border-gray-200'}`}>
      <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
      <p className={`tabular-nums mt-1 ${bold ? 'text-xl font-bold' : 'text-lg font-semibold'} text-gray-900`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${warn ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  )
}

function TypeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}

// Formularz nowej kary (kwota NETTO) — rozwijany przyciskiem.
function AddKaraButton({ label }: { label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [ref, setRef] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch('/api/finanse/vendor-charges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vendorLabel: label, title, amountNet: amount, chargedAt: date, invoiceNumber: ref || null, notes: notes || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Błąd zapisu'); return }
      setOpen(false)
      setTitle(''); setAmount(''); setRef(''); setNotes('')
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
        + Dodaj karę
      </button>
    )
  }
  return (
    <div className="w-full bg-white border border-rose-300 rounded-xl p-4">
      <p className="text-sm font-semibold text-gray-900 mb-3">Nowa kara — {label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-2">
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Tytuł *</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Kara umowna — opóźnienie etapu II" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Kwota netto *</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="zł" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Nr noty (opc.)</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
        </div>
        <div className="lg:col-span-3">
          <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Notatka (opc.)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={saving || !title.trim() || !amount.trim()} className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Zapisuję…' : 'Zapisz karę'}
        </button>
        <button onClick={() => { setOpen(false); setError(null) }} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Anuluj</button>
      </div>
    </div>
  )
}

// Akcje kary: rozlicz / cofnij rozliczenie; usuwanie tylko admin.
function KaraActions({ chargeId, settled, isAdmin }: { chargeId: string; settled: boolean; isAdmin: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function patch(body: any) {
    setBusy(true)
    try {
      const r = await fetch(`/api/finanse/vendor-charges/${chargeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) router.refresh()
      else { const d = await r.json().catch(() => ({})); alert(d.error || 'Błąd') }
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!confirm('Usunąć to obciążenie? (operacja nieodwracalna)')) return
    setBusy(true)
    try {
      const r = await fetch(`/api/finanse/vendor-charges/${chargeId}`, { method: 'DELETE' })
      if (r.ok) router.refresh()
      else { const d = await r.json().catch(() => ({})); alert(d.error || 'Błąd') }
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {settled ? (
        <button onClick={() => patch({ settled: false })} disabled={busy} className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50">cofnij rozliczenie</button>
      ) : (
        <button onClick={() => patch({ settled: true })} disabled={busy} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50" title="Kara potrącona/zapłacona">
          Rozlicz
        </button>
      )}
      {isAdmin && <button onClick={remove} disabled={busy} className="text-red-400 hover:text-red-600 text-sm disabled:opacity-50" title="Usuń (admin)">✗</button>}
    </span>
  )
}
