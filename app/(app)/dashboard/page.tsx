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

async function getDashboardData() {
  const [unitsByStatus, clientsByStatus, openService, recentActivities, recentClients, revenueData] = await Promise.all([
    prisma.unit.groupBy({ by: ['status'], _count: true }),
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
  ])

  return { unitsByStatus, clientsByStatus, openService, recentActivities, recentClients, revenueData }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const { unitsByStatus, clientsByStatus, openService, recentActivities, recentClients, revenueData } = await getDashboardData()

  const unitStats = Object.fromEntries(unitsByStatus.map((u) => [u.status, u._count]))
  const clientStats = Object.fromEntries(clientsByStatus.map((c) => [c.status, c._count]))
  const totalUnits = unitsByStatus.reduce((s, u) => s + u._count, 0)
  const totalClients = clientsByStatus.reduce((s, c) => s + c._count, 0)
  const revenue = revenueData._sum.priceGross || 0

  return (
    <div className="p-8">
      {/* Top widget: powitanie + news dnia (per user.interests) + pogoda */}
      <TopWidget />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <KpiCard
          title="Wolne lokale"
          value={String(unitStats['WOLNY'] || 0)}
          sub={`z ${totalUnits} wszystkich`}
          color="green"
          icon="🏠"
        />
        <KpiCard
          title="Sprzedane"
          value={String(unitStats['SPRZEDANY'] || 0)}
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

      {/* Units funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Status lokali</h2>
          <div className="grid grid-cols-2 gap-3">
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

        <div className="bg-white rounded-xl border border-gray-200 p-6">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Activities */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
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
    <div className={`rounded-xl border p-5 ${bg[color] || 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className={`text-3xl font-bold mt-1 ${text[color] || 'text-gray-900'}`}>{value}</p>
          <p className="text-xs text-gray-500 mt-1">{sub}</p>
        </div>
        <span className="text-2xl">{icon}</span>
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
