'use client'
import { useRouter, useSearchParams } from 'next/navigation'

const TYPES = [
  { value: '', label: 'Wszystkie typy' },
  { value: 'MIESZKALNY', label: 'Mieszkania' },
  { value: 'USLUGOWY', label: 'Usługowe' },
  { value: 'PARKING', label: 'Parking' },
  { value: 'GARAZ', label: 'Garaż' },
  { value: 'KOMORKA', label: 'Komórki' },
]

const STATUSES = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'WOLNY', label: 'Wolny' },
  { value: 'ZAREZERWOWANY', label: 'Zarezerwowany' },
  { value: 'SPRZEDANY', label: 'Sprzedany' },
  { value: 'NIEDOSTEPNY', label: 'Niedostępny' },
]

export function UnitFilters() {
  const router = useRouter()
  const sp = useSearchParams()

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/units?${params.toString()}`)
  }

  return (
    <div className="flex gap-3 mb-4 flex-wrap">
      <input
        type="search"
        placeholder="Szukaj po numerze..."
        defaultValue={sp.get('search') || ''}
        onChange={(e) => update('search', e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <select
        value={sp.get('type') || ''}
        onChange={(e) => update('type', e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
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
