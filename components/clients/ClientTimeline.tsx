'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileSignature } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { TimelineItem } from '@/lib/client-portfolio'

const PAGE_SIZE = 20
const FILTER_STORAGE_KEY = 'clientTimelineFilter'

type FilterKey = 'all' | 'contracts' | 'emails' | 'notes' | 'contact'

const FILTERS: { key: FilterKey; label: string; match: (i: TimelineItem) => boolean }[] = [
  { key: 'all', label: 'Wszystko', match: () => true },
  { key: 'contracts', label: 'Umowy', match: (i) => i.kind === 'contract' },
  { key: 'emails', label: 'E-maile', match: (i) => i.kind === 'activity' && i.type === 'EMAIL' },
  { key: 'notes', label: 'Notatki', match: (i) => i.kind === 'activity' && (i.type === 'NOTATKA' || i.type === 'DOKUMENT') },
  { key: 'contact', label: 'Kontakt', match: (i) => i.kind === 'activity' && (i.type === 'TELEFON' || i.type === 'SPOTKANIE') },
]

const ACTIVITY_ICONS: Record<string, string> = {
  NOTATKA: '📝', TELEFON: '📞', EMAIL: '✉️', SPOTKANIE: '🤝', DOKUMENT: '📄',
}

/**
 * Zunifikowana oś działań: ręczne aktywności + zdarzenia umów (złote wyróżnienie,
 * link do modułu Sprzedaż). Chipy filtrów z licznikami, wybór w localStorage.
 */
export function ClientTimeline({ items }: { items: TimelineItem[] }) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [shownAll, setShownAll] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY) as FilterKey | null
      if (saved && FILTERS.some((f) => f.key === saved)) setFilter(saved)
    } catch {}
  }, [])

  function pickFilter(key: FilterKey) {
    setFilter(key)
    setShownAll(false)
    try { localStorage.setItem(FILTER_STORAGE_KEY, key) } catch {}
  }

  const counts = useMemo(() => {
    const map = {} as Record<FilterKey, number>
    for (const f of FILTERS) map[f.key] = items.filter(f.match).length
    return map
  }, [items])

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0]
    return items.filter(f.match)
  }, [items, filter])

  const visible = shownAll ? filtered : filtered.slice(0, PAGE_SIZE)
  const hiddenCount = filtered.length - visible.length

  return (
    <div>
      {/* Chipy filtrów z licznikami */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => pickFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                active ? 'bg-blue-600 text-white border-transparent' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label} ({counts[f.key]})
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {filter === 'all' ? 'Brak zarejestrowanych działań' : 'Brak wpisów w tej kategorii'}
        </p>
      ) : (
        <div>
          {visible.map((item) => (
            <div key={item.id} className="flex gap-3.5 py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border-soft)' }}>
              {item.kind === 'contract' ? (
                <div
                  className="w-[34px] h-[34px] rounded-full flex items-center justify-center flex-shrink-0 border"
                  style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}
                >
                  <FileSignature className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
              ) : (
                <div
                  className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-sm flex-shrink-0 border"
                  style={{ background: 'var(--surface-alt)', borderColor: 'var(--border-soft)' }}
                >
                  {ACTIVITY_ICONS[item.type] || '📝'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2.5">
                  {item.href ? (
                    <Link href={item.href} prefetch={false} className="text-[13px] font-semibold text-gray-900 hover:text-blue-600">
                      {item.title}
                    </Link>
                  ) : (
                    <span className="text-[13px] font-semibold text-gray-900">{item.title}</span>
                  )}
                  <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {formatDateTime(new Date(item.dateISO))}
                  </span>
                </div>
                {item.content && (
                  <p className="text-[13px] text-gray-600 mt-1 leading-relaxed whitespace-pre-wrap">{item.content}</p>
                )}
              </div>
            </div>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShownAll(true)}
              className="mt-3 w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Pokaż starsze ({hiddenCount})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
