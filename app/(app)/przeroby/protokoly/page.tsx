import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { ProtocolRowActions } from '@/components/przeroby/ProtocolRowActions'

export default async function ProtokolyPage() {
  const protocols = await prisma.protocol.findMany({
    orderBy: [{ periodTo: 'desc' }, { createdAt: 'desc' }],
    include: {
      subcontractor: true,
      _count: { select: { items: true } },
    },
  })

  function fmtDate(d: Date) {
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Protokoły przerobowe</h1>
          <p className="text-gray-500 text-sm mt-1">
            Comiesięczne rozliczenia robót wykonanych przez podwykonawców
          </p>
        </div>
        <Link
          href="/przeroby/protokoly/nowy"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Nowy protokół
        </Link>
      </div>

      {protocols.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h2 className="font-semibold text-gray-900 mb-2">Brak protokołów</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Utwórz pierwszy miesięczny protokół przerobowy — wybierz podwykonawcę, okres i wprowadź pozycje wykonane w tym miesiącu.
          </p>
          <Link
            href="/przeroby/protokoly/nowy"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Utwórz protokół
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] lg:min-w-0 text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Okres</th>
                <th className="text-left px-3 py-3 font-medium">Numer</th>
                <th className="text-left px-3 py-3 font-medium">Podwykonawca</th>
                <th className="text-right px-3 py-3 font-medium">Pozycji</th>
                <th className="text-right px-3 py-3 font-medium">Netto</th>
                <th className="text-right px-3 py-3 font-medium">Kaucja</th>
                <th className="text-right px-3 py-3 font-medium">Do zapłaty</th>
                <th className="text-right px-3 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {protocols.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/40">
                  <td className="px-5 py-3 font-medium">
                    <Link href={`/przeroby/protokoly/${p.id}`} className="hover:text-blue-600">
                      {fmtDate(p.periodFrom)} – {fmtDate(p.periodTo)}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-gray-600 font-mono text-xs">{p.number || '—'}</td>
                  <td className="px-3 py-3 text-gray-700">{p.subcontractor.name}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{p._count.items}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {p.totalNet.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                    {p.retentionAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    {p.payableNet.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                  </td>
                  <td className="px-3 py-3 text-right">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ProtocolRowActions
                      id={p.id}
                      status={p.status}
                      label={`${fmtDate(p.periodFrom)}–${fmtDate(p.periodTo)}`}
                      subName={p.subcontractor.name}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
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
  return <span className={`inline-block px-2 py-0.5 text-xs rounded ${m.cls}`}>{m.label}</span>
}
