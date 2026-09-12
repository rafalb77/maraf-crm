import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  DEFECT_STATUS_RING,
  INSPECTION_KIND_LABELS,
  INSPECTION_STATUS_BADGE,
  INSPECTION_STATUS_LABELS,
  type InspectionKind,
  type InspectionStatus,
} from '@/lib/odbiory/constants'
import { formatDatePl } from '@/lib/odbiory/codes'

/**
 * /odbiory — lista odbiorów (robót od wykonawców, technicznych, z nabywcą).
 * Widok biurowy; obchód robi się w /odbiory/teren/[id] (tablet).
 */
export default async function OdbioryPage({ searchParams }: { searchParams?: { status?: string } }) {
  const status = searchParams?.status && ['W_TOKU', 'ZAKONCZONY', 'ANULOWANY'].includes(searchParams.status) ? searchParams.status : null
  const rows = await prisma.inspection.findMany({
    where: status ? { status } : undefined,
    orderBy: { startedAt: 'desc' },
    take: 200,
    include: {
      subcontractor: { select: { id: true, name: true } },
      defects: { select: { status: true } },
    },
  })
  const totalOpen = rows.filter((r) => r.status === 'W_TOKU').length

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Odbiory robót</h1>
          <p className="mt-1 text-sm text-gray-500">
            Usterki jako pinezki na rzucie, pakiety poprawek dla wykonawców, protokoły. {totalOpen} w toku · {rows.length} łącznie
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/odbiory/slownik" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Słownik usterek
          </Link>
          <Link href="/odbiory/nowy" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
            + Nowy odbiór
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[
          { key: null, label: 'Wszystkie' },
          { key: 'W_TOKU', label: 'W toku' },
          { key: 'ZAKONCZONY', label: 'Zakończone' },
          { key: 'ANULOWANY', label: 'Anulowane' },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.key ? `/odbiory?status=${f.key}` : '/odbiory'}
            className={`rounded-full px-3 py-1 ${status === f.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          Brak odbiorów. Zacznij od <Link href="/odbiory/nowy" className="text-blue-700 underline">nowego odbioru</Link> — wybierzesz budynek, klatkę i kondygnację, a potem stawiasz pinezki na rzucie.
        </div>
      ) : (
        <>
          {/* mobile: karty */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => {
              const c = countBy(r.defects)
              return (
                <li key={r.id} className="relative rounded-xl border border-gray-200 bg-white p-4">
                  <Link href={`/odbiory/${r.id}`} className="absolute inset-0" aria-label={r.number} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-500">{r.number}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${INSPECTION_STATUS_BADGE[r.status as InspectionStatus] || ''}`}>{INSPECTION_STATUS_LABELS[r.status as InspectionStatus] || r.status}</span>
                  </div>
                  <div className="mt-1 font-semibold text-gray-900">{r.scopeName}</div>
                  <div className="text-sm text-gray-500">
                    {INSPECTION_KIND_LABELS[r.kind as InspectionKind] || r.kind}
                    {r.subcontractor ? ` · ${r.subcontractor.name}` : ''} · {formatDatePl(r.startedAt)}
                  </div>
                  <Counters c={c} />
                </li>
              )
            })}
          </ul>
          {/* desktop: tabela */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Numer</th>
                  <th className="px-4 py-3">Zakres</th>
                  <th className="px-4 py-3">Rodzaj / wykonawca</th>
                  <th className="px-4 py-3">Prowadzący</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Usterki</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const c = countBy(r.defects)
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        <Link href={`/odbiory/${r.id}`} className="hover:underline">{r.number}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link href={`/odbiory/${r.id}`} className="hover:underline">{r.scopeName}</Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {INSPECTION_KIND_LABELS[r.kind as InspectionKind] || r.kind}
                        {r.subcontractor ? <div className="text-xs text-gray-500">{r.subcontractor.name}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.inspectorName || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDatePl(r.startedAt)}</td>
                      <td className="px-4 py-3"><Counters c={c} /></td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${INSPECTION_STATUS_BADGE[r.status as InspectionStatus] || ''}`}>{INSPECTION_STATUS_LABELS[r.status as InspectionStatus] || r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/odbiory/teren/${r.id}`} className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100">
                          Teren
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function countBy(defects: { status: string }[]) {
  const c: Record<string, number> = {}
  for (const d of defects) c[d.status] = (c[d.status] || 0) + 1
  return c
}

function Counters({ c }: { c: Record<string, number> }) {
  const items: [string, string][] = [
    ['DO_POPRAWY', 'do poprawy'],
    ['POPRAWIONA', 'do odbioru'],
    ['ODEBRANA', 'odebrane'],
    ['SPORNA', 'sporne'],
  ]
  return (
    <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-700">
      {items.map(([k, label]) =>
        c[k] ? (
          <span key={k} className="flex items-center gap-1" title={label}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DEFECT_STATUS_RING[k as keyof typeof DEFECT_STATUS_RING] }} />
            {c[k]}
          </span>
        ) : null,
      )}
      {Object.keys(c).length === 0 && <span className="text-gray-400">brak</span>}
    </div>
  )
}
