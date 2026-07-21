import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtDate, fmtMoney, fmtDaysFromNow, isOverdue, payableAmount } from '@/lib/finanse-format'
import { getActiveCompany } from '@/lib/finanse-company'
import {
  COMPANY_LABELS,
  PURCHASE_INVOICE_CATEGORIES,
  PURCHASE_INVOICE_CATEGORY_LABELS,
  type PurchaseInvoiceCategory,
} from '@/lib/types'
import { QuickPaymentCell } from '@/components/finanse/QuickPaymentCell'

type SearchParams = {
  q?: string
  vendor?: string
  category?: string
  horizon?: string   // liczba dni | 'all' (default 30)
  overdue?: string   // '1' = tylko po terminie
  sort?: string      // klucz SORTS (default dueDate-asc)
  group?: string     // termin | vendor | category | none (default termin)
}

const PAYABLE_STATUSES = ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA']
const DEFAULT_HORIZON = 30

const SORTS: Record<string, string> = {
  'dueDate-asc': 'Termin — po terminie najpierw',
  'dueDate-desc': 'Termin — najpóźniejsze',
  'amount-desc': 'Do zapłaty — od największych',
  'amount-asc': 'Do zapłaty — od najmniejszych',
  'vendor-asc': 'Kontrahent A→Z',
  'issueDate-asc': 'Wystawienie — najstarsze',
}
const DEFAULT_SORT = 'dueDate-asc'

const GROUPS: Record<string, string> = {
  termin: 'Wg terminu',
  vendor: 'Wg kontrahenta',
  category: 'Wg kategorii',
  none: 'Lista',
}
const DEFAULT_GROUP = 'termin'

const HORIZON_OPTIONS: { value: string; label: string }[] = [
  { value: '7', label: '7 dni' },
  { value: '14', label: '14 dni' },
  { value: '30', label: '30 dni' },
  { value: '60', label: '60 dni' },
  { value: 'all', label: 'Wszystko' },
]

