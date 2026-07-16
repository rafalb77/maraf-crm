import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { PrzedmiarKonradUploadButton } from '@/components/przeroby/PrzedmiarKonradUploadButton'

const FLOOR_LABELS: Record<string, string> = {
  PARTER: 'Parter',
  I_PIETRO: 'I piętro',
  II_PIETRO: 'II piętro',
  III_PIETRO: 'III piętro',
  IV_PIETRO: 'IV piętro',
  DACH: 'Dach',
  FUNDAMENTY: 'Fundamenty',
}

export default async function PorownaniaListPage() {
  const summaries = await prisma.floorSummary.findMany({
    include: {
      scope: true,
      _count: { select: { items: true } },
    },
    orderBy: [{ floor: 'asc' }],
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Porównanie obmiarów</h1>
          <p className="text-gray-500 text-sm mt-1">
            Obmiar Maraf zestawiony z przedmiarem kierownika per kondygnacja.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/przeroby/obmiar"
            className="text-sm px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            🔍 Pokaż obmiar Maraf
          </Link>
          <PrzedmiarKonradUploadButton />
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <h2 className="font-semibold text-gray-900 mb-2">Brak podsumowań</h2>
          <p className="text-sm text-gray-500 max-w-lg mx-auto">
            Wgraj <strong>przedmiar kierownika</strong> (xlsx) klikając przycisk u góry —
            system zaimportuje wartości ścian i słupów per kondygnacja
            i zestawi je z obmiarem Maraf.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map((s) => (
            <Link
              key={s.id}
              href={`/przeroby/porownanie/${s.floor}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="font-semibold text-gray-900">{FLOOR_LABELS[s.floor] || s.floor}</h3>
                <span className="text-xl font-semibold" style={{ color: 'var(--accent)' }}>
                  {s._count.items}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-2">pozycji do porównania</p>
              <p className="text-sm text-gray-600">{s.scope.name}</p>
              {s.source && <p className="text-xs text-gray-400 mt-2 truncate">{s.source}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
