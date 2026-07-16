import Link from 'next/link'

export default function EdycjaProtokoluPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Edycja protokołu</h1>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
        <p className="font-medium mb-2">Nowy edytor w przygotowaniu</p>
        <p>
          Edytor protokołu jest właśnie przebudowywany pod realny format protokołów (pozycje umowne
          per sekcja: Fundamenty / Parter / I Piętro…, ilości w jednostkach umowy m³/m²/T/kpl).
          Możesz oglądać zaimportowane protokoły historyczne — pełna edycja będzie w następnym kroku.
        </p>
        <Link href="/przeroby/protokoly" className="inline-block mt-3 underline">← Wróć do listy protokołów</Link>
      </div>
    </div>
  )
}