export default async function KolejkaPlatnosciPage({ searchParams }: { searchParams: SearchParams }) {
  const company = getActiveCompany()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const group = searchParams.group && GROUPS[searchParams.group] ? searchParams.group : DEFAULT_GROUP
  const sort = searchParams.sort && SORTS[searchParams.sort] ? searchParams.sort : DEFAULT_SORT
  const horizonRaw = searchParams.horizon || String(DEFAULT_HORIZON)
  const horizonDays = horizonRaw === 'all' ? null : (parseInt(horizonRaw, 10) || DEFAULT_HORIZON)
  const horizonDate = horizonDays != null ? new Date(today.getTime() + horizonDays * 86400000) : null
  const q = (searchParams.q || '').trim()
  const overdueOnly = searchParams.overdue === '1'

  // --- where ---
  const filters: any[] = [{ company }, { status: { in: PAYABLE_STATUSES } }]
  // Horyzont: termin <= dzis+N lub bez terminu. Przeterminowane (< dzis) zawsze
  // sie mieszcza. 'all' = bez ograniczenia terminu.
  if (horizonDate) filters.push({ OR: [{ dueDate: { lte: horizonDate } }, { dueDate: null }] })
  if (overdueOnly) filters.push({ dueDate: { lt: today } })
  if (q) {
    filters.push({
      OR: [
        { number: { contains: q, mode: 'insensitive' } },
        { subVendor: { contains: q, mode: 'insensitive' } },
        { vendor: { name: { contains: q, mode: 'insensitive' } } },
      ],
    })
  }
  if (searchParams.vendor) {
    const fv = await prisma.vendor.findUnique({ where: { id: searchParams.vendor }, select: { name: true } })
    filters.push(fv
      ? { OR: [{ vendorId: searchParams.vendor }, { subVendor: { equals: fv.name.trim(), mode: 'insensitive' } }] }
      : { vendorId: searchParams.vendor })
  }
  if (searchParams.category && (PURCHASE_INVOICE_CATEGORIES as readonly string[]).includes(searchParams.category)) {
    filters.push({ category: searchParams.category })
  }

  const [invoices, vendors] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: { AND: filters },
      include: { vendor: { select: { id: true, name: true } }, payments: { select: { amount: true } } },
    }),
    prisma.vendor.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  type Row = (typeof invoices)[number]
  const remaining = (inv: Row) => Math.round((payableAmount(inv) - inv.payments.reduce((s, p) => s + p.amount, 0)) * 100) / 100

  // --- sortowanie (w JS — obejmuje kwote liczona z payableAmount) ---
  const dAsc = (d: Date | null) => (d ? d.getTime() : Infinity)   // null na koniec
  const dDesc = (d: Date | null) => (d ? d.getTime() : -Infinity) // null na koniec
  const comparators: Record<string, (a: Row, b: Row) => number> = {
    'dueDate-asc': (a, b) => dAsc(a.dueDate) - dAsc(b.dueDate) || a.issueDate.getTime() - b.issueDate.getTime(),
    'dueDate-desc': (a, b) => dDesc(b.dueDate) - dDesc(a.dueDate),
    'amount-desc': (a, b) => remaining(b) - remaining(a),
    'amount-asc': (a, b) => remaining(a) - remaining(b),
    'vendor-asc': (a, b) => a.vendor.name.localeCompare(b.vendor.name, 'pl', { sensitivity: 'base' }),
    'issueDate-asc': (a, b) => a.issueDate.getTime() - b.issueDate.getTime(),
  }
  const sortRows = (rows: Row[]) => [...rows].sort(comparators[sort])

  const totalRemaining = invoices.reduce((s, r) => s + remaining(r), 0)
  const overdueRows = invoices.filter((i) => isOverdue(i.dueDate, i.status))
  const overdueSum = overdueRows.reduce((s, r) => s + remaining(r), 0)
  const hasFilters = !!(q || searchParams.vendor || searchParams.category || overdueOnly || (searchParams.horizon && searchParams.horizon !== String(DEFAULT_HORIZON)))

  // --- grupowanie ---
  type Section = { key: string; label: string; href?: string; rows: Row[]; sum: number; overdue: boolean; tone?: 'red' }
  const sections: Section[] = []

  if (group === 'none') {
    sections.push({ key: 'all', label: '', rows: sortRows(invoices), sum: totalRemaining, overdue: overdueRows.length > 0 })
  } else if (group === 'termin') {
    const bucketOf = (inv: Row): string => {
      if (!inv.dueDate) return 'null'
      if (isOverdue(inv.dueDate, inv.status)) return 'overdue'
      const diff = Math.floor((new Date(inv.dueDate).setHours(0, 0, 0, 0) - today.getTime()) / 86400000)
      if (diff <= 0) return 'today'
      if (diff <= 7) return 'w7'
      if (diff <= 30) return 'w30'
      return 'later'
    }
    const defs: { key: string; label: string; tone?: 'red' }[] = [
      { key: 'overdue', label: 'Po terminie', tone: 'red' },
      { key: 'today', label: 'Dziś' },
      { key: 'w7', label: 'Najbliższe 7 dni' },
      { key: 'w30', label: 'Do 30 dni' },
      { key: 'later', label: 'Ponad 30 dni' },
      { key: 'null', label: 'Bez terminu' },
    ]
    const byBucket = new Map<string, Row[]>()
    for (const inv of invoices) {
      const k = bucketOf(inv)
      if (!byBucket.has(k)) byBucket.set(k, [])
      byBucket.get(k)!.push(inv)
    }
    for (const d of defs) {
      const rows = byBucket.get(d.key)
      if (!rows || !rows.length) continue
      sections.push({ key: d.key, label: d.label, rows: sortRows(rows), sum: rows.reduce((s, r) => s + remaining(r), 0), overdue: d.key === 'overdue', tone: d.tone })
    }
  } else if (group === 'vendor') {
    const byVendor = new Map<string, Row[]>()
    for (const inv of invoices) {
      if (!byVendor.has(inv.vendor.id)) byVendor.set(inv.vendor.id, [])
      byVendor.get(inv.vendor.id)!.push(inv)
    }
    const groupsArr = [...byVendor.entries()].map(([vid, rows]) => {
      const hasOverdue = rows.some((r) => isOverdue(r.dueDate, r.status))
      const oldestOverdue = Math.min(...rows.filter((r) => isOverdue(r.dueDate, r.status)).map((r) => r.dueDate!.getTime()), Infinity)
      return {
        key: vid, label: rows[0].vendor.name, href: `/finanse/faktury?vendor=${vid}`,
        rows: sortRows(rows), sum: rows.reduce((s, r) => s + remaining(r), 0), overdue: hasOverdue, oldestOverdue,
      }
    })
    // Grupy z zaleglosciami pierwsze (najstarszy dlug), potem wg sumy malejaco.
    groupsArr.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      if (a.overdue && b.overdue) return a.oldestOverdue - b.oldestOverdue
      return b.sum - a.sum
    })
    sections.push(...groupsArr)
  } else if (group === 'category') {
    const byCat = new Map<string, Row[]>()
    for (const inv of invoices) {
      const k = inv.category || '—'
      if (!byCat.has(k)) byCat.set(k, [])
      byCat.get(k)!.push(inv)
    }
    const order = [...PURCHASE_INVOICE_CATEGORIES, '—']
    for (const k of order) {
      const rows = byCat.get(k)
      if (!rows || !rows.length) continue
      const label = k === '—' ? 'Bez kategorii' : (PURCHASE_INVOICE_CATEGORY_LABELS[k as PurchaseInvoiceCategory] || k)
      sections.push({ key: k, label, rows: sortRows(rows), sum: rows.reduce((s, r) => s + remaining(r), 0), overdue: rows.some((r) => isOverdue(r.dueDate, r.status)) })
    }
  }

  function qs(overrides: Partial<SearchParams>): string {
    const merged: Record<string, string | undefined> = { ...searchParams, ...overrides }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, String(v))
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  // Pusta kolejka bez filtrow — podpowiedz gdzie sa niezaplacone faktury.
  const emptyHints: { label: string; sum: number; href: string }[] = []
  if (invoices.length === 0 && !hasFilters) {
    const [unapproved, approvedLater] = await Promise.all([
      prisma.purchaseInvoice.aggregate({ where: { company, status: { in: ['POBRANA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'ODRZUCONA'] } }, _count: true, _sum: { amountGross: true } }),
      prisma.purchaseInvoice.aggregate({ where: { company, status: { in: PAYABLE_STATUSES }, dueDate: { gt: horizonDate || today } }, _count: true, _sum: { amountGross: true } }),
    ])
    if (unapproved._count > 0) emptyHints.push({ label: `${unapproved._count} niezatwierdzonych (wymagają zatwierdzenia, by trafić do kolejki)`, sum: unapproved._sum.amountGross || 0, href: '/finanse/faktury?status=WPROWADZONA' })
    if (approvedLater._count > 0 && horizonDays != null) emptyHints.push({ label: `${approvedLater._count} zatwierdzonych z terminem dalej niż wybrany horyzont`, sum: approvedLater._sum.amountGross || 0, href: '/finanse/faktury?status=ZATWIERDZONA' })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Kolejka płatności</h1>
        <p className="text-gray-500 text-sm mt-1">
          Do zapłaty{hasFilters ? ' (po filtrach)' : ''}: <strong className="text-gray-900 tabular-nums">{fmtMoney(totalRemaining)}</strong>
          {' • '}{invoices.length} {invoices.length === 1 ? 'faktura' : 'faktur'}
          {overdueRows.length > 0 && <span className="text-red-600"> • {overdueRows.length} po terminie</span>}
        </p>
      </div>

      {/* Segregacja — pigułki */}
      <div className="flex flex-wrap gap-1 mb-3">
        {Object.entries(GROUPS).map(([key, label]) => (
          <Link
            key={key}
            href={`/finanse/kolejka-platnosci${qs({ group: key === DEFAULT_GROUP ? undefined : key })}`}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              group === key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Filtry */}
      <form method="get" className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        {group !== DEFAULT_GROUP && <input type="hidden" name="group" value={group} />}
        <input name="q" defaultValue={q} placeholder="Kontrahent, numer FV, podkontr..." className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <select name="vendor" defaultValue={searchParams.vendor || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Wszyscy kontrahenci</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select name="category" defaultValue={searchParams.category || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Wszystkie kategorie</option>
          {PURCHASE_INVOICE_CATEGORIES.map((c) => <option key={c} value={c}>{PURCHASE_INVOICE_CATEGORY_LABELS[c]}</option>)}
        </select>
        <select name="horizon" defaultValue={horizonRaw} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" title="Horyzont terminu płatności">
          {HORIZON_OPTIONS.map((h) => <option key={h.value} value={h.value}>termin: {h.label}</option>)}
        </select>
        <select name="sort" defaultValue={sort} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" title="Sortowanie">
          {Object.entries(SORTS).map(([k, label]) => <option key={k} value={k}>↕ {label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
          <input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} />
          Tylko po terminie
        </label>
        <div className="md:col-span-4 flex gap-2 justify-end">
          {hasFilters && <Link href="/finanse/kolejka-platnosci" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Wyczyść filtry</Link>}
          <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium">Zastosuj</button>
        </div>
      </form>

      {/* Baner zaległości */}
      {overdueRows.length > 0 && !overdueOnly && (
        <Link href={`/finanse/kolejka-platnosci${qs({ overdue: '1' })}`} className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 hover:bg-red-100 transition-colors flex-wrap">
          <span className="text-sm text-red-700 font-medium">⚠ {overdueRows.length} {overdueRows.length === 1 ? 'faktura' : 'faktur'} po terminie — łącznie {fmtMoney(overdueSum)}</span>
          <span className="text-sm text-red-700">Pokaż tylko po terminie →</span>
        </Link>
      )}

      {/* Pusty stan */}
      {invoices.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          {hasFilters ? (
            <p className="text-gray-500 text-center">
              Brak faktur dla wybranych filtrów.{' '}
              <Link href="/finanse/kolejka-platnosci" className="text-blue-600 hover:underline">Wyczyść filtry</Link>.
            </p>
          ) : (
            <>
              <p className="text-gray-500 text-center">
                Brak zatwierdzonych faktur do zapłaty dla firmy <strong>{COMPANY_LABELS[company]}</strong>.
              </p>
              {emptyHints.length > 0 ? (
                <div className="mt-5 pt-5 border-t border-gray-100 max-w-lg mx-auto space-y-2">
                  <p className="text-sm text-gray-600">Niezapłacone faktury tej firmy są tutaj:</p>
                  {emptyHints.map((h) => (
                    <Link key={h.href} href={h.href} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm flex-wrap">
                      <span className="text-gray-700">{h.label}</span>
                      <span className="tabular-nums font-medium text-gray-900 whitespace-nowrap">{fmtMoney(h.sum)} →</span>
                    </Link>
                  ))}
                  <p className="text-xs text-gray-400 pt-1">Do kolejki trafiają tylko faktury <strong>zatwierdzone</strong> (Wprowadzona → Zatwierdzona → płatność).</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center mt-2">Brak niezapłaconych faktur w tej firmie.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Sekcje */}
      <div className="space-y-5">
        {sections.map((sec) => (
          <div key={sec.key} className="v2-card-in">
            {sec.label && (
              <div
                className={`flex items-baseline justify-between gap-3 border rounded-t-xl px-4 py-2.5 flex-wrap ${sec.tone === 'red' ? 'bg-red-50' : ''}`}
                style={sec.tone === 'red' ? { borderColor: '#fecaca' } : { background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
              >
                <span className={`font-semibold ${sec.tone === 'red' ? 'text-red-700' : 'text-gray-900'}`}>
                  {sec.href ? <Link href={sec.href} className="hover:text-blue-600">{sec.label}</Link> : sec.label}
                  <span className={`font-normal text-sm ml-1 ${sec.tone === 'red' ? 'text-red-400' : 'text-gray-400'}`}>({sec.rows.length})</span>
                  {sec.overdue && sec.tone !== 'red' && <span className="text-red-600 text-xs font-medium ml-2">• po terminie</span>}
                </span>
                <span className={`font-semibold tabular-nums ${sec.tone === 'red' ? 'text-red-700' : 'text-gray-900'}`}>{fmtMoney(sec.sum)}</span>
              </div>
            )}
            <div
              className={`bg-white border rounded-b-xl overflow-hidden ${sec.label ? 'border-t-0' : 'rounded-t-xl'}`}
              style={{ borderColor: 'var(--border)' }}
            >
              {/* Wiersz to CSS grid (nie tabela) — na wąskich ekranach zamiast
                  zgniatania kolumn wymuszamy min-w i przewijamy poziomo. */}
              <div className="overflow-x-auto">
                {sec.rows.map((inv, idx) => {
                  const rem = remaining(inv)
                  const sumPaid = inv.amountGross - rem
                  const overdue = isOverdue(inv.dueDate, inv.status)
                  return (
                    <div
                      key={inv.id}
                      className={`grid grid-cols-[1fr_auto_auto_auto] gap-5 items-center px-4 py-2.5 min-w-[680px] hover:bg-gray-50 transition-colors ${idx > 0 ? 'border-t' : ''} ${overdue ? 'border-l-2 border-l-red-500' : ''}`}
                      style={idx > 0 ? { borderColor: 'var(--border-soft)' } : undefined}
                    >
                      <span className="min-w-0">
                        {inv.subVendor && <span className="font-medium text-gray-900 mr-2">{inv.subVendor}</span>}
                        {!inv.subVendor && group !== 'vendor' && <span className="text-gray-500 mr-2">{inv.vendor.name}</span>}
                        <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
                      </span>
                      <span className={`tabular-nums text-sm whitespace-nowrap text-right ${overdue ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
                        <span className="block">termin: {fmtDate(inv.dueDate)}{overdue && ' ⚠'}</span>
                        {inv.dueDate && <span className={`block text-[11px] ${overdue ? 'text-red-500' : 'text-gray-400'}`}>{fmtDaysFromNow(inv.dueDate)}</span>}
                      </span>
                      <span className="text-right tabular-nums">
                        {sumPaid > 0.01 && <span className="block text-xs text-gray-400">zapł. {fmtMoney(sumPaid)}</span>}
                        <span className="block font-semibold text-gray-900">{fmtMoney(rem)}</span>
                      </span>
                      {/* Oplacenie bezposrednio z kolejki: prefill pozostalej kwoty
                          + dzisiejsza data; pelna wplata -> status OPLACONA i FV
                          znika z kolejki (czesciowa -> CZESCIOWO_OPLACONA, zostaje). */}
                      <QuickPaymentCell
                        invoiceId={inv.id}
                        remaining={rem}
                        status={inv.status}
                        kind="purchase"
                        buttonLabel="✓ Oznacz opłacone"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
