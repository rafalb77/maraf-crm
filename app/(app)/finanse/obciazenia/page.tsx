import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtMoney } from '@/lib/finanse-format'
import { getActiveCompany } from '@/lib/finanse-company'
import { loadObciazenia } from '@/lib/obciazenia'

type SearchParams = { q?: string }

const r2 = (n: number) => Math.round(n * 100) / 100

// Obciazenia kontrahentow — kaucje gwarancyjne, koszty budowy, kary i prad,
// zgrupowane per EFEKTYWNY kontrahent (etykieta podwykonawcy lub vendor).
// Wszystkie sumy w NETTO. Klik w kontrahenta -> widok szczegolowy z wyborem
// i sumowaniem pozycji.
export default async function ObciazeniaPage({ searchParams }: { searchParams: SearchParams }) {
  const company = getActiveCompany()
  const q = (searchParams.q || '').trim().toLowerCase()

  const map = await loadObciazenia(company)
  let rows = [...map.values()].filter((b) => b.netTotal > 0.004 || b.items.length > 0)
  if (q) rows = rows.filter((b) => b.label.toLowerCase().includes(q) || (b.umbrella || '').toLowerCase().includes(q))
  rows.sort((a, b) => b.netTotal - a.netTotal)

  const sumKaucje = r2(rows.reduce((s, b) => s + b.netKaucje, 0))
  const sumKb = r2(rows.reduce((s, b) => s + b.netKb, 0))
  const sumKary = r2(rows.reduce((s, b) => s + b.netKary, 0))
  const sumPrad = r2(rows.reduce((s, b) => s + b.netPrad, 0))
  const sumTotal = r2(sumKaucje + sumKb + sumKary + sumPrad)
  const overdue = rows.reduce((s, b) => s + b.overdueReturns, 0)

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Obciążenia kontrahentów</h1>
        <p className="text-gray-500 text-sm mt-1">
          Kaucje gwarancyjne, koszty budowy, kary i prąd — per kontrahent, kwoty <strong>netto</strong>.
          {overdue > 0 && <span className="text-red-600"> • {overdue} {overdue === 1 ? 'kaucja po terminie' : 'kaucji po terminie'} zwrotu</span>}
        </p>
      </div>

      {/* Sumy globalne */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Kpi label="Razem obciążenia" value={fmtMoney(sumTotal)} bold />
        <Kpi label="Kaucje (trzymane)" value={fmtMoney(sumKaucje)} tone="amber" />
        <Kpi label="Koszty budowy" value={fmtMoney(sumKb)} tone="blue" />
        <Kpi label="Kary (aktywne)" value={fmtMoney(sumKary)} tone="rose" />
        <Kpi label="Prąd" value={fmtMoney(sumPrad)} tone="sky" />
      </div>

      <form method="get" className="mb-4">
        <input
          name="q"
          defaultValue={searchParams.q || ''}
          placeholder="Szukaj kontrahenta..."
          className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px] lg:min-w-0">
            <thead className="bg-gray-50 border-b border-gray-200 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700">Kontrahent</th>
                <th className="px-4 py-3 font-medium text-gray-700 text-right">Kaucje gw.</th>
                <th className="px-4 py-3 font-medium text-gray-700 text-right">Koszty budowy</th>
                <th className="px-4 py-3 font-medium text-gray-700 text-right">Kary</th>
                <th className="px-4 py-3 font-medium text-gray-700 text-right">Prąd</th>
                <th className="px-4 py-3 font-medium text-gray-700 text-right">Razem netto</th>
                <th className="px-4 py-3 font-medium text-gray-700 text-right">Pozycji</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    {q ? 'Brak kontrahentów pasujących do wyszukiwania.' : (
                      <>Brak obciążeń. Kaucje/KB/prąd dodajesz w szczegółach faktury („Kaucja i potrącenia"),
                      kary — w widoku kontrahenta tutaj.</>
                    )}
                  </td>
                </tr>
              )}
              {rows.map((b) => (
                <tr key={b.label} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/finanse/obciazenia/${encodeURIComponent(b.label)}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {b.label}
                    </Link>
                    {b.umbrella && <div className="text-xs text-gray-400">{b.umbrella}</div>}
                    {b.overdueReturns > 0 && (
                      <div className="text-xs text-red-600">⚠ {b.overdueReturns} {b.overdueReturns === 1 ? 'kaucja po terminie' : 'kaucji po terminie'}</div>
                    )}
                  </td>
                  <Num v={b.netKaucje} />
                  <Num v={b.netKb} />
                  <Num v={b.netKary} tone={b.netKary > 0 ? 'rose' : undefined} />
                  <Num v={b.netPrad} />
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">{fmtMoney(b.netTotal)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{b.items.length}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold text-gray-900">
                <tr>
                  <td className="px-4 py-3">Razem ({rows.length})</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(sumKaucje)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(sumKb)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(sumKary)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(sumPrad)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(sumTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Kaucje = aktualnie trzymane (zwrócone nie wliczają się) • Kary = aktywne (nierozliczone) •
        KB i prąd = narastająco. Netto pozycji z faktur liczone ze stawki VAT danej faktury.
      </p>
    </div>
  )
}

function Kpi({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'amber' | 'blue' | 'rose' | 'sky' }) {
  const tones = {
    amber: 'text-amber-700', blue: 'text-blue-700', rose: 'text-rose-700', sky: 'text-sky-700',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
      <p className={`tabular-nums mt-1 ${bold ? 'text-xl font-bold text-gray-900' : `text-lg font-semibold ${tone ? tones[tone] : 'text-gray-900'}`}`}>{value}</p>
    </div>
  )
}

function Num({ v, tone }: { v: number; tone?: 'rose' }) {
  return (
    <td className={`px-4 py-2.5 text-right tabular-nums ${v > 0.004 ? (tone === 'rose' ? 'text-rose-700 font-medium' : 'text-gray-700') : 'text-gray-300'}`}>
      {v > 0.004 ? fmtMoney(v) : '—'}
    </td>
  )
}
