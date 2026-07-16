import { ImportFinanseForm } from '@/components/finanse/ImportFinanseForm'

export default function ImportFinansePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import faktur z xlsx</h1>
        <p className="text-gray-500 text-sm mt-1">
          Wgranie pliku <code className="bg-gray-100 px-1 rounded">PŁATNOŚCI 2026.xlsx</code> (lub historyczne lata).
          Najpierw <strong>podgląd</strong>, potem <strong>zapis</strong>.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-900">
        <p className="font-semibold mb-1">Co się zaimportuje:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>8 zakładek: PROMATBUD, BAUTER, SANTANDER, EFL, STAFFA, MURARZ, STAŁE, INNE</li>
          <li>Zakładka <strong>PODATKI</strong> jest pomijana (inny układ — osobny pod-moduł w Fazie 2)</li>
          <li>Wiersze bez daty wystawienia lub z kwotą = 0 są pomijane (zobaczysz listę)</li>
          <li>Subwiersze „zapłacono X / pozostało Y" agreguje do tabeli płatności</li>
          <li>Status faktury wyliczany heurystycznie (pole ZAPŁACONO + termin), <strong>kolory wierszy z xlsx nie są odczytywane</strong></li>
          <li>Duplikaty (istniejący już (kontrahent, nr FV) w bazie) są pomijane przy zapisie</li>
        </ul>
      </div>

      <ImportFinanseForm />
    </div>
  )
}
