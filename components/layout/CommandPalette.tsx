'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react'

type SearchResult = {
  id: string
  group: string
  groupLabel: string
  title: string
  subtitle?: string
  badge?: string
  url: string
}

// Debounce zapytań — zapobiega fetchowi na każdy znak.
const DEBOUNCE_MS = 180

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const [isMac, setIsMac] = useState(false)

  // Portal montujemy dopiero po stronie klienta (document dostępny).
  const [mounted, setMounted] = useState(false)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setMounted(true)
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent))
  }, [])

  // Globalny skrót ⌘K / Ctrl+K (i „/" gdy fokus nie jest w polu tekstowym).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Reset przy zamknięciu / fokus + czyszczenie przy otwarciu.
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setActive(0)
      // focus po zamontowaniu modala
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Debounced fetch.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      abortRef.current?.abort()
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        if (!res.ok) throw new Error('search failed')
        const data = await res.json()
        setResults(Array.isArray(data.results) ? data.results : [])
        setActive(0)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setResults([])
      } finally {
        // tylko jeśli to wciąż aktualny controller
        if (abortRef.current === ac) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query, open])

  const go = useCallback(
    (r: SearchResult) => {
      setOpen(false)
      router.push(r.url)
    },
    [router],
  )

  // Nawigacja klawiaturą wewnątrz modala.
  const onListKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const r = results[active]
        if (r) go(r)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    },
    [results, active, go],
  )

  // Scroll aktywnego elementu do widoku.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  // Grupowanie wyników z zachowaniem kolejności z API + globalny indeks dla nawigacji.
  const groups = useMemo(() => {
    const out: { label: string; items: { r: SearchResult; idx: number }[] }[] = []
    results.forEach((r, idx) => {
      const last = out[out.length - 1]
      if (last && last.label === r.groupLabel) last.items.push({ r, idx })
      else out.push({ label: r.groupLabel, items: [{ r, idx }] })
    })
    return out
  }, [results])

  const showEmpty = !loading && query.trim().length >= 2 && results.length === 0

  return (
    <>
      {/* Trigger w topbarze */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        style={{
          borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)',
          color: 'var(--text-muted)',
          minWidth: 200,
        }}
        aria-label="Szukaj"
      >
        <Search className="w-4 h-4 flex-shrink-0" />
        <span className="hidden md:inline">Szukaj…</span>
        <kbd
          className="hidden md:inline-flex ml-auto items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium"
          style={{
            background: 'color-mix(in srgb, var(--border) 40%, transparent)',
            color: 'var(--text-muted)',
          }}
        >
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
          style={{ background: 'color-mix(in srgb, black 45%, transparent)' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            onKeyDown={onListKey}
          >
            {/* Pole wyszukiwania */}
            <div className="flex items-center gap-3 px-4 h-14 border-b" style={{ borderColor: 'var(--border)' }}>
              <Search className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Szukaj klientów, lokali, ofert, umów, faktur…"
                className="flex-1 bg-transparent outline-none text-base"
                style={{ color: 'var(--text-primary)' }}
                autoComplete="off"
                spellCheck={false}
              />
              {loading && (
                <span
                  className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                  aria-hidden
                />
              )}
              <kbd
                className="px-1.5 py-0.5 rounded text-[11px] font-medium flex-shrink-0"
                style={{ background: 'color-mix(in srgb, var(--border) 40%, transparent)', color: 'var(--text-muted)' }}
              >
                ESC
              </kbd>
            </div>

            {/* Wyniki */}
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
              {query.trim().length < 2 && (
                <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  Wpisz min. 2 znaki, aby wyszukać.
                </p>
              )}

              {showEmpty && (
                <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  Brak wyników dla „{query.trim()}".
                </p>
              )}

              {groups.map((g) => (
                <div key={g.label} className="mb-1">
                  <p
                    className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {g.label}
                  </p>
                  {g.items.map(({ r, idx }) => (
                    <button
                      key={r.group + r.id}
                      type="button"
                      data-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(r)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                      style={{
                        background: idx === active ? 'color-mix(in srgb, var(--accent-soft) 60%, transparent)' : 'transparent',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {r.title}
                        </p>
                        {r.subtitle && (
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                            {r.subtitle}
                          </p>
                        )}
                      </div>
                      {r.badge && (
                        <span
                          className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{
                            background: 'color-mix(in srgb, var(--border) 45%, transparent)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {r.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Stopka z podpowiedziami klawiszy */}
            {results.length > 0 && (
              <div
                className="flex items-center gap-4 px-4 h-10 border-t text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <span className="flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" />
                  <ArrowDown className="w-3 h-3" />
                  nawigacja
                </span>
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="w-3 h-3" />
                  otwórz
                </span>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
