import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { matchProtocolItemToMaraf, type MarafWorkItemLite } from '@/lib/protokol-maraf-match'
import { MarafCompareCell } from '@/components/przeroby/MarafCompareCell'

const monthNames = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']

export default async function ProtokolPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const protocol = await prisma.protocol.findUnique({
    where: { id },
    include: {
      subcontractor: true,
      contract: true,
      items: {
        include: { contractWorkItem: true },
        orderBy: { contractWorkItem: { globalOrder: 'asc' } },
      },
    },
  })
  if (!protocol) notFound()

  // Obmiar inżynierski Maraf (WorkItem zakresu konstrukcji żelbetowej) — źródło
  // kolumny porównawczej "Maraf (obmiar)". Liczone na żywo, read-only.
  // Logika dopasowania: lib/protokol-maraf-match.ts.
  const marafRaw = await prisma.workItem.findMany({
    where: { category: { scope: { slug: 'konstrukcja-zelbetowa' } } },
    select: {
      areaM2: true,
      volumeM3: true,
      floor: true,
      elementType: true,
      category: { select: { name: true } },
    },
  })
  const marafItems: MarafWorkItemLite[] = marafRaw.map((wi) => ({
    categoryName: wi.category.name,
    floor: wi.floor,
    elementType: wi.elementType,
    areaM2: wi.areaM2,
    volumeM3: wi.volumeM3,
  }))

  // Wszystkie protokoły tej umowy z mniejszą lub równą datą periodTo
  // (do wyliczenia "wartości wg poprzedniego protokołu" oraz "łącznie do dnia")
  const allProtocols = await prisma.protocol.findMany({
    where: {
      contractId: protocol.contractId,
      status: { not: 'ANULOWANY' },
    },
    include: { items: true },
    orderBy: [{ periodTo: 'asc' }, { createdAt: 'asc' }],
  })

  // Kumulatywna suma wartości DO TEGO protokołu (wyłącznie)
  const previousValue: Record<string, number> = {} // contractWorkItemId -> qty
  const previousAmount: Record<string, number> = {}
  let cumulativeBefore = 0
  for (const p of allProtocols) {
    if (p.periodTo < protocol.periodTo || (p.periodTo.getTime() === protocol.periodTo.getTime() && p.id !== protocol.id && p.createdAt < protocol.createdAt)) {
      cumulativeBefore += p.totalNet
      for (const it of p.items) {
        previousValue[it.contractWorkItemId] = (previousValue[it.contractWorkItemId] || 0) + it.qty
        previousAmount[it.contractWorkItemId] = (previousAmount[it.contractWorkItemId] || 0) + it.amountNet
      }
    }
  }

  // Pogrupuj po sekcji
  const bySection: Record<string, typeof protocol.items> = {}
  const sectionOrder: string[] = []
  for (const it of protocol.items) {
    const sec = it.contractWorkItem.section || 'Pozostałe'
    if (!bySection[sec]) {
      bySection[sec] = []
      sectionOrder.push(sec)
    }
    bySection[sec].push(it)
  }

  return (
    <div className="p-8">
      <div className="mb-2 text-sm">
        <Link href="/przeroby/protokoly" className="text-gray-500 hover:text-gray-700">
          ← Protokoły
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Protokół przerobowy {protocol.number ? `#${protocol.number}` : ''}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            <Link href={`/przeroby/podwykonawcy/${protocol.subcontractor.id}`} className="hover:text-blue-600">
              {protocol.subcontractor.name}
            </Link>
            {' · '}
            okres: {fmtDate(protocol.periodFrom)} – {fmtDate(protocol.periodTo)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={protocol.status} />
        </div>
      </div>

      {marafItems.length === 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Brak obmiaru Maraf w bazie (zakres „konstrukcja-zelbetowa"). Kolumna „Maraf (obmiar)" będzie pusta —
          zaimportuj obmiar skryptem <code className="font-mono text-xs">scripts/import-obmiar.js</code>.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Wartość w okresie" value={`${fmtMoney(protocol.totalNet)} zł`} />
        <Stat label="Wg poprzednich" value={`${fmtMoney(cumulativeBefore)} zł`} muted />
        <Stat label="Łącznie do dnia" value={`${fmtMoney(cumulativeBefore + protocol.totalNet)} zł`} accent="green" />
        <Stat
          label="% kontraktu"
          value={protocol.contract.valueNet ? `${(((cumulativeBefore + protocol.totalNet) / protocol.contract.valueNet) * 100).toFixed(1)}%` : '—'}
          muted
        />
      </div>

      {protocol.items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-sm">Brak pozycji w protokole.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sectionOrder.map((sec) => {
            const items = bySection[sec]
            const secSum = items.reduce((s, it) => s + it.amountNet, 0)
            return (
              <div key={sec} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/60 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 uppercase tracking-wide text-sm">{sec}</h3>
                  <span className="text-sm font-medium tabular-nums">{fmtMoney(secSum)} zł</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500">
                      <tr className="border-t border-gray-100">
                        <th className="text-left px-3 py-2 font-medium w-10">Lp.</th>
                        <th className="text-left px-3 py-2 font-medium">Rodzaj prac</th>
                        <th className="text-center px-2 py-2 font-medium">Jedn.</th>
                        <th className="text-right px-2 py-2 font-medium">Cena</th>
                        <th className="text-right px-2 py-2 font-medium">Plan</th>
                        <th className="text-right px-2 py-2 font-medium">Poprzednio</th>
                        <th className="text-right px-2 py-2 font-medium bg-blue-50/50">W okresie</th>
                        <th className="text-right px-2 py-2 font-medium">Łącznie</th>
                        <th className="text-right px-3 py-2 font-medium border-l-2 border-gray-200 col-maraf-head">Maraf (obmiar)</th>
                        <th className="text-right px-2 py-2 font-medium">%</th>
                        <th className="text-right px-3 py-2 font-medium bg-blue-50/50">Wartość</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => {
                        const prevQty = previousValue[it.contractWorkItemId] || 0
                        const totalQty = prevQty + it.qty
                        const planned = it.contractWorkItem.plannedQty
                        const pct = planned > 0 ? (totalQty / planned) * 100 : 0
                        const marafMatch = matchProtocolItemToMaraf(
                          it.contractWorkItem.name,
                          it.contractWorkItem.section,
                          it.unit,
                          marafItems,
                        )
                        return (
                          <tr key={it.id} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-500 text-xs">{idx + 1}.</td>
                            <td className="px-3 py-2 text-gray-900">{it.contractWorkItem.name}</td>
                            <td className="px-2 py-2 text-center text-xs text-gray-600">{it.unit}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-gray-700">{fmtQty(it.unitPrice)}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-gray-500">{fmtQty(planned)}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-gray-500">{prevQty > 0 ? fmtQty(prevQty) : '—'}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-medium bg-blue-50/30">{fmtQty(it.qty)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmtQty(totalQty)}</td>
                            <td className="px-3 py-2 border-l-2 border-gray-100 col-maraf">
                              <MarafCompareCell
                                itemId={it.id}
                                match={marafMatch}
                                totalQty={totalQty}
                                protocolUnit={it.unit}
                                manualValue={it.marafManualValue}
                                manualNote={it.marafManualNote}
                              />
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-xs">
                              <span className={pct >= 100 ? 'text-green-600 font-medium' : 'text-gray-500'}>
                                {pct.toFixed(0)}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium bg-blue-50/30">
                              {fmtMoney(it.amountNet)} zł
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent, muted }: { label: string; value: string; accent?: 'green'; muted?: boolean }) {
  const color = accent === 'green' ? 'text-green-700' : muted ? 'text-gray-500' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    SZKIC:        { label: 'szkic',         cls: 'bg-gray-100 text-gray-600' },
    ZATWIERDZONY: { label: 'zatwierdzony',  cls: 'bg-blue-50 text-blue-700' },
    ZAFAKTUROWANY:{ label: 'zafakturowany', cls: 'bg-green-50 text-green-700' },
    ANULOWANY:    { label: 'anulowany',     cls: 'bg-red-50 text-red-700' },
  }
  const m = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-block px-2.5 py-1 text-xs rounded-lg ${m.cls}`}>{m.label}</span>
}
function fmtQty(n: number) { return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtMoney(n: number) { return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d: Date) {
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
