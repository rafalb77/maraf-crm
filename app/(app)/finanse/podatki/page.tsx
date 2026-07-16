import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtMoney } from '@/lib/finanse-format'
import { COMPANY_LABELS, CIT_RATE, type Company } from '@/lib/types'
import { getActiveCompany } from '@/lib/finanse-company'

// Orientacyjne podatki per firma (z kontekstu)/rok:
//  CIT 9% od (przychod netto - koszty netto), bez faktur zaliczkowych/anulowanych
//  VAT do zaplaty = VAT nalezny (przychod) - VAT naliczony (koszt)
export default async function PodatkiPage({ searchParams }: { searchParams: { year?: string } }) {
  const now = new Date()
  const year = parseInt(searchParams.year || String(now.getFullYear()), 10) || now.getFullYear()
  const company = getActiveCompany()
  const yStart = new Date(year, 0, 1)
  const yEnd = new Date(year + 1, 0, 1)

  const [salesAgg, purchaseAgg] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: { company, isAdvance: false, status: { not: 'ANULOWANA' }, issueDate: { gte: yStart, lt: yEnd } },
      _sum: { amountNet: true, amountVat: true },
      _count: true,
    }),
    prisma.purchaseInvoice.aggregate({
      where: { company, status: { not: 'ANULOWANA' }, issueDate: { gte: yStart, lt: yEnd } },
      _sum: { amountNet: true, amountVat: true },
      _count: true,
    }),
  ])

  const przychodNet = salesAgg._sum.amountNet || 0
  const kosztNet = purchaseAgg._sum.amountNet || 0
  const podstawaCit = przychodNet - kosztNet
  const cit = podstawaCit > 0 ? Math.round(podstawaCit * CIT_RATE * 100) / 100 : 0

  const vatNalezny = salesAgg._sum.amountVat || 0
  const vatNaliczony = purchaseAgg._sum.amountVat || 0
  const vatDoZaplaty = vatNalezny - vatNaliczony

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Podatki (orientacyjnie)</h1>
        <p className="text-gray-500 text-sm mt-1">CIT {(CIT_RATE * 100).toFixed(0)}% + VAT do zapłaty, narastająco za rok. Bez faktur zaliczkowych.</p>
      </div>

      {/* Filtr rok (firma z globalnego przelacznika u gory) */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {years.map((y) => (
          <Link key={y} href={`/finanse/podatki?year=${y}`}
            className={`px-3 py-1.5 rounded-lg border text-sm ${year === y ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {y}
          </Link>
        ))}
      </div>

      {/* CIT */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">CIT {(CIT_RATE * 100).toFixed(0)}% — {COMPANY_LABELS[company as Company]} {year}</h2>
        <div className="space-y-2 text-sm">
          <Line label={`Przychód netto (${salesAgg._count} faktur)`} value={fmtMoney(przychodNet)} />
          <Line label={`Koszty netto (${purchaseAgg._count} faktur)`} value={`− ${fmtMoney(kosztNet)}`} />
          <div className="border-t border-gray-200 my-2" />
          <Line label="Podstawa opodatkowania" value={fmtMoney(podstawaCit)} bold />
          <Line label={`CIT ${(CIT_RATE * 100).toFixed(0)}% do zapłaty`} value={fmtMoney(cit)} accent={cit > 0 ? 'red' : 'green'} big />
        </div>
        {podstawaCit <= 0 && <p className="text-xs text-green-600 mt-2">Koszty ≥ przychody → brak podstawy CIT (strata podatkowa).</p>}
      </div>

      {/* VAT */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">VAT — {year}</h2>
        <div className="space-y-2 text-sm">
          <Line label="VAT należny (z faktur przychodowych)" value={fmtMoney(vatNalezny)} />
          <Line label="VAT naliczony (z faktur kosztowych)" value={`− ${fmtMoney(vatNaliczony)}`} />
          <div className="border-t border-gray-200 my-2" />
          <Line
            label={vatDoZaplaty >= 0 ? 'VAT do zapłaty' : 'VAT do zwrotu / przeniesienia'}
            value={fmtMoney(Math.abs(vatDoZaplaty))}
            accent={vatDoZaplaty > 0 ? 'red' : 'green'}
            big
          />
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        ⚠️ <strong>Wartości orientacyjne</strong> — pomagają oszacować ile faktur można jeszcze wystawić / ile kosztów dobrać.
        Oficjalne rozliczenie robi biuro księgowe (Saldeo). CIT liczony liniowo {(CIT_RATE * 100).toFixed(0)}% od różnicy
        przychód−koszt; nie uwzględnia zaliczek na podatek, kosztów nieuznawanych podatkowo, amortyzacji itp.
      </div>
    </div>
  )
}

function Line({ label, value, bold, big, accent }: { label: string; value: string; bold?: boolean; big?: boolean; accent?: 'red' | 'green' }) {
  const color = accent === 'red' ? 'text-red-600' : accent === 'green' ? 'text-green-700' : 'text-gray-900'
  return (
    <div className="flex items-baseline justify-between flex-wrap gap-x-3">
      <span className="text-gray-600">{label}</span>
      <span className={`tabular-nums ${big ? 'text-xl font-bold' : bold ? 'font-semibold' : ''} ${color}`}>{value}</span>
    </div>
  )
}
