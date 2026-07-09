import Link from 'next/link'
import { HarmonogramImport } from '@/components/budowa/HarmonogramImport'

export const dynamic = 'force-dynamic'

export default function HarmonogramImportPage() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/budowa/harmonogram" prefetch={false} className="text-sm text-gray-500 underline">
          ← Wróć do harmonogramu
        </Link>
        <h1 className="text-2xl font-bold mt-2">Import harmonogramu z Excela</h1>
        <p className="text-gray-500 mt-1">
          Wgraj plik xlsx z terminami robót (format harmonogramu Konrada). Import jest bezpieczny
          do powtórzenia — ponowny wgrany plik <strong>nie nadpisze</strong> terminów, które
          poprawisz ręcznie w tabeli; doda tylko brakujące pozycje.
        </p>
      </div>
      <HarmonogramImport />
    </div>
  )
}
