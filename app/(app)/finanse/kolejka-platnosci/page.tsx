import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtDate, fmtMoney, isOverdue } from '@/lib/finanse-format'
import { getActiveCompany } from '@/lib/finanse-company'
import { COMPANY_LABELS } from '@/lib/types'

const RANGE_DAYS = 30

export default async function KolejkaPlatnosciPage() {
  const company = getActiveCompany()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today.getTime() + RANGE_DAYS * 86400000)

  // Faktury "do zaplaty": zatwierdzone/czesciowo/zaplanowane, termin <= horyzont lub brak terminu.
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      company,
      status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] },
      OR: [{ dueDate: { lte: horizon } }, { dueDate: null }],
    },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
    include: {
      vendor: { select: { id: true, name: true } },
      payments: { select: { amount: true } },
    },
  })

  // Grupowanie po kontrahencie
  type Row = (typeof invoices)[number]
  const groups = new Map<string, { vendorName: string; vendorId: string; rows: Row[] }>()
  for (const inv of invoices) {
    const key = inv.vendor.id
    if (!groups.has(key)) groups.set(key, { vendorName: inv.vendor.name, vendorId: key, rows: [] })
    groups.get(key)!.rows.push(inv)
  }

  const remaining = (inv: Row) => inv.amountGross - inv.payments.reduce((s, p) => s + p.amount, 0)

  // Sortuj grupy malejaco po sumie do zaplaty
  const sortedGroups = Array.from(groups.values())
    .map((g) => ({ ...g, sum: g.rows.reduce((s, r) => s + remaining(r), 0) }))
    .sort((a, b) => b.sum - a.sum)

  const totalRemaining = sortedGroups.reduce((s, g) => s + g.sum, 0)
  const overdueCount = invoices.filter((i) => isOverdue(i.dueDate, i.status)).length

  // Gdy kolejka pusta — wyjasnij, GDZIE sa niezaplacone faktury tej firmy:
  //  - niezatwierdzone (WPROWADZONA/DO_ZATWIERDZENIA/ODRZUCONA) nie trafiaja
  //    do kolejki, dopoki nie zostana zatwierdzone,
  //  - zatwierdzone z terminem dalej niz 30 dni sa poza horyzontem.
  const emptyHints: { label: string; count: number; sum: number; href: string }[] = []
  if (sortedGroups.length === 0) {
    const [unapproved, approvedLater] = await Promise.all([
      prisma.purchaseInvoice.aggregate({
        where: { company, status: { in: ['WPROWADZONA', 'DO_ZATWIERDZENIA', 'ODRZUCONA'] } },
        _count: true,
        _sum: { amountGross: true },
      }),
      prisma.purchaseInvoice.aggregate({
        where: { company, status: { in: ['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA'] }, dueDate: { gt: horizon } },
        _count: true,
        _sum: { amountGross: true },
      }),
    ])
    if (unapproved._count > 0) {
      emptyHints.push({
        label: `${unapproved._count} niezatwierdzonych (wymagają zatwierdzenia, by trafić do kolejki)`,
        count: unapproved._count,
        sum: unapproved._sum.amountGross || 0,
        href: '/finanse/faktury?status=WPROWADZONA',
      })
    }
    if (approvedLater._count > 0) {
      emptyHints.push({
        label: `${approvedLater._count} zatwierdzonych z terminem dalej niż ${RANGE_DAYS} dni`,
        count: approvedLater._count,
        sum: approvedLater._sum.amountGross || 0,
        href: '/finanse/faktury?status=ZATWIERDZONA',
      })
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kolejka płatności</h1>
        <p className="text-gray-500 text-sm mt-1">
          Zatwierdzone do zapłaty (najbliższe {RANGE_DAYS} dni) — łącznie <strong className="text-gray-900">{fmtMoney(totalRemaining)}</strong>
          {overdueCount > 0 && <span className="text-red-600"> • {overdueCount} po terminie</span>}
        </p>
      </div>

      {sortedGroups.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <p className="text-gray-500 text-center">
            Brak <strong>zatwierdzonych</strong> faktur do zapłaty w najbliższych {RANGE_DAYS} dniach
            {' '}dla firmy <strong>{COMPANY_LABELS[company]}</strong>.
          </p>
          {emptyHints.length > 0 ? (
            <div className="mt-5 pt-5 border-t border-gray-100 max-w-lg mx-auto space-y-2">
              <p className="text-sm text-gray-600">Niezapłacone faktury tej firmy są tutaj:</p>
              {emptyHints.map((h) => (
                <Link
                  key={h.href}
                  href={h.href}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
                >
                  <span className="text-gray-700">{h.label}</span>
                  <span className="tabular-nums font-medium text-gray-900 whitespace-nowrap">{fmtMoney(h.sum)} →</span>
                </Link>
              ))}
              <p className="text-xs text-gray-400 pt-1">
                Do kolejki płatności trafiają tylko faktury <strong>zatwierdzone</strong> (workflow: Wprowadzona → Do zatwierdzenia → Zatwierdzona → płatność).
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center mt-2">Brak niezapłaconych faktur w tej firmie.</p>
          )}
        </div>
      )}

      <div className="space-y-5">
        {sortedGroups.map((g) => (
          <div key={g.vendorId} className="v2-card-in">
            {/* Nagłówek grupy: nazwa + liczba + suma, na surface-alt */}
            <div
              className="flex items-baseline justify-between gap-3 border rounded-t-xl px-4 py-2.5"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
            >
              <Link href={`/finanse/faktury?vendor=${g.vendorId}`} className="font-semibold text-gray-900 hover:text-blue-600">
                {g.vendorName} <span className="text-gray-400 font-normal text-sm">({g.rows.length})</span>
              </Link>
              <span className="font-semibold text-gray-900 tabular-nums">{fmtMoney(g.sum)}</span>
            </div>
            {/* Wiersze faktur: grid 1fr auto auto auto */}
            <div
              className="bg-white border border-t-0 rounded-b-xl overflow-hidden"
              style={{ borderColor: 'var(--border)' }}
            >
              {g.rows.map((inv, idx) => {
                const rem = remaining(inv)
                const sumPaid = inv.amountGross - rem
                const overdue = isOverdue(inv.dueDate, inv.status)
                return (
                  <div
                    key={inv.id}
                    className={`grid grid-cols-[1fr_auto_auto_auto] gap-5 items-center px-4 py-2.5 hover:bg-gray-50 transition-colors ${idx > 0 ? 'border-t' : ''}`}
                    style={idx > 0 ? { borderColor: 'var(--border-soft)' } : undefined}
                  >
                    <span className="min-w-0">
                      {inv.subVendor && <span className="font-medium text-gray-900 mr-2">{inv.subVendor}</span>}
                      <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
                    </span>
                    <span className={`tabular-nums text-sm whitespace-nowrap ${overdue ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
                      termin: {fmtDate(inv.dueDate)}{overdue && ' ⚠'}
                    </span>
                    <span className="text-right tabular-nums">
                      {sumPaid > 0.01 && <span className="block text-xs text-gray-400">zapł. {fmtMoney(sumPaid)}</span>}
                      <span className="block font-semibold text-gray-900">{fmtMoney(rem)}</span>
                    </span>
                    <Link
                      href={`/finanse/faktury/${inv.id}`}
                      className="text-xs text-blue-600 font-medium whitespace-nowrap px-2 py-1.5 rounded-md transition-colors"
                      style={{ background: 'transparent' }}
                    >
                      Oznacz opłacone →
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
