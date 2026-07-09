import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { fmtMoney, fmtMoneyShort, fmtDate } from '@/lib/finanse-format'
import { VENDOR_CATEGORY_LABELS, type VendorCategory } from '@/lib/types'
import { getActiveCompany } from '@/lib/finanse-company'
import { VendorTermsCell } from '@/components/finanse/VendorTermsCell'

const dayMs = 86400000
const UNPAID_STATUSES = new Set(['ZATWIERDZONA', 'CZESCIOWO_OPLACONA', 'ZAPLANOWANA', 'WPROWADZONA', 'DO_ZATWIERDZENIA'])

// Karta kontrahenta: dane, warunki umowne (kaucja/zwrot/KB, netto-brutto)
// i statystyki wspolpracy liczone z faktur aktywnej firmy.
export default async function KontrahentPage({ params }: { params: { id: string } }) {
  const company = getActiveCompany()
  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    include: {
      terms: {
        select: { investment: true, depositPct: true, depositReturnMonths: true, buildingCostsPct: true, calcBasis: true, notes: true },
        orderBy: { investment: 'asc' },
      },
      invoices: {
        where: { company, status: { not: 'ANULOWANA' } },
        select: {
          issueDate: true, dueDate: true, status: true,
          amountGross: true, amountNet: true,
          deposit: true, depositReturnDate: true, depositReturnedAt: true,
          buildingCosts: true, electricity: true,
          ksefNumber: true, subVendor: true,
          payments: { select: { amount: true, paidAt: true } },
        },
      },
    },
  })
  if (!vendor) notFound()

  const now = new Date()
  const m12 = new Date(now); m12.setMonth(m12.getMonth() - 12)
  const inv = vendor.invoices

  // --- Obroty ---
  const totalAll = inv.reduce((s, i) => s + i.amountGross, 0)
  const total12 = inv.filter((i) => i.issueDate >= m12).reduce((s, i) => s + i.amountGross, 0)
  const ksefCount = inv.filter((i) => i.ksefNumber).length

  // --- Pozostalo do zaplaty (po potraceniach) ---
  const remaining = inv.filter((i) => UNPAID_STATUSES.has(i.status)).reduce((s, i) => {
    const paid = i.payments.reduce((p, x) => p + x.amount, 0)
    return s + Math.max(0, i.amountGross - (i.deposit || 0) - (i.buildingCosts || 0) - (i.electricity || 0) - paid)
  }, 0)

  // --- Kaucje ---
  const heldDeposits = inv.filter((i) => (i.deposit || 0) > 0 && !i.depositReturnedAt)
  const heldSum = heldDeposits.reduce((s, i) => s + (i.deposit || 0), 0)
  const nextReturn = heldDeposits
    .filter((i) => i.depositReturnDate)
    .sort((a, b) => a.depositReturnDate!.getTime() - b.depositReturnDate!.getTime())[0]?.depositReturnDate ?? null
  const returnedSum = inv.filter((i) => i.depositReturnedAt).reduce((s, i) => s + (i.deposit || 0), 0)

  // --- KB naliczone ---
  const kbSum = inv.reduce((s, i) => s + (i.buildingCosts || 0), 0)

  // --- Terminowosc wplat (12 mc) ---
  let early = 0; let late = 0; let weighted = 0; let paidTotal = 0; let maxLate = 0
  for (const i of inv) {
    if (!i.dueDate) continue
    const due = new Date(i.dueDate); due.setHours(0, 0, 0, 0)
    for (const p of i.payments) {
      const paidAt = new Date(p.paidAt)
      if (paidAt < m12) continue
      paidAt.setHours(0, 0, 0, 0)
      const days = Math.round((paidAt.getTime() - due.getTime()) / dayMs)
      paidTotal += p.amount
      weighted += days * p.amount
      if (days <= 0) early += p.amount
      else { late += p.amount; maxLate = Math.max(maxLate, days) }
    }
  }
  const avgDays = paidTotal > 0 ? Math.round((weighted / paidTotal) * 10) / 10 : null
  const earlyPct = paidTotal > 0 ? Math.round((early / paidTotal) * 100) : null

  // --- DPO (mediana dni wystawienie -> ostatnia wplata; OPLACONE, rozliczone w 12 mc) ---
  const dpoDays = inv
    .filter((i) => i.status === 'OPLACONA' && i.payments.length)
    .map((i) => ({ settle: new Date(Math.max(...i.payments.map((p) => new Date(p.paidAt).getTime()))), issue: i.issueDate }))
    .filter((x) => x.settle >= m12)
    .map((x) => Math.max(0, Math.round((x.settle.getTime() - new Date(x.issue).getTime()) / dayMs)))
    .sort((a, b) => a - b)
  const dpoMedian = dpoDays.length
    ? (dpoDays.length % 2 ? dpoDays[Math.floor(dpoDays.length / 2)] : Math.round((dpoDays[dpoDays.length / 2 - 1] + dpoDays[dpoDays.length / 2]) / 2))
    : null

  // --- Trend zakupow 12 mc (kwota brutto per miesiac) ---
  const months: { label: string; sum: number }[] = []
  for (let k = 11; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
    const next = new Date(now.getFullYear(), now.getMonth() - k + 1, 1)
    const sum = inv.filter((i) => i.issueDate >= d && i.issueDate < next).reduce((s, i) => s + i.amountGross, 0)
    months.push({ label: d.toLocaleDateString('pl-PL', { month: 'short' }), sum })
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.sum))

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <Link href="/finanse/kontrahenci" className="text-sm text-gray-500 hover:text-gray-700">← Wszyscy kontrahenci</Link>
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {vendor.name}
              {!vendor.isActive && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-normal">nieaktywny</span>}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {VENDOR_CATEGORY_LABELS[vendor.category as VendorCategory] || vendor.category}
              {vendor.nip && <> • NIP <span className="font-mono">{vendor.nip}</span></>}
              {ksefCount > 0 && <> • {ksefCount} FV z KSeF</>}
            </p>
            {vendor.notes && <p className="text-sm text-gray-500 mt-1">{vendor.notes}</p>}
          </div>
          <Link
            href={`/finanse/faktury?vendor=${vendor.id}`}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Faktury ({inv.length}) →
          </Link>
        </div>
      </div>

      {/* Warunki umowne */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-1">Warunki umowne</h2>
        <p className="text-xs text-gray-500 mb-3">
          Kaucja gwarancyjna, okres zwrotu, % kosztów budowy i baza naliczania (netto/brutto) — z umowy.
          Prefilują nowe faktury i naliczają się automatycznie przy synchronizacji KSeF.
        </p>
        <VendorTermsCell
          vendorId={vendor.id}
          terms={vendor.terms}
          legacyDepositPct={vendor.defaultDepositPct}
          legacyKbPct={vendor.defaultBuildingCostsPct}
        />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="Zakupy — 12 mies." value={fmtMoney(total12)} />
        <Kpi label="Zakupy — całość" value={fmtMoney(totalAll)} sub={`${inv.length} faktur`} />
        <Kpi label="Pozostało do zapłaty" value={remaining > 0.01 ? fmtMoney(remaining) : '—'} tone={remaining > 0.01 ? 'red' : undefined} />
        <Kpi
          label="Kaucje zatrzymane"
          value={heldSum > 0.01 ? fmtMoney(heldSum) : '—'}
          sub={nextReturn ? `najbliższy zwrot ${fmtDate(nextReturn)}` : returnedSum > 0 ? `zwrócone ${fmtMoneyShort(returnedSum)}` : undefined}
          tone={heldSum > 0.01 ? 'amber' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 items-start">
        {/* Terminowosc platnosci */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Terminowość naszych płatności</h2>
          <p className="text-xs text-gray-500 mb-3">wpłaty z ostatnich 12 miesięcy vs terminy faktur</p>
          {paidTotal > 0.01 ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 flex rounded-full overflow-hidden h-2.5 bg-gray-100">
                  <div className="h-full bg-emerald-500" style={{ width: `${earlyPct}%` }} />
                  <div className="h-full bg-red-400" style={{ width: `${100 - (earlyPct || 0)}%` }} />
                </div>
                <span className="text-sm text-gray-700 whitespace-nowrap">
                  <strong className="text-emerald-700 tabular-nums">{earlyPct}%</strong> w terminie
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Przed terminem / w terminie</p>
                  <p className="font-semibold text-emerald-700 tabular-nums">{fmtMoney(early)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Po terminie</p>
                  <p className="font-semibold text-red-600 tabular-nums">{late > 0.01 ? fmtMoney(late) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Średni poślizg (ważony kwotą)</p>
                  <p className={`font-semibold tabular-nums ${avgDays != null && avgDays > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    {avgDays != null ? `${avgDays > 0 ? '+' : ''}${avgDays} dni` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Najdłuższe opóźnienie / DPO</p>
                  <p className="font-semibold text-gray-900 tabular-nums">
                    {maxLate > 0 ? `+${maxLate} dni` : '—'}
                    {dpoMedian != null && <span className="text-gray-400 font-normal"> • mediana {dpoMedian} dni</span>}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">Brak wpłat z terminem w ostatnich 12 miesiącach.</p>
          )}
        </div>

        {/* Trend zakupow 12 mc */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Zakupy miesięcznie</h2>
          <p className="text-xs text-gray-500 mb-3">brutto wg daty wystawienia — 12 miesięcy{kbSum > 0.01 ? ` • naliczone KB łącznie: ${fmtMoney(kbSum)}` : ''}</p>
          <div className="flex items-end gap-1 h-28">
            {months.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${m.label}: ${fmtMoney(m.sum)}`}>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(m.sum > 0 ? 4 : 1, (m.sum / maxMonth) * 96)}px`,
                    background: m.sum > 0 ? 'var(--accent)' : 'rgba(128,128,128,.15)',
                  }}
                />
                <span className="text-[9px] text-gray-400 truncate">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' | 'amber' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
