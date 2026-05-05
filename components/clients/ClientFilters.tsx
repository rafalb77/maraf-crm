'use client'
import { useRouter, useSearchParams } from 'next/navigation'

const STATUSES = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'ZAPYTANIE', label: 'Zapytanie' },
  { value: 'OFERTA', label: 'Oferta' },
  { value: 'REZERWACJA', label: 'Rezerwacja' },
  { value: 'UMOWA', label: 'Umowa' },
  { value: 'ODBIOR', label: 'Odbiór' },
]

export function ClientFilters() {
  const router = useRouter()
  const sp = useSearchParams()

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/clients?${params.toString()}`)
  }

  return (
    <div className="flex gap-3 mb-4 flex-wrap">
      <input
        type="search"
        placeholder="Szukaj klienta..."
        defaultValue={sp.get('search') || ''}
        onChange={(e) => update('search', e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <select
        value={sp.get('status') || ''}
        onChange={(e) => update('status', e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  )
}
