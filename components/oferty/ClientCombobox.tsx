'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { normalizeForSearch } from '@/lib/text'

export type ComboboxClient = { id: string; name: string }

const NONE = '— bez przypisania —'

/**
 * Wybór klienta z wyszukiwaniem — zamiennik <select> (lista klientów rośnie,
 * scrollowanie po ~50 pozycjach było uciążliwe).
 *
 * Zamykanie wzorcem z Sidebar/TopBar (listener `mousedown` na document +
 * Escape), NIE backdropem `fixed inset-0` jak w ClientStatusChanger — overlay
 * przechwytywałby klik, więc przejście wprost do innego pola kosztowałoby
 * dwa kliknięcia. Klawiatura wzorowana na CommandPalette.
 * Wyszukiwanie odporne na polskie znaki ("sloczynski" → "Słoczyński").
 */
export function ClientCombobox({
  clients,
  value,
  onChange,
  inputCls,
  id,
}: {
  clients: ComboboxClient[]
  value: string
  onChange: (id: string) => void
  inputCls: string
  /** Powiązanie z <label htmlFor> — kontrolką jest <button>, nie <input>. */
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const baseId = useId()
  const listId = `${baseId}-list`
  const optId = (idx: number) => `${baseId}-opt-${idx}`

  // Zamykanie: listener na 'mousedown' (wzorzec z Sidebar/TopBar) zamiast
  // overlaya `fixed inset-0` — overlay przechwytywałby klik, więc przejście
  // wprost do innego pola wymagałoby dwóch kliknięć.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') close(true)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = clients.find((c) => c.id === value) || null

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query)
    if (!q) return clients
    // Dopasowanie po każdym słowie zapytania — "kowal jan" znajdzie "Jan Kowalski".
    const words = q.split(/\s+/).filter(Boolean)
    return clients.filter((c) => {
      const hay = normalizeForSearch(c.name)
      return words.every((w) => hay.includes(w))
    })
  }, [clients, query])

  const hasQuery = normalizeForSearch(query).length > 0

  // Przy aktywnym filtrze NIE doklejamy "bez przypisania" — szuka się po to, żeby
  // KOGOŚ wybrać, więc indeks 0 musi być pierwszym trafieniem (Enter po wpisaniu
  // frazy inaczej kasowałby wybranego klienta). Przy zerze wyników lista jest
  // pusta, więc Enter jest no-opem dzięki `if (opt)` niżej.
  const options: ComboboxClient[] = useMemo(
    () => (hasQuery ? filtered : [{ id: '', name: NONE }, ...filtered]),
    [filtered, hasQuery],
  )

  // Po otwarciu: fokus na pole wyszukiwania, podświetlenie na aktualnym wyborze.
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const idx = options.findIndex((o) => o.id === value)
    setHighlight(idx >= 0 ? idx : 0)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Zmiana filtra resetuje podświetlenie na pierwszy wynik.
  useEffect(() => {
    setHighlight(0)
  }, [query])

  // Podświetlona pozycja zawsze w polu widzenia przy nawigacji strzałkami.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  /** @param refocus true = fokus wraca na przycisk (wybór, Escape) — bez tego
   *  użytkownik klawiatury zostaje bez punktu zaczepienia. */
  function close(refocus = false) {
    setOpen(false)
    setQuery('')
    if (refocus) btnRef.current?.focus()
  }

  function choose(clientId: string) {
    onChange(clientId)
    close(true)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = options[highlight]
      if (opt) choose(opt.id)
    } else if (e.key === 'Tab') {
      // Escape obsługuje globalny listener; Tab wychodzi z pola.
      close()
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Przycisk wygląda jak input, żeby nie odstawał od reszty formularza */}
      <button
        ref={btnRef}
        id={id}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={inputCls + ' w-full bg-white text-left flex items-center justify-between gap-2'}
      >
        <span className={selected ? '' : 'text-gray-500'}>{selected ? selected.name : NONE}</span>
        <svg className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* onKeyDown na kontenerze (wzorzec CommandPalette) — łapie klawisze
              z pola wyszukiwania i z listy, także po najechaniu myszą. */}
          <div
            onKeyDown={onKeyDown}
            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden max-w-[calc(100vw-2rem)]"
          >
            <div className="p-2 border-b border-gray-100">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Szukaj klienta..."
                className={inputCls + ' w-full'}
                aria-label="Szukaj klienta"
                // Fokus zostaje w polu, więc czytnik ekranu musi dostać
                // aktywną pozycję listy przez aria-activedescendant.
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-autocomplete="list"
                autoComplete="off"
                aria-activedescendant={options[highlight] ? optId(highlight) : undefined}
              />
            </div>
            <div ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 && query ? (
                <p className="px-3 py-2 text-sm text-gray-500">Brak wyników dla „{query}”</p>
              ) : null}
              {options.map((o, idx) => {
                const isSelected = o.id === value
                const isHighlighted = idx === highlight
                return (
                  <button
                    key={o.id || '__none__'}
                    id={optId(idx)}
                    type="button"
                    data-idx={idx}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(o.id)}
                    onMouseEnter={() => setHighlight(idx)}
                    className={
                      'w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ' +
                      (isHighlighted ? 'bg-gray-100 ' : '') +
                      (isSelected ? 'font-semibold ' : '') +
                      (!o.id ? 'text-gray-500 ' : '')
                    }
                  >
                    {/* truncate + min-w-0 — długie nazwiska nie rozpychają panelu */}
                    <span className="truncate min-w-0">{o.name}</span>
                    {isSelected && <span className="text-blue-500 flex-shrink-0">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
