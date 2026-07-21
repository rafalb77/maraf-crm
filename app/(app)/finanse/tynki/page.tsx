import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  SALES_INVOICE_STATUS_LABELS,
  SALES_INVOICE_STATUS_COLORS,
  type SalesInvoiceStatus,
} from '@/lib/types'
import { fmtDate, fmtMoney } from '@/lib/finanse-format'
import { getActiveCompany } from '@/lib/finanse-company'

type SearchParams = { q?: string; year?: string; recipient?: string }

const fmtM2 = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100

// Przychody z tynkow — wszystkie FV przychodowe z kategoria TYNKI (my jako
// podwykonawca prac tynkarskich): sumy m2/robocizny/marzy, rozbicie po
// odbiorcach (generalni wykonawcy) i pelna lista faktur.
export default async function TynkiPage({ searchParams }: { searchParams: SearchParams }) {
  const company = getActiveCompany()
  const q = (searchParams.q || '').trim()

  const filters: any[] = [{ company }, { category: 'TYNKI' }, { status: { not: 'ANULOWANA' } }]
  if (q) {
    filters.push({ OR: [
      { number: { contains: q, mode: 'insensitive' } },
      { recipientName: { contains: q, mode: 'insensitive' } },
    ]})
  }
  if (searchParams.recipient) filters.push({ recipientName: searchParams.recipient })
  if (searchParams.year) {
    const y = parseInt(searchParams.year, 10)
    if (y) filters.push({ issueDate: { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) } })
  }

  // Lata i odbiorcy do filtrow — z pelnego zbioru tynkow tej firmy (bez filtrow).
  const [invoices, allTynki] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { AND: filters },
      orderBy: { issueDate: 'desc' },
      include: { payments: { select: { amount: true } } },
    }),
    prisma.salesInvoice.findMany({
      where: { company, category: 'TYNKI', status: { not: 'ANULOWANA' } },
      select: { issueDate: true, recipientName: true },
    }),
  ])

  const years = [...new Set(allTynki.map((i) => i.issueDate.getFullYear()))].sort((a, b) => b - a)
  const recipients = [...new Set(allTynki.map((i) => i.recipientName))].sort((a, b) => a.localeCompare(b, 'pl'))
  const hasFilters = !!(q || searchParams.year || searchParams.recipient)

  // Sumy (z przefiltrowanych): netto wszystkich; m2/robocizna/marza tylko z przeliczonych.
  const sumNet = invoices.reduce((s, i) => s + i.amountNet, 0)
  const calced = invoices.filter((i) => i.plasterArea != null)
  const sumArea = calced.reduce((s, i) => s + (i.plasterArea || 0), 0)
  const sumLabor = invoices.reduce((s, i) => s + (i.laborCost || 0), 0)
  const calcedNet = calced.reduce((s, i) => s + i.amountNet, 0)
  const avgRate = sumArea > 0 ? calcedNet / sumArea : null
  const withLabor = invoices.filter((i) => i.laborCost != null)
  const laborNet = withLabor.reduce((s, i) => s + i.amountNet, 0)
  const sumMargin = r2(laborNet - sumLabor)
  const marginPct = laborNet > 0 ? Math.round((sumMargin / laborNet) * 1000) / 10 : null
  const uncalced = invoices.length - calced.length
  const sumPaid = invoices.reduce((s, i) => s + i.payments.reduce((x, p) => x + p.amount, 0), 0)
  const sumGross = invoices.reduce((s, i) => s + i.amountGross, 0)

  // Rozbicie po odbiorcach (generalni wykonawcy).
  const byRecipient = new Map<string, { count: number; net: number; area: number; labor: number; laborNet: number }>()
  for (const i of invoices) {
    const k = i.recipientName
    if (!byRecipient.has(k)) byRecipient.set(k, { count: 0, net: 0, area: 0, labor: 0, laborNet: 0 })
    const b = byRecipient.get(k)!
    b.count++
    b.net += i.amountNet
    b.area += i.plasterArea || 0
    if (i.laborCost != null) { b.labor += i.laborCost; b.laborNet += i.amountNet }
  }
  const recipientRows = [...byRecipient.entries()].sort((a, b) => b[1].net - a[1].net)

  function qs(overrides: Partial<SearchParams>): string {
    const merged: Record<string, string | undefined> = { ...searchParams, ...overrides }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, String(v))
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Przychody z tynków</h1>
          <p className="text-gray-500 text-sm mt-1">
            {invoices.length} faktur{hasFilters ? ' (po filtrach)' : ''} • prace tynkarskie jako podwykonawca
          </p>
        </div>
        <Link href="/finanse/przychody" className="text-sm text-blue-600 hover:text-blue-800">
          Wszystkie faktury przychodowe →
        </Link>
      </div>

      {/* Karty sum */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <SumCard label="Przychód netto" value={fmtMoney(sumNet)} bold />
        <SumCard label="Powierzchnia" value={sumArea > 0 ? `${fmtM2(sumArea)} m²` : '—'} sub={avgRate != null ? `śr. ${fmtMoney(r2(avgRate))}/m²` : undefined} />
        <SumCard label="Robocizna" value={sumLabor > 0 ? fmtMoney(sumLabor) : '—'} />
        <SumCard
          label="Marża (netto − robocizna)"
          value={withLabor.length > 0 ? fmtMoney(sumMargin) : '—'}
          sub={marginPct != null ? `${marginPct}% przychodu z robocizną` : undefined}
          tone={withLabor.length > 0 ? (sumMargin >= 0 ? 'green' : 'red') : undefined}
        />
        <SumCard label="Wpłacono / brutto" value={`${fmtMoney(sumPaid)}`} sub={`z ${fmtMoney(sumGross)}`} />
      </div>

      {uncalced > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          ⚠ {uncalced} {uncalced === 1 ? 'faktura nie ma' : 'faktur nie ma'} przeliczenia m² — sumy m²/robocizny/marży liczą tylko przeliczone. Kliknij fakturę i uzupełnij stawkę.
        </p>
      )}

      {/* Filtry */}
      <form method="get" className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input name="q" defaultValue={q} placeholder="Nr FV lub odbiorca..." className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <select name="recipient" defaultValue={searchParams.recipient || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Wszyscy odbiorcy</option>
          {recipients.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select name="year" defaultValue={searchParams.year || ''} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Wszystkie lata</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        <div className="flex gap-2 justify-end">
          {hasFilters && <Link href="/finanse/tynki" className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Wyczyść</Link>}
          <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium">Filtruj</button>
        </div>
      </form>

      {/* Rozbicie po odbiorcach */}
      {recipientRows.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {recipientRows.map(([name, b]) => (
            <Link
              key={name}
              href={`/finanse/tynki${qs({ recipient: name })}`}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
            >
              <p className="font-semibold text-gray-900 truncate" title={name}>{name}</p>
              <p className="text-sm text-gray-500 mt-1">
                {b.count} FV • <span className="tabular-nums">{fmtMoney(b.net)}</span> netto
                {b.area > 0 && <> • <span className="tabular-nums">{fmtM2(b.area)} m²</span></>}
              </p>
              {b.labor > 0 && (
                <p className={`text-sm tabular-nums mt-0.5 ${b.laborNet - b.labor >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  marża {fmtMoney(r2(b.laborNet - b.labor))}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Tabela faktur */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1080px] lg:min-w-0">
            <thead className="bg-gray-50 border-b border-gray-200 text-left">
              <tr>
                <th className="px-3 py-3 font-medium text-gray-700">Odbiorca</th>
                <th className="px-3 py-3 font-medium text-gray-700">Nr FV</th>
                <th className="px-3 py-3 font-medium text-gray-700">Wyst.</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right">Netto</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right" title="Stawka umowna sprzedaży zł/m²">Stawka</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right">m²</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right" title="Stawka robocizny zł/m²">Rob. zł/m²</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right">Robocizna</th>
                <th className="px-3 py-3 font-medium text-gray-700 text-right" title="Netto − robocizna">Marża</th>
                <th className="px-3 py-3 font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                    Brak faktur z kategorią „Tynki".{' '}
                    <Link href="/finanse/przychody" className="text-blue-600 hover:underline">Ustaw kategorię na liście przychodów</Link>.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const margin = inv.laborCost != null ? r2(inv.amountNet - inv.laborCost) : null
                return (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{inv.recipientName}</td>
                    <td className="px-3 py-2">
                      <Link href={`/finanse/przychody/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
                    </td>
                    <td className="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">{fmtDate(inv.issueDate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900 font-medium">{fmtMoney(inv.amountNet)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{inv.plasterRate != null ? fmtMoney(inv.plasterRate) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
                      {inv.plasterArea != null ? fmtM2(inv.plasterArea) : (
                        <Link href={`/finanse/przychody/${inv.id}`} className="text-xs text-amber-600 hover:text-amber-800 font-normal">uzupełnij →</Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{inv.laborRate != null ? fmtMoney(inv.laborRate) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{inv.laborCost != null ? fmtMoney(inv.laborCost) : '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${margin == null ? 'text-gray-300' : margin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {margin != null ? fmtMoney(margin) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SALES_INVOICE_STATUS_COLORS[inv.status as SalesInvoiceStatus] || 'bg-gray-100 text-gray-700'}`}>
                        {SALES_INVOICE_STATUS_LABELS[inv.status as SalesInvoiceStatus] || inv.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {invoices.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-gray-900">
                <tr>
                  <td colSpan={3} className="px-3 py-3">Razem ({invoices.length})</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(sumNet)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-500">{avgRate != null ? `śr. ${fmtMoney(r2(avgRate))}` : ''}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{sumArea > 0 ? fmtM2(sumArea) : '—'}</td>
                  <td></td>
                  <td className="px-3 py-3 text-right tabular-nums">{sumLabor > 0 ? fmtMoney(sumLabor) : '—'}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${withLabor.length === 0 ? 'text-gray-400' : sumMargin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {withLabor.length > 0 ? fmtMoney(sumMargin) : '—'}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

function SumCard({ label, value, sub, bold, tone }: { label: string; value: string; sub?: string; bold?: boolean; tone?: 'green' | 'red' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
      <p className={`tabular-nums mt-1 ${bold ? 'text-xl font-bold' : 'text-lg font-semibold'} ${
        tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-600' : 'text-gray-900'
      }`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 tabular-nums">{sub}</p>}
    </div>
  )
}
