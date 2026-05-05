import Link from 'next/link'

export default function NowyProtokolPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Nowy protokół</h1>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
        <p className="font-medium mb-2">Tworzenie nowych protokołów — w przygotowaniu</p>
        <p>
          Trwa przebudowa kreatora pod realny format (wybór umowy → wpisanie ilości
          w pozycjach umownych per sekcja). Importer historycznych protokołów już działa:
          <br />
          <code className="bg-amber-100 px-1.5 py-0.5 rounded mt-1 inline-block">
            node scripts/import-protokoly.js [ścieżka.xlsx]
          </code>
        </p>
        <Link href="/przeroby/protokoly" className="inline-block mt-3 underline">← Wróć do listy protokołów</Link>
      </div>
    </div>
  )
}
