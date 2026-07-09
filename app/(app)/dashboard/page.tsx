import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import { formatDateTime, formatCurrency } from '@/lib/utils'
import {
  CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS,
  ACTIVITY_TYPE_LABELS, SERVICE_STATUS_COLORS, SERVICE_STATUS_LABELS
} from '@/lib/types'
import { TopWidget } from '@/components/dashboard/TopWidget'
import { TaskWidget } from '@/components/dashboard/TaskWidget'
import { getSalesValue } from '@/lib/sales-metrics'

async function getDashboardData() {
  const [unitsByStatus, residentialByStatus, clientsByStatus, openService, recentActivities, recentClients, revenueData, residentialAll, residentialSold, salesValue] = await Promise.all([
    prisma.unit.groupBy({ by: ['status'], _count: true }),
    // Tylko lokale mieszkalne (bez usługowych, miejsc postojowych, garaży, komórek) — kafelek „Wolne mieszkania"
    prisma.unit.groupBy({ by: ['status'], where: { type: 'MIESZKALNY' }, _count: true }),
    prisma.client.groupBy({ by: ['status'], _count: true }),
    prisma.serviceRequest.findMany({
      where: { status: { not: 'ZAKONCZONE' } },
      include: { client: true, unit: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.activity.findMany({
      take: 8,
      orderBy: { date: 'desc' },
      include: { client: true },
    }),
    prisma.client.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { clientUnits: { include: { unit: true } } },
    }),
    prisma.unit.aggregate({
      where: { status: 'SPRZEDANY' },
      _sum: { priceGross: true },
    }),
    // Mieszkania: cały portfel (PUM inwestycji = suma powierzchni wszystkich MIESZKALNY)
    prisma.unit.aggregate({
      where: { type: 'MIESZKALNY' },
      _sum: { area: true, priceGross: true },
      _count: true,
    }),
    // Mieszkania sprzedane: wartość, powierzchnia (PUM sprzedane), sztuki
    prisma.unit.aggregate({
      where: { type: 'MIESZKALNY', status: 'SPRZEDANY' },
      _sum: { area: true, priceGross: true },
      _count: true,
    }),
    // Wartość sprzedaży — wspólne źródło prawdy (cena z umowy wiążącej, nie cennik).
    getSalesValue(),
  ])

  return { unitsByStatus, residentialByStatus, clientsByStatus, openService, recentActivities, recentClients, revenueData, residentialAll, residentialSold, salesValue }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const { unitsByStatus, residentialByStatus, clientsByStatus, openService, recentActivities, recentClients, revenueData, residentialAll, residentialSold, salesValue } = await getDashboardData()

  const unitStats = Object.fromEntries(unitsByStatus.map((u) => [u.status, u._count]))
  const residentialStats = Object.fromEntries(residentialByStatus.map((u) => [u.status, u._count]))
  const totalResidential = residentialByStatus.reduce((s, u) => s + u._count, 0)
  const clientStats = Object.fromEntries(clientsByStatus.map((c) => [c.status, c._count]))
  const totalUnits = unitsByStatus.reduce((s, u) => s + u._count, 0)
  const totalClients = clientsByStatus.reduce((s, c) => s + c._count, 0)
  // Wartość sprzedaży = cena z umów wiążących (po rabacie), nie cennik. revenueData
  // (suma cennika SPRZEDANYCH) już nieużywane do kwoty — zostaje dla zgodności.
  void revenueData
  const revenue = salesValue.total
  const soldUnits = unitStats['SPRZEDANY'] || 0
  const soldPct = totalUnits > 0 ? Math.round((soldUnits / totalUnits) * 100) : 0

  // Mieszkania (MIESZKALNY): sztuki, wartość i PUM — % PUM liczony po powierzchni
  const mSoldCount = residentialSold._count
  const mSoldValue = salesValue.residential // cena z umowy (po rabacie), nie cennik
  const mSoldArea = residentialSold._sum.area || 0
  const mTotalArea = residentialAll._sum.area || 0
  const pumPct = mTotalArea > 0 ? Math.round((mSoldArea / mTotalArea) * 100) : 0
  const fmtM2 = (n: number) => `${Math.round(n).toLocaleString('pl-PL')} m²`

  return (
    <div className="p-8">
      {/* Top widget: powitanie + news dnia (per user.interests) + pogoda */}
      <TopWidget />

      {/* Centrum zadań: przypomnienia z silnika reguł (rezerwacje, raty) + zadania ręczne */}
      <TaskWidget />

      {/* Bento: hero „Sprzedaż łącznie" (navy + złota poświata) + KPI 2×2 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
        <div
          className="lg:col-span-7 v2-card-in relative overflow-hidden rounded-[24px] p-6 flex flex-col justify-center"
          style={{
            background:
              'radial-gradient(620px 320px at 108% 130%, rgba(201,163,122,.30), transparent 62%), linear-gradient(150deg, #2C3E54 0%, #1F2D3F 55%, #161E2B 100%)',
            boxShadow: '0 12px 32px rgba(28,39,56,.18)',
            animationDelay: '.12s',
          }}
        >
          <div className="v2-eyebrow" style={{ color: 'var(--color-brand-gold)' }}>
            Sprzedaż łącznie
          </div>
          <div className="mt-1.5 flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            <span
              className="font-bold tabular-nums"
              style={{ fontSize: 30, letterSpacing: '-0.02em', color: '#F2E8D6', lineHeight: 1.15 }}
            >
              {formatCurrency(revenue)}
            </span>
            {salesValue.reservation > 0 && (
              <span className="tabular-nums" style={{ fontSize: 15, color: 'rgba(242,232,214,.58)' }}>
                + {formatCurrency(salesValue.reservation)} w rezerwacjach
              </span>
            )}
          </div>
          <div className="mt-1 text-xs" style={{ color: 'rgba(242,232,214,.65)' }}>
            {soldUnits} z {totalUnits} lokali sprzedanych · {soldPct}% inwestycji
          </div>
          <div
            className="mt-3 h-1.5 rounded-full overflow-hidden max-w-[440px]"
            style={{ background: 'rgba(242,232,214,.14)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${soldPct}%`,
                background: 'var(--gradient-brand)',
                boxShadow: '0 0 12px rgba(201,163,122,.5)',
                transition: 'width .7s ease',
              }}
            />
          </div>

          {/* Mieszkania (MIESZKALNY): wartość sprzedanych, sztuki i % PUM po powierzchni */}
          <div
            className="mt-3.5 pt-3 grid grid-cols-3 gap-4 max-w-[560px]"
            style={{ borderTop: '1px solid rgba(242,232,214,.12)' }}
          >
            <div>
              <div className="v2-eyebrow" style={{ color: 'var(--color-brand-gold)' }}>
                Mieszkania
              </div>
              <div className="mt-0.5 font-bold tabular-nums" style={{ fontSize: 16, color: '#F2E8D6' }}>
                {mSoldCount} z {totalResidential}
              </div>
              <div className="text-[11px]" style={{ color: 'rgba(242,232,214,.65)' }}>
                sprzedanych
              </div>
            </div>
            <div>
              <div className="v2-eyebrow" style={{ color: 'var(--color-brand-gold)' }}>
                Wartość
              </div>
              <div className="mt-0.5 font-bold tabular-nums" style={{ fontSize: 16, color: '#F2E8D6' }}>
                {formatCurrency(mSoldValue)}
              </div>
              <div className="text-[11px]" style={{ color: 'rgba(242,232,214,.65)' }}>
                sprzedane mieszkania
              </div>
            </div>
            <div>
              <div className="v2-eyebrow" style={{ color: 'var(--color-brand-gold)' }}>
                PUM
              </div>
              <div className="mt-0.5 font-bold tabular-nums" style={{ fontSize: 16, color: '#F2E8D6' }}>
                {pumPct}%
              </div>
              <div className="text-[11px]" style={{ color: 'rgba(242,232,214,.65)' }}>
                {fmtM2(mSoldArea)} z {fmtM2(mTotalArea)}
              </div>
            </div>
          </div>
        </div>

        <div
          className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4 v2-card-in"
          style={{ animationDelay: '.18s' }}
        >
          <KpiCard
            title="Wolne mieszkania"
            value={String(residentialStats['WOLNY'] || 0)}
            sub={`z ${totalResidential} wszystkich`}
            color="green"
            icon="🏠"
          />
          <KpiCard
            title="Sprzedane"
            value={String(soldUnits)}
            sub={formatCurrency(revenue)}
            color="blue"
            icon="✅"
          />
          <KpiCard
            title="Klienci aktywni"
            value={String(totalClients)}
            sub={`${clientStats['UMOWA'] || 0} z umową`}
            color="purple"
            icon="👤"
          />
          <KpiCard
            title="Usterki otwarte"
            value={String(openService.length)}
            sub="do obsługi"
            color={openService.length > 0 ? 'red' : 'green'}
            icon="🔧"
          />
        </div>
      </div>

      {/* Dolny rząd bento: Status lokali (4) + Lejek (3) + Ostatnie działania (5), usterki pod spodem */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-white rounded-xl border border-gray-200 p-6 v2-card-in" style={{ animationDelay: '.24s' }}>
          <h2 className="font-semibold text-gray-900 mb-4">Status lokali</h2>
          <div className="grid grid-cols-1 gap-3">
            {[
              { status: 'WOLNY', label: 'Wolne', color: 'bg-green-500' },
              { status: 'ZAREZERWOWANY', label: 'Zarezerwowane', color: 'bg-yellow-500' },
              { status: 'SPRZEDANY', label: 'Sprzedane', color: 'bg-blue-500' },
              { status: 'NIEDOSTEPNY', label: 'Niedostępne', color: 'bg-gray-400' },
            ].map(({ status, label, color }) => {
              const count = unitStats[status] || 0
              const pct = totalUnits > 0 ? Math.round((count / totalUnits) * 100) : 0
              return (
                <div key={status} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                  <div className={`w-3 h-3 rounded-full ${color} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{label}</span>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6 v2-card-in" style={{ animationDelay: '.3s' }}>
          <h2 className="font-semibold text-gray-900 mb-4">Lejek sprzedaży</h2>
          <div className="space-y-2">
            {(['ZAPYTANIE', 'OFERTA', 'REZERWACJA', 'UMOWA', 'ODBIOR'] as const).map((status) => {
              const count = clientStats[status] || 0
              return (
                <div key={status} className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${CLIENT_STATUS_COLORS[status]}`}>
                    {CLIENT_STATUS_LABELS[status]}
                  </span>
                  <span className="font-semibold text-gray-900">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 p-6 v2-card-in" style={{ animationDelay: '.36s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Ostatnie działania</h2>
          </div>
          {recentActivities.length === 0 ? (
            <p className="text-gray-400 text-sm">Brak działań</p>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((a) => (
                <div key={a.id} className="flex gap-3 items-start">
                  <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0 text-xs">
                    {activityIcon(a.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/clients/${a.clientId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">
                      {a.client.firstName} {a.client.lastName}
                    </Link>
                    <p className="text-xs text-gray-500 truncate">{a.title}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatDateTime(a.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open service requests */}
        <div className="lg:col-span-12 bg-white rounded-xl border border-gray-200 p-6 v2-card-in" style={{ animationDelay: '.42s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Otwarte usterki</h2>
            <Link href="/service" className="text-sm text-blue-600 hover:text-blue-700">Zobacz wszystkie</Link>
          </div>
          {openService.length === 0 ? (
            <p className="text-gray-400 text-sm">Brak otwartych usterek</p>
          ) : (
            <div className="space-y-3">
              {openService.map((s) => (
                <Link key={s.id} href={`/service/${s.id}`} className="flex gap-3 items-start hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                    <p className="text-xs text-gray-500">
                      {s.client.firstName} {s.client.lastName}
                      {s.unit ? ` • ${s.unit.number}` : ''}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${SERVICE_STATUS_COLORS[s.status as keyof typeof SERVICE_STATUS_COLORS]}`}>
                    {SERVICE_STATUS_LABELS[s.status as keyof typeof SERVICE_STATUS_LABELS]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, sub, color, icon }: {
  title: string; value: string; sub: string; color: string; icon: string
}) {
  const bg: Record<string, string> = {
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
    red: 'bg-red-50 border-red-200',
  }
  const text: Record<string, string> = {
    green: 'text-green-700',
    blue: 'text-blue-700',
    purple: 'text-purple-700',
    red: 'text-red-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${bg[color] || 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className={`text-2xl font-bold mt-0.5 tabular-nums ${text[color] || 'text-gray-900'}`}>{value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
        </div>
        <span className="text-xl">{icon}</span>
      </div>
    </div>
  )
}

function activityIcon(type: string) {
  const icons: Record<string, string> = {
    NOTATKA: '📝',
    TELEFON: '📞',
    EMAIL: '✉️',
    SPOTKANIE: '🤝',
    DOKUMENT: '📄',
  }
  return icons[type] || '📝'
}
