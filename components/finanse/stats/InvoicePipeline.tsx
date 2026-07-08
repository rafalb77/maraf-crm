import Link from 'next/link'
import { fmtMoney, fmtMoneyShort } from '@/lib/finanse-format'
import type { PipelineData } from '@/lib/finanse-stats'

const BUCKET_BG: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
}
const BUCKET_TEXT: Record<string, string> = {
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
}

// Zatory w obiegu faktur — jak dlugo FV wisza w statusach
// WPROWADZONA / DO_ZATWIERDZENIA (wiek = dzis - createdAt).
// Server component, czysty Tailwind.
export function InvoicePipeline({ data }: { data: PipelineData }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900">Zatory w obiegu faktur</h2>
        <span className="text-xs text-gray-400">wprowadzone / do zatwierdzenia — wiek w obiegu</span>
      </div>

      {data.total === 0 ? (
        <p className="text-sm text-emerald-700 mt-4">✓ Obieg czysty — żadna faktura nie czeka na zatwierdzenie.</p>
      ) : (
        <>
          <p className="text-sm text-gray-600 mt-1 mb-4">
            <strong className="text-gray-900 tabular-nums">{data.total}</strong> faktur na{' '}
            <strong className="text-gray-900 tabular-nums">{fmtMoney(data.totalSum)}</strong> czeka w obiegu
            {' '}(<Link href="/finanse/faktury?status=WPROWADZONA" className="text-blue-600 hover:underline">{data.wprowadzoneCount} wprowadzonych</Link>
            {' • '}
            <Link href="/finanse/faktury?status=DO_ZATWIERDZENIA" className="text-blue-600 hover:underline">{data.doZatwierdzeniaCount} do zatwierdzenia</Link>)
          </p>

          {/* Pasek segmentowy — szerokosc proporcjonalna do kwot */}
          <div className="flex rounded-full overflow-hidden h-3 bg-gray-100">
            {data.buckets.map((b) => (
              b.sum > 0 && (
                <div
                  key={b.label}
                  className={`h-full ${BUCKET_BG[b.color]}`}
                  style={{ width: `${(b.sum / data.totalSum) * 100}%` }}
                  title={`${b.label} w obiegu: ${b.count} FV, ${fmtMoney(b.sum)}`}
                />
              )
            ))}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {data.buckets.map((b) => (
              <span key={b.label} className="text-xs text-gray-600 flex items-center gap-1.5">
                <span className={`inline-block w-2 h-2 rounded-full ${BUCKET_BG[b.color]}`} />
                {b.label}:{' '}
                <strong className={`tabular-nums ${b.count > 0 ? BUCKET_TEXT[b.color] : 'text-gray-400'}`}>
                  {b.count} FV{b.sum > 0 ? ` (${fmtMoneyShort(b.sum)})` : ''}
                </strong>
              </span>
            ))}
          </div>

          {data.urgentCount > 0 && (
            <p className="text-xs text-red-600 font-medium mt-3 pt-3 border-t border-gray-100">
              ⚠ {data.urgentCount} {data.urgentCount === 1 ? 'faktura ma' : 'faktury mają'} termin płatności bliżej niż 7 dni
              ({fmtMoney(data.urgentSum)}) — pogoń obieg, zanim zrobią się zaległe.
            </p>
          )}
        </>
      )}
    </div>
  )
}
