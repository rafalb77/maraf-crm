'use client'
import { useEffect, useRef, useState } from 'react'

// Wykrywa nowa wersje aplikacji po deployu (stary JS w cache przegladarki).
// Po powrocie do karty / co kilka minut sprawdza /api/version; gdy identyfikator
// wdrozenia sie zmienil — pokazuje pasek z przyciskiem "Odswiez". Zapobiega
// sytuacji, gdy klikniecia w komponenty klienta nie dzialaja po deployu.
export function VersionWatcher() {
  const initial = useRef<string | null>(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let active = true
    async function check() {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        if (!r.ok) return
        const { v } = await r.json()
        if (!v || !active) return
        if (initial.current === null) { initial.current = v; return }
        if (v !== initial.current) setStale(true)
      } catch {}
    }
    check()
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    const id = setInterval(check, 5 * 60 * 1000)
    return () => { active = false; window.removeEventListener('focus', onFocus); clearInterval(id) }
  }, [])

  if (!stale) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white rounded-full shadow-lg px-4 py-2 flex items-center gap-3 text-sm">
      <span>Dostępna nowa wersja aplikacji.</span>
      <button
        onClick={() => location.reload()}
        className="bg-white text-gray-900 rounded-full px-3 py-1 font-medium hover:bg-gray-100"
      >
        Odśwież
      </button>
      <button onClick={() => setStale(false)} className="text-gray-400 hover:text-white" title="Ukryj">✕</button>
    </div>
  )
}
