import Link from 'next/link'
import { prisma } from '@/lib/prisma'

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: '✓ Logowanie',
  LOGIN_FAIL: '✗ Nieudane logowanie',
  LOGOUT: '↩ Wylogowanie',
  VIEW_CLIENT: '👁 Podgląd klienta',
  CREATE: '+ Utworzono',
  UPDATE: '✎ Zmiana',
  DELETE: '🗑 Usunięto',
  EXPORT: '⬇ Eksport',
  PERMISSION_CHANGE: '🔑 Zmiana uprawnień',
  PASSWORD_RESET_REQUEST: '🔐 Żądanie resetu hasła',
  PASSWORD_RESET: '🔐 Reset hasła',
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN_SUCCESS: 'bg-green-50 text-green-700',
  LOGIN_FAIL: 'bg-red-50 text-red-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  VIEW_CLIENT: 'bg-blue-50 text-blue-700',
  CREATE: 'bg-emerald-50 text-emerald-700',
  UPDATE: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
  EXPORT: 'bg-purple-50 text-purple-700',
  PERMISSION_CHANGE: 'bg-violet-50 text-violet-700',
  PASSWORD_RESET_REQUEST: 'bg-orange-50 text-orange-700',
  PASSWORD_RESET: 'bg-orange-50 text-orange-700',
}

function fmtDateTime(d: Date) {
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string; userEmail?: string; page?: string }>
}) {
  const params = await searchParams
  const action = params.action || ''
  const entity = params.entity || ''
  const userEmail = params.userEmail || ''
  const page = parseInt(params.page || '1', 10)
  const perPage = 100
  const skip = (page - 1) * perPage

  const where: any = {}
  if (action) where.action = action
  if (entity) where.entity = entity
  if (userEmail) where.userEmail = { contains: userEmail }

  const [logs, total, actionStats] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: perPage,
      skip,
    }),
    prisma.auditLog.count({ where }),
    // Statystyki dla "filter chips"
    prisma.auditLog.groupBy({
      by: ['action'],
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
    }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="mb-2 text-sm">
        <Link href="/settings" className="text-gray-500 hover:text-gray-700">
          ← Ustawienia
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rejestr działań (audit log)</h1>
        <p className="text-gray-500 text-sm mt-1">
          Logowania, zmiany danych, podgląd wrażliwych encji. Wymagany przez RODO Art. 30/32. Retencja:
          nieusuwane automatycznie (na razie).
        </p>
      </div>

      {/* Filtry */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <form method="GET" className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Akcja</label>
            <select
              name="action"
              defaultValue={action}
              className="px-2 py-1.5 border border-gray-300 rounded text-sm min-w-[160px]"
            >
              <option value="">— wszystkie —</option>
              {actionStats.map((s) => (
                <option key={s.action} value={s.action}>
                  {ACTION_LABELS[s.action] || s.action} ({s._count.action})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Encja</label>
            <input
              type="text"
              name="entity"
              defaultValue={entity}
              placeholder="Client / User / Offer..."
              className="px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Użytkownik (email zawiera)</label>
            <input
              type="text"
              name="userEmail"
              defaultValue={userEmail}
              placeholder="np. bogdan"
              className="px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded"
          >
            Filtruj
          </button>
          {(action || entity || userEmail) && (
            <Link
              href="/settings/audit-log"
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              wyczyść
            </Link>
          )}
          <span className="ml-auto text-xs text-gray-500">
            Łącznie: <strong>{total.toLocaleString('pl-PL')}</strong> wpisów
          </span>
        </form>
      </div>

      {/* Tabela */}
      {logs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">
          Brak wpisów spełniających kryteria.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Tabela back-office: scroll poziomy zamiast zgniatania kolumn na wąskich ekranach */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] lg:min-w-0 text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50/60">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Czas</th>
                  <th className="text-left px-2 py-2 font-medium">Akcja</th>
                  <th className="text-left px-2 py-2 font-medium">Użytkownik</th>
                  <th className="text-left px-2 py-2 font-medium">Encja</th>
                  <th className="text-left px-2 py-2 font-medium">IP</th>
                  <th className="text-left px-3 py-2 font-medium">Szczegóły</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-gray-600 tabular-nums whitespace-nowrap">
                      {fmtDateTime(l.createdAt)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                          ACTION_COLORS[l.action] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {ACTION_LABELS[l.action] || l.action}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-gray-700">{l.userEmail || '—'}</td>
                    <td className="px-2 py-2 text-xs text-gray-600">
                      {l.entity ? (
                        <>
                          {l.entity}
                          {l.entityId && (
                            <span className="text-gray-400"> · {l.entityId.slice(0, 8)}…</span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-500 font-mono">{l.ip || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-md truncate">
                      {l.metadata ? (
                        <code className="text-[10px]" title={l.metadata}>
                          {l.metadata.slice(0, 80)}
                          {l.metadata.length > 80 ? '…' : ''}
                        </code>
                      ) : (
                        <span className="text-gray-300">{l.path}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginacja */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
          <span className="text-gray-500">
            Strona {page} z {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{
                  pathname: '/settings/audit-log',
                  query: { ...(action && { action }), ...(entity && { entity }), ...(userEmail && { userEmail }), page: page - 1 },
                }}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
              >
                ‹ poprzednia
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{
                  pathname: '/settings/audit-log',
                  query: { ...(action && { action }), ...(entity && { entity }), ...(userEmail && { userEmail }), page: page + 1 },
                }}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
              >
                następna ›
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
