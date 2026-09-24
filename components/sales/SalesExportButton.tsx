'use client'
import { useEffect, useRef, useState } from 'react'

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * „Eksport do banku”: zestawienie podpisanych umów deweloperskich w okresie
 * (XLSX z /api/sales/export). Okres domyślnie = bieżący miesiąc; PESEL i adres
 * nabywców dołączane tylko na życzenie (dane osobowe, eksport audytowany).
 */
export function SalesExportButton() {
  const [open, setOpen] = useState(false)
  const now = new Date()
  const [from, setFrom] = useState(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(isoDate(now))
  const [pesel, setPesel] = useState(false)
  const [address, setAddress] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function download() {
    if (!from || !to) { setErr('Podaj okres od–do'); return }
    if (from > to) { setErr('Data „od” jest późniejsza niż „do”'); return }
    setErr(null)
    const params = new URLSearchParams({ from, to })
    if (pesel) params.set('pesel', '1')
    if (address) params.set('address', '1')
    // Pobranie pliku przez nawigację — przeglądarka zapisuje załącznik, strona zostaje.
    window.location.href = `/api/sales/export?${params.toString()}`
    setOpen(false)
  }

  const quick = (label: string, f: Date, t: Date) => (
    <button
      type="button"
      onClick={() => { setFrom(isoDate(f)); setTo(isoDate(t)) }}
      className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
    >
      {label}
    </button>
  )
  const y = now.getFullYear()
  const m = now.getMonth()

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        title="Zestawienie podpisanych umów deweloperskich w okresie (XLSX)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12" />
        </svg>
        Eksport do banku
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <p className="text-sm font-semibold text-gray-900">Zestawienie sprzedaży dla banku</p>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Podpisane umowy deweloperskie wg daty podpisania, z nabywcami, lokalami, ceną i subrachunkiem OMRP. Plik XLSX, dwa
            arkusze (umowy, nabywcy).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] text-gray-600 mb-0.5">Od</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1" />
            </label>
            <label className="block">
              <span className="block text-[11px] text-gray-600 mb-0.5">Do</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1" />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {quick('Ten miesiąc', new Date(y, m, 1), now)}
            {quick('Poprzedni miesiąc', new Date(y, m - 1, 1), new Date(y, m, 0))}
            {quick('Ten kwartał', new Date(y, Math.floor(m / 3) * 3, 1), now)}
            {quick('Ten rok', new Date(y, 0, 1), now)}
            {quick('Wszystko', new Date(2020, 0, 1), now)}
          </div>
          <div className="mt-3 space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={pesel} onChange={(e) => setPesel(e.target.checked)} className="rounded" />
              Dołącz PESEL nabywców
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={address} onChange={(e) => setAddress(e.target.checked)} className="rounded" />
              Dołącz adresy nabywców
            </label>
          </div>
          {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={download} className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-3 py-1.5">
              Pobierz XLSX
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-900 text-sm px-3 py-1.5">
              Anuluj
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Eksport danych osobowych jest zapisywany w dzienniku audytu.</p>
        </div>
      )}
    </div>
  )
}
