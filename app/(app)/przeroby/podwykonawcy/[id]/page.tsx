import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { SubcontractorActions } from '@/components/przeroby/SubcontractorActions'
import { VendorBridge } from '@/components/budowa/VendorBridge'

export default async function PodwykonawcaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sub = await prisma.subcontractor.findUnique({
    where: { id },
    include: {
      protocols: {
        orderBy: [{ periodTo: 'desc' }],
        include: { contract: true },
      },
      contracts: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!sub) notFound()

  // Kontrahenci do mostka (Etap 3): aktywni + bieżący gdyby był nieaktywny
  const bridgeVendors = await prisma.vendor.findMany({
    where: { isActive: true },
    select: { id: true, name: true, nip: true },
    orderBy: { name: 'asc' },
  })

  function fmtDate(d: Date) {
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-2 text-sm">
        <Link href="/przeroby/podwykonawcy" className="text-gray-500 hover:text-gray-700">
          ← Podwykonawcy
        </Link>
      </div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{sub.name}</h1>
          {sub.nip && <p className="text-gray-500 text-sm mt-1">NIP {sub.nip}</p>}
          {!sub.active && (
            <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
              nieaktywny
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href={`/przeroby/protokoly/nowy?sub=${sub.id}`}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Nowy protokół
          </Link>
          <SubcontractorActions
            id={sub.id}
            name={sub.name}
            active={sub.active}
            protocolCount={sub.protocols.length}
            contractCount={sub.contracts.length}
          />
        </div>
      </div>

      <div className="mb-5">
        <VendorBridge
          subcontractorId={sub.id}
          subNip={sub.nip}
          vendorId={sub.vendorId}
          vendors={bridgeVendors}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Dane */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold text-gray-900 mb-2">Dane firmy</h2>
          <Detail label="Adres" value={[sub.address, sub.zipCode, sub.city].filter(Boolean).join(', ')} />
          <Detail label="Kontakt" value={sub.contactName} />
          <Detail label="Telefon" value={sub.phone} />
          <Detail label="Email" value={sub.email} />
          <Detail label="Konto" value={sub.bankAccount} />
          {sub.notes && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Notatki</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{sub.notes}</p>
            </div>
          )}
        </div>

        {/* Protokoły */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Protokoły przerobowe</h2>
          {sub.protocols.length === 0 ? (
            <p className="text-sm text-gray-400">Brak protokołów.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] lg:min-w-0 text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left py-2 font-medium">Okres</th>
                  <th className="text-left py-2 font-medium">Numer</th>
                  <th className="text-left py-2 font-medium">Status</th>
                  <th className="text-right py-2 font-medium">Wartość netto</th>
                </tr>
              </thead>
              <tbody>
                {sub.protocols.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="py-2">
                      <Link href={`/przeroby/protokoly/${p.id}`} className="text-blue-600 hover:underline">
                        {fmtDate(p.periodFrom)} – {fmtDate(p.periodTo)}
                      </Link>
                    </td>
                    <td className="py-2 text-gray-600">{p.number || '—'}</td>
                    <td className="py-2"><StatusBadge status={p.status} /></td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {p.totalNet.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-700">{value}</p>
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
