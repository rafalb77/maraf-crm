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

function floorLabel(f: number) {
  if (f === 0) return 'Parter'
  if (f === -1) return 'Podziemie'
  return `${f} p.`
}

function roomsLabel(n: number) {
  if (n === 1) return 'pokój'
  const last = n % 10
  const lastTwo = n % 100
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return 'pokoje'
  return 'pokoi'
}

const input =
  'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const select = `${input} bg-white`

export function UnitFilters({ floors, rooms }: { floors: number[]; rooms: number[] }) {
  const router = useRouter()
  const sp = useSearchParams()

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/units?${params.toString()}`)
  }

  return (
    <div className="flex gap-3 mb-4 flex-wrap items-center">
      <input
        type="search"
        placeholder="Szukaj po numerze..."
        defaultValue={sp.get('search') || ''}
        onChange={(e) => update('search', e.target.value)}
        className={input}
      />
      <select
        value={sp.get('type') || ''}
        onChange={(e) => update('type', e.target.value)}
        className={select}
      >
        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <select
        value={sp.get('status') || ''}
        onChange={(e) => update('status', e.target.value)}
        className={select}
      >
        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <select
        value={sp.get('rooms') || ''}
        onChange={(e) => update('rooms', e.target.value)}
        className={select}
      >
        <option value="">Wszystkie pokoje</option>
        {rooms.map((r) => (
          <option key={r} value={String(r)}>{r} {roomsLabel(r)}</option>
        ))}
      </select>
      <select
        value={sp.get('floor') || ''}
        onChange={(e) => update('floor', e.target.value)}
        className={select}
      >
        <option value="">Wszystkie piętra</option>
        {floors.map((f) => (
          <option key={f} value={String(f)}>{floorLabel(f)}</option>
        ))}
      </select>
      <input
        type="number"
        inputMode="decimal"
        placeholder="Pow. od (m²)"
        defaultValue={sp.get('areaMin') || ''}
        onChange={(e) => update('areaMin', e.target.value)}
        className={`${input} w-32`}
      />
      <input
        type="number"
        inputMode="decimal"
        placeholder="Pow. do (m²)"
        defaultValue={sp.get('areaMax') || ''}
        onChange={(e) => update('areaMax', e.target.value)}
        className={`${input} w-32`}
      />
      <input
        type="number"
        inputMode="numeric"
        placeholder="Cena brutto od"
        defaultValue={sp.get('priceMin') || ''}
        onChange={(e) => update('priceMin', e.target.value)}
        className={`${input} w-40`}
      />
      <input
        type="number"
        inputMode="numeric"
        placeholder="Cena brutto do"
        defaultValue={sp.get('priceMax') || ''}
        onChange={(e) => update('priceMax', e.target.value)}
        className={`${input} w-40`}
      />
    </div>
  )
}
