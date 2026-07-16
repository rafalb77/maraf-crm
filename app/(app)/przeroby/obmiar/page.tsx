import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function ObmiarListPage() {
  const scopes = await prisma.workScope.findMany({
    orderBy: { order: 'asc' },
    include: {
      categories: {
        include: { _count: { select: { items: true } } },
      },
    },
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Obmiary — zakresy robót</h1>
          <p className="text-gray-500 text-sm mt-1">
            Każdy zakres (np. konstrukcja żelbetowa, prace murarskie) ma własny rejestr pozycji.
          </p>
        </div>
        <Link
          href="/przeroby/obmiar/nowy"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Nowy zakres
        </Link>
      </div>

      {scopes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h2 className="font-semibold text-gray-900 mb-2">Brak zakresów</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Zaimportuj pierwszy obmiar z Excela skryptem{' '}
            <code className="bg-gray-100 px-1 rounded">scripts/import-obmiar.js</code>
            {' '}lub utwórz pusty zakres ręcznie.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scopes.map((s) => {
            const totalItems = s.categories.reduce((acc, c) => acc + c._count.items, 0)
            return (
              <Link
                key={s.id}
                href={`/przeroby/obmiar/${s.slug}`}
                className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="font-semibold text-gray-900">{s.name}</h3>
                  <span className="text-xl font-semibold" style={{ color: 'var(--accent)' }}>
                    {totalItems}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-2">pozycji obmiaru</p>
                <p className="text-sm text-gray-600">
                  {s.categories.length} {pluralize(s.categories.length, 'kategoria', 'kategorie', 'kategorii')}
                </p>
                {!s.active && (
                  <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                    Nieaktywny
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function pluralize(n: number, one: string, few: string, many: string) {
  if (n === 1) return one
  const lastDigit = n % 10
  const lastTwo = n % 100
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return few
  return many
}
