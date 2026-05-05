import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function PrzerobyHomePage() {
  const [summariesCount, subsCount, protocolsCount, draftCount, contracts] = await Promise.all([
    prisma.floorSummary.count(),
    prisma.subcontractor.count({ where: { active: true } }),
    prisma.protocol.count(),
    prisma.protocol.count({ where: { status: 'SZKIC' } }),
    prisma.subContract.findMany({
      where: { status: { not: 'ANULOWANA' } },
      include: {
        subcontractor: true,
        protocols: {
          where: { status: { not: 'ANULOWANY' } },
          select: { totalNet: true },
        },
      },
    }),
  ])

  const contractProgress = contracts.map((c) => {
    const billed = c.protocols.reduce((s, p) => s + p.totalNet, 0)
    const total = c.valueNet || 0
    const pct = total > 0 ? Math.min(100, (billed / total) * 100) : 0
    return { id: c.id, title: c.title, subName: c.subcontractor.name, billed, total, pct }
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Przeroby</h1>
        <p className="text-gray-500 text-sm mt-1">
          Kontroling protokołów przerobowych podwykonawców
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ModuleTile
          href="/przeroby/porownanie"
          title="Porównania"
          desc="Podsumowania kierownika vs obmiar inżynierski"
          stat={String(summariesCount)}
          statLabel="kondygnacji"
        />
        <ModuleTile
          href="/przeroby/podwykonawcy"
          title="Podwykonawcy"
          desc="Baza firm wykonawczych"
          stat={String(subsCount)}
          statLabel="aktywnych"
        />
        <ModuleTile
          href="/przeroby/protokoly"
          title="Protokoły"
          desc="Miesięczne rozliczenia robót"
          stat={String(protocolsCount)}
          statLabel="łącznie"
        />
        <ModuleTile
          href="/przeroby/protokoly"
          title="W trakcie"
          desc="Szkice protokołów do dokończenia"
          stat={String(draftCount)}
          statLabel="szkiców"
        />
      </div>

      {contractProgress.length > 0 && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Postęp realizacji umów</h2>
          <div className="space-y-4">
            {contractProgress.map((c) => (
              <div key={c.id}>
                <div className="flex items-baseline justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.subName}</p>
                    <p className="text-xs text-gray-500 truncate">{c.title}</p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-sm font-medium text-gray-900">
                      {c.billed.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                      {c.total > 0 && (
                        <span className="text-gray-400 text-xs">
                          {' '}/ {c.total.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">{c.pct.toFixed(1)}% kontraktu</p>
                  </div>
                </div>
                <div className="bg-gray-200 rounded-full overflow-hidden h-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${c.pct}%`,
                      backgroundColor: c.pct >= 95 ? '#16a34a' : c.pct >= 50 ? '#ca8a04' : '#2563eb',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-2">Co to jest?</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Moduł <strong>Przeroby</strong> obsługuje rozliczanie podwykonawców na bazie
          protokołów przerobowych — comiesięcznych dokumentów potwierdzających zakres i wartość
          robót wykonanych w danym okresie. Każdy protokół można powiązać z umową, zatwierdzić
          i przekazać do księgowości jako podstawę faktury.
        </p>
        <p className="text-xs text-gray-400 mt-3">
          Struktura modułu: Podwykonawcy → Umowy → Protokoły → (w przyszłości) Faktury, Kaucje, Gwarancje.
        </p>
      </div>
    </div>
  )
}

function ModuleTile({
  href,
  title,
  desc,
  stat,
  statLabel,
}: {
  href: string
  title: string
  desc: string
  stat: string
  statLabel: string
}) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xl font-semibold" style={{ color: 'var(--accent)' }}>{stat}</span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{statLabel}</p>
      <p className="text-sm text-gray-600">{desc}</p>
    </Link>
  )
}
