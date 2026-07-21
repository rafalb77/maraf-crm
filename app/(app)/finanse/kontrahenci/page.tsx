import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { fmtMoney } from '@/lib/finanse-format'
import { VENDOR_CATEGORY_LABELS, type VendorCategory } from '@/lib/types'
import { getActiveCompany } from '@/lib/finanse-company'
import { VendorTermsCell } from '@/components/finanse/VendorTermsCell'
import { UnifyLabelsButton } from '@/components/finanse/UnifyLabelsButton'

type SearchParams = { q?: string; sort?: string }

// Klucze sortowania: kolumna-kierunek. Liczby (faktur/do zaplaty) sortowane
// w JS, bo obejmuja tez FV z etykieta podwykonawcy (nie sa w DB wprost).
const SORT_KEYS = new Set(['name-asc', 'name-desc', 'nip-asc', 'nip-desc', 'count-asc', 'count-desc', 'unpaid-asc', 'unpaid-desc'])
const DEFAULT_SORT = 'name-asc'

export default async function KontrahenciPage({ searchParams }: { searchParams: SearchParams }) {
  const company = getActiveCompany()
  const session = await getServerSession(authOptions)
  const admin = isAdmin(session?.user?.email)
  const q = (searchParams.q || '').trim()
  const sort = searchParams.sort && SORT_KEYS.has(searchParams.sort) ? searchParams.sort : DEFAULT_SORT

  // Kontrahenci aktywnej firmy = ci, ktorzy maja przynajmniej 1 fakture tej firmy.
  // Liczniki/sumy liczone tylko z faktur aktywnej firmy.
  const [allVendors, labeledInvoices] = await Promise.all([
    prisma.vendor.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { nip: { contains: q, mode: 'insensitive' } }] }
        : undefined,
      include: {
        _count: { select: { invoices: { where: { company } } } },
        invoices: {
          where: { company, status: { notIn: ['OPLACONA', 'ANULOWANA'] } },
          select: { amountGross: true, payments: { select: { amount: true } } },
        },
        terms: {
          select: { investment: true, depositPct: true, depositReturnMonths: true, buildingCostsPct: true, calcBasis: true, depositBasis: true, buildingCostsBasis: true, notes: true },
          orderBy: { investment: 'asc' },
        },
      },
    }),
    // FV z etykieta podwykonawcy (import z Excela pod zbiorczymi wpisami typu
    // STAFFA) — doliczane kontrahentowi o tej samej nazwie, zeby liczniki
    // pokazywaly pelna wspolprace (jak filtr vendora i karta kontrahenta).
    prisma.purchaseInvoice.findMany({
      where: { company, subVendor: { not: null }, status: { not: 'ANULOWANA' } },
      select: { subVendor: true, vendorId: true, status: true, amountGross: true, payments: { select: { amount: true } } },
    }),
  ])
  const UNPAID = new Set(['POBRANA', 'ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA', 'WPROWADZONA', 'DO_ZATWIERDZENIA'])
  const labeledByName = new Map<string, { ownerId: string; unpaidLeft: number }[]>()
  for (const i of labeledInvoices) {
    const key = i.subVendor!.trim().toUpperCase()
    const unpaidLeft = UNPAID.has(i.status)
      ? Math.max(0, i.amountGross - i.payments.reduce((s, p) => s + p.amount, 0))
      : 0
    if (!labeledByName.has(key)) labeledByName.set(key, [])
    labeledByName.get(key)!.push({ ownerId: i.vendorId, unpaidLeft })
  }
  // Doliczaj tylko FV wiszace pod INNYM wpisem (etykieta = nazwa tego kontrahenta,
  // ale wlascicielem faktury jest np. STAFFA) — bez podwojnego liczenia wlasnych.
  const labeledFor = (v: { id: string; name: string }) => {
    const rows = (labeledByName.get(v.name.trim().toUpperCase()) || []).filter((r) => r.ownerId !== v.id)
    return { count: rows.length, unpaid: rows.reduce((s, r) => s + r.unpaidLeft, 0) }
  }

  const rows = allVendors
    .map((v) => {
      const labeled = labeledFor(v)
      const ownUnpaid = v.invoices.reduce((s, i) => {
        const paid = i.payments.reduce((p, x) => p + x.amount, 0)
        return s + Math.max(0, i.amountGross - paid)
      }, 0)
      return {
        vendor: v,
        labeledCount: labeled.count,
        invoiceCount: v._count.invoices + labeled.count,
        unpaid: ownUnpaid + labeled.unpaid,
      }
    })
    .filter((r) => r.invoiceCount > 0)

  const [col, dir] = sort.split('-') as [string, 'asc' | 'desc']
  const mul = dir === 'desc' ? -1 : 1
  rows.sort((a, b) => {
    switch (col) {
      case 'nip': return mul * (a.vendor.nip || '').localeCompare(b.vendor.nip || '')
      case 'count': return mul * (a.invoiceCount - b.invoiceCount)
      case 'unpaid': return mul * (a.unpaid - b.unpaid)
      default: return mul * a.vendor.name.localeCompare(b.vendor.name, 'pl', { sensitivity: 'base' })
    }
  })

  const qs = (overrides: Partial<SearchParams>) => {
    const merged = { q: q || undefined, sort: sort !== DEFAULT_SORT ? sort : undefined, ...overrides }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v)
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kontrahenci</h1>
          <p className="text-gray-500 text-sm mt-1">
            {rows.length} kontrahentów{q && <> (filtr: „{q}")</>}
          </p>
        </div>
        {admin && <UnifyLabelsButton />}
        <form method="get" className="flex gap-2 items-center">
          {sort !== DEFAULT_SORT && <input type="hidden" name="sort" value={sort} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Szukaj: nazwa lub NIP..."
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
          />
          {q && (
            <Link href={`/finanse/kontrahenci${qs({ q: undefined })}`} className="text-sm text-gray-500 hover:text-gray-700">
              wyczyść
            </Link>
          )}
          <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Szukaj
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px] lg:min-w-0">
          <thead className="bg-gray-50 border-b border-gray-200 text-left">
            <tr>
              <SortTh label="Nazwa" colKey="name" sort={sort} qs={qs} />
              <th className="px-4 py-3 font-medium text-gray-700">Kategoria</th>
              <SortTh label="NIP" colKey="nip" sort={sort} qs={qs} />
              <th className="px-4 py-3 font-medium text-gray-700" title="Warunki z umowy: % kaucji gwarancyjnej, po ilu miesiącach zwrot, % kosztów budowy. Prefilują fakturę i naliczają się z KSeF. Można ustawić osobno per budowa.">
                Warunki umowne (kaucja / zwrot / KB)
              </th>
              <SortTh label="Faktur" colKey="count" sort={sort} qs={qs} align="right" />
              <SortTh label="Do zapłaty" colKey="unpaid" sort={sort} qs={qs} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  {q ? <>Brak kontrahentów pasujących do „{q}".</> : (
                    <>Brak kontrahentów. Dodaj pierwszego importując xlsx z{' '}
                    <Link href="/finanse/import" className="text-blue-600 hover:underline">tej strony</Link>.</>
                  )}
                </td>
              </tr>
            )}
            {rows.map(({ vendor: v, labeledCount, invoiceCount, unpaid }) => (
              <tr key={v.id} className={!v.isActive ? 'opacity-50' : ''}>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/finanse/kontrahenci/${v.id}`}
                    className="font-medium text-gray-900 hover:text-blue-600"
                    title="Karta kontrahenta — warunki umowne i statystyki"
                  >
                    {v.name}
                  </Link>
                  {!v.isActive && <span className="ml-2 text-xs text-gray-400">(nieaktywny)</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {VENDOR_CATEGORY_LABELS[v.category as VendorCategory] || v.category}
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{v.nip || '—'}</td>
                <td className="px-4 py-2.5">
                  <VendorTermsCell
                    vendorId={v.id}
                    terms={v.terms}
                    legacyDepositPct={v.defaultDepositPct}
                    legacyKbPct={v.defaultBuildingCostsPct}
                  />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  <Link
                    href={`/finanse/faktury?vendor=${v.id}`}
                    className="hover:text-blue-600"
                    title={labeledCount > 0 ? `Faktury kontrahenta (w tym ${labeledCount} jako podwykonawca z importu Excela)` : 'Faktury kontrahenta'}
                  >
                    {invoiceCount}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">
                  {unpaid > 0.01 ? fmtMoney(unpaid) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Dodawanie/edycja kontrahentów ręczna — w przyszłości (Faza 2).
        Obecnie kontrahenci pojawiają się automatycznie przy imporcie xlsx.
      </p>
    </div>
  )
}

// Naglowek sortowalny — link togglujacy kierunek (server component).
function SortTh({
  label, colKey, sort, qs, align = 'left',
}: {
  label: string
  colKey: string
  sort: string
  qs: (o: { sort?: string }) => string
  align?: 'left' | 'right'
}) {
  const [curCol, curDir] = sort.split('-')
  const active = curCol === colKey
  const nextDir = active && curDir === 'asc' ? 'desc' : 'asc'
  const arrow = active ? (curDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  return (
    <th className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <Link
        href={`/finanse/kontrahenci${qs({ sort: `${colKey}-${nextDir}` })}`}
        className={`inline-flex items-center gap-0.5 hover:text-blue-600 ${active ? 'text-blue-700' : 'text-gray-700'}`}
        title={`Sortuj po: ${label}`}
      >
        {label}<span className={`text-xs ${active ? '' : 'text-gray-300'}`}>{arrow}</span>
      </Link>
    </th>
  )
}
