import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  PURCHASE_INVOICE_STATUS_LABELS,
  PURCHASE_INVOICE_CATEGORIES,
  PURCHASE_INVOICE_CATEGORY_LABELS,
} from '@/lib/types'
import { getActiveCompany } from '@/lib/finanse-company'
import { payableAmount } from '@/lib/finanse-format'
import { FOLDERS, FOLDER_LABELS, vendorIdsForFolder, vendorIdsWithoutFolder, type Folder } from '@/lib/finanse-folders'
import { FakturyTable, type FakturaRow } from '@/components/finanse/FakturyTable'

type SearchParams = {
  vendor?: string
  status?: string
  q?: string
  overdue?: string
  from?: string
  to?: string
  page?: string
  sort?: string  // klucz z SORT_OPTIONS, np. 'dueDate-asc'
  folder?: string  // STAFFA | PROMATBUD | BAUTER | STALE | INNE | 'POZOSTALI'
  category?: string  // ręczna kategoria per faktura: STAFFA | STALE | TYNKI | INNE
}

const PAGE_SIZE = 100

const SORT_OPTIONS: Record<string, { label: string; orderBy: any }> = {
  'dueDate-asc':     { label: 'Termin płatności (najbliższe)', orderBy: [{ dueDate: 'asc' }, { issueDate: 'desc' }] },
  'dueDate-desc':    { label: 'Termin płatności (najpóźniejsze)', orderBy: [{ dueDate: 'desc' }, { issueDate: 'desc' }] },
  'issueDate-desc':  { label: 'Data wystawienia (od nowszych)', orderBy: { issueDate: 'desc' } },
  'issueDate-asc':   { label: 'Data wystawienia (od starszych)', orderBy: { issueDate: 'asc' } },
  'vendor-asc':      { label: 'Kontrahent (A-Z)', orderBy: { vendor: { name: 'asc' } } },
  'vendor-desc':     { label: 'Kontrahent (Z-A)', orderBy: { vendor: { name: 'desc' } } },
  'number-asc':      { label: 'Nr FV (A-Z)', orderBy: { number: 'asc' } },
  'number-desc':     { label: 'Nr FV (Z-A)', orderBy: { number: 'desc' } },
  'amountNet-desc':  { label: 'Kwota netto (od największych)', orderBy: { amountNet: 'desc' } },
  'amountNet-asc':   { label: 'Kwota netto (od najmniejszych)', orderBy: { amountNet: 'asc' } },
  'vatRate-desc':    { label: 'Stawka VAT (od największych)', orderBy: { vatRate: 'desc' } },
  'vatRate-asc':     { label: 'Stawka VAT (od najmniejszych)', orderBy: { vatRate: 'asc' } },
  'amountVat-desc':  { label: 'Kwota VAT (od największych)', orderBy: { amountVat: 'desc' } },
  'amountVat-asc':   { label: 'Kwota VAT (od najmniejszych)', orderBy: { amountVat: 'asc' } },
  'amountGross-desc':{ label: 'Kwota brutto (od największych)', orderBy: { amountGross: 'desc' } },
  'amountGross-asc': { label: 'Kwota brutto (od najmniejszych)', orderBy: { amountGross: 'asc' } },
  'status-asc':      { label: 'Status (A-Z)', orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] },
  'status-desc':     { label: 'Status (Z-A)', orderBy: [{ status: 'desc' }, { dueDate: 'asc' }] },
}
// Domyślnie najnowsze faktury u góry (po dacie wystawienia malejąco).
const DEFAULT_SORT_KEY = 'issueDate-desc'

