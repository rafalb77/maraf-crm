import { DictionaryEditor } from '@/components/odbiory/DictionaryEditor'

/** /odbiory/slownik — słownik usterek (legenda): kody, branże, domyślni wykonawcy i terminy. */
export default function SlownikPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Słownik usterek (legenda)</h1>
        <p className="mt-1 text-sm text-gray-500">
          Kod to numer typu, stały dla całej firmy. Na rzucie pinezka ma numer usterki, a w legendzie protokołu widać typ, wykonawcę i termin.
        </p>
      </div>
      <DictionaryEditor />
    </div>
  )
}
