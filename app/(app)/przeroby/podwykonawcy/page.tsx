import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function PodwykonawcyPage() {
  const subs = await prisma.subcontractor.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { protocols: true, contracts: true } },
    },
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Podwykonawcy</h1>
          <p className="text-gray-500 text-sm mt-1">
            {subs.length} {subs.length === 1 ? 'firma' : 'firm'} w bazie
          </p>
        </div>
        <Link
          href="/przeroby/podwykonawcy/nowy"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Dodaj podwykonawcę
        </Link>
      </div>

      {subs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">🏗️</div>
          <h2 className="font-semibold text-gray-900 mb-2">Brak podwykonawców</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Dodaj pierwszą firmę wykonawczą, żeby móc tworzyć protokoły przerobowe.
          </p>
          <Link
            href="/przeroby/podwykonawcy/nowy"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Dodaj pierwszego
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] lg:min-w-0 text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Nazwa firmy</th>
                <th className="text-left px-3 py-3 font-medium">NIP</th>
                <th className="text-left px-3 py-3 font-medium">Kontakt</th>
                <th className="text-left px-3 py-3 font-medium">Telefon</th>
                <th className="text-right px-3 py-3 font-medium">Umowy</th>
                <th className="text-right px-3 py-3 font-medium">Protokoły</th>
                <th className="text-right px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50/40">
                  <td className="px-5 py-3">
                    <Link
                      href={`/przeroby/podwykonawcy/${s.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {s.name}
                    </Link>
                    {s.city && <p className="text-xs text-gray-500">{s.city}</p>}
                  </td>
                  <td className="px-3 py-3 text-gray-600 font-mono text-xs">{s.nip || '—'}</td>
                  <td className="px-3 py-3 text-gray-600">{s.contactName || '—'}</td>
                  <td className="px-3 py-3 text-gray-600">{s.phone || '—'}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{s._count.contracts}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{s._count.protocols}</td>
                  <td className="px-5 py-3 text-right">
                    {s.active ? (
                      <span className="inline-block px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded">
                        aktywny
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                        nieaktywny
                      </span>
                    )}
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