export default async function FakturyListPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const company = getActiveCompany()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const filters: any[] = [{ company }]
  if (searchParams.vendor) filters.push({ vendorId: searchParams.vendor })
  if (searchParams.folder) {
    if (searchParams.folder === 'POZOSTALI') {
      const ids = await vendorIdsWithoutFolder()
      filters.push({ vendorId: { in: ids.length ? ids : ['__none__'] } })
    } else if ((FOLDERS as readonly string[]).includes(searchParams.folder)) {
      const ids = await vendorIdsForFolder(searchParams.folder as Folder)
      filters.push({ vendorId: { in: ids.length ? ids : ['__none__'] } })
    }
  }
  if (searchParams.status) filters.push({ status: searchParams.status })
  if (searchParams.category && (PURCHASE_INVOICE_CATEGORIES as readonly string[]).includes(searchParams.category)) {
    filters.push({ category: searchParams.category })
  }
  if (searchParams.q) {
    // Szuka tez po nazwie vendora — dzieki temu q=<oficjalna nazwa> zbiera
    // zarowno faktury vendora, jak i te pod parasolem (STAFFA) z ta sama
    // etykieta subVendor (link "Niezaplacone wg kontrahenta" z pulpitu).
    filters.push({
      OR: [
        { number: { contains: searchParams.q, mode: 'insensitive' } },
        { subVendor: { contains: searchParams.q, mode: 'insensitive' } },
        { vendor: { name: { contains: searchParams.q, mode: 'insensitive' } } },
        { description: { contains: searchParams.q, mode: 'insensitive' } },
      ],
    })
  }
  if (searchParams.overdue === '1') {
    filters.push({
      dueDate: { lt: today },
      status: { in: ['ZATWIERDZONA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
    })
  }
  if (searchParams.from) filters.push({ issueDate: { gte: new Date(searchParams.from) } })
  if (searchParams.to) filters.push({ issueDate: { lte: new Date(searchParams.to) } })

  const where = filters.length ? { AND: filters } : {}
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1)
  const skip = (page - 1) * PAGE_SIZE

  // Sortowanie
  const sortKey = searchParams.sort && SORT_OPTIONS[searchParams.sort] ? searchParams.sort : DEFAULT_SORT_KEY
  const sortDef = SORT_OPTIONS[sortKey]

  const [invoices, total, vendors, statusCountsRaw, sums, paymentsSum] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where,
      orderBy: sortDef.orderBy,
      include: {
        vendor: { select: { name: true } },
        payments: { select: { amount: true } },
      },
      take: PAGE_SIZE,
      skip,
    }),
    prisma.purchaseInvoice.count({ where }),
    prisma.vendor.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.purchaseInvoice.groupBy({ by: ['status'], _count: true }),
    // Podsumowanie CALEGO filtra (nie tylko strony) — kwoty + potracenia
    prisma.purchaseInvoice.aggregate({
      where,
      _sum: {
        amountNet: true, amountVat: true, amountGross: true,
        deposit: true, buildingCosts: true, electricity: true,
      },
    }),
    // Suma wplat do faktur z filtra — do "Pozostalo" w stopce
    prisma.purchaseInvoicePayment.aggregate({
      where: { invoice: where },
      _sum: { amount: true },
    }),
  ])

  const statusCounts: Record<string, number> = {}
  for (const s of statusCountsRaw) statusCounts[s.status] = s._count

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function qs(overrides: Partial<SearchParams>): string {
    const merged: Record<string, string | undefined> = { ...searchParams, ...overrides }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, String(v))
    }
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  const hasFilters = !!(searchParams.vendor || searchParams.status || searchParams.category || searchParams.q || searchParams.overdue || searchParams.from || searchParams.to || searchParams.folder)

  const rows: FakturaRow[] = invoices.map((inv) => {
    const sumPaid = inv.payments.reduce((s, p) => s + p.amount, 0)
    // Pozostalo do zaplaty = kwota nalezna po potraceniach (kaucja/KB/prad) - zaplacono.
    const remaining = Math.round((payableAmount(inv) - sumPaid) * 100) / 100
    return {
      id: inv.id,
      vendorName: inv.vendor.name,
      subVendor: inv.subVendor,
      number: inv.number,
      company: inv.company,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      vatRate: inv.vatRate,
      amountNet: inv.amountNet,
      amountVat: inv.amountVat,
      amountGross: inv.amountGross,
      sumPaid,
      remaining,
      status: inv.status,
      category: inv.category,
      notes: inv.notes,
      isKsef: !!inv.ksefNumber,
    }
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faktury zakupowe</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} {total === 1 ? 'faktura' : total < 5 ? 'faktury' : 'faktur'}
            {hasFilters && ' (po filtrach)'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/finanse/import"
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Import xlsx
          </Link>
          <Link
            href="/finanse/nowa"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Nowa faktura
          </Link>
        </div>
      </div>

      {/* Foldery główne — taby filtrujące po vendorze */}
      <div className="flex flex-wrap gap-1 mb-4">
        <FolderTab label="Wszystkie" href={`/finanse/faktury${qs({ folder: undefined, page: undefined })}`} active={!searchParams.folder} />
        {FOLDERS.map((f) => (
          <FolderTab
            key={f}
            label={FOLDER_LABELS[f]}
            href={`/finanse/faktury${qs({ folder: f, page: undefined })}`}
            active={searchParams.folder === f}
          />
        ))}
        <FolderTab label="Pozostali" href={`/finanse/faktury${qs({ folder: 'POZOSTALI', page: undefined })}`} active={searchParams.folder === 'POZOSTALI'} />
      </div>

      <form method="get" className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        {/* Zachowaj wybrany folder gdy user zmienia inne filtry przez form */}
        {searchParams.folder && <input type="hidden" name="folder" value={searchParams.folder} />}
        <input
          name="q"
          defaultValue={searchParams.q || ''}
          placeholder="Kontrahent, numer FV, podkontr., opis..."
          className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <select name="vendor" defaultValue={searchParams.vendor || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Wszyscy kontrahenci</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select name="status" defaultValue={searchParams.status || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Wszystkie statusy</option>
          {Object.entries(PURCHASE_INVOICE_STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label} ({statusCounts[k] || 0})</option>
          ))}
        </select>
        <select name="category" defaultValue={searchParams.category || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" title="Kategoria kosztowa (ręczna)">
          <option value="">Wszystkie kategorie</option>
          {PURCHASE_INVOICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{PURCHASE_INVOICE_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select name="sort" defaultValue={sortKey} className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm" title="Sortowanie">
          {Object.entries(SORT_OPTIONS).map(([k, def]) => (
            <option key={k} value={k}>↕ {def.label}</option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={searchParams.from || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" title="Data wystawienia od" />
        <input type="date" name="to" defaultValue={searchParams.to || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" title="Data wystawienia do" />
        <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
          <input type="checkbox" name="overdue" value="1" defaultChecked={searchParams.overdue === '1'} />
          Tylko zaległe (po terminie i niezapłacone)
        </label>
        <div className="md:col-span-4 flex gap-2 justify-end">
          {hasFilters && (
            <Link href="/finanse/faktury" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Wyczyść filtry</Link>
          )}
          <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium">Zastosuj</button>
        </div>
      </form>

      <FakturyTable
        rows={rows}
        currentSort={sortKey}
        sortOptions={Object.fromEntries(Object.entries(SORT_OPTIONS).map(([k, v]) => [k, v.label]))}
        totals={{
          net: sums._sum.amountNet || 0,
          vat: sums._sum.amountVat || 0,
          gross: sums._sum.amountGross || 0,
          // Pozostalo dla calego filtra = brutto - potracenia (kaucje/KB/prad) - wplaty
          remaining: Math.round(((sums._sum.amountGross || 0)
            - (sums._sum.deposit || 0)
            - (sums._sum.buildingCosts || 0)
            - (sums._sum.electricity || 0)
            - (paymentsSum._sum.amount || 0)) * 100) / 100,
          count: total,
          onPage: rows.length,
        }}
      />

      {/* Komponent zakładki folderu — server */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-gray-500">Strona {page} z {totalPages} • {total} faktur</p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/finanse/faktury${qs({ page: String(page - 1) })}`} className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">← Poprzednia</Link>
            )}
            {page < totalPages && (
              <Link href={`/finanse/faktury${qs({ page: String(page + 1) })}`} className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">Następna →</Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FolderTab({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium border transition-colors"
      style={
        active
          ? { background: 'var(--color-brand-navy)', color: '#F2E8D6', borderColor: 'var(--color-brand-navy)' }
          : { background: 'var(--surface)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
      }
    >
      {label}
    </Link>
  )
}
