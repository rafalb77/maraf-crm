'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Wywoluje POST /api/finanse/ksef/auto-sync przy mount layoutu Finansow.
// Throttling po stronie endpointu (1h). Cichy fail — jesli blad, tylko
// dyskretny status, bez psucia UI.
//
// Tryby wyswietlania:
//  - idle: nic
//  - syncing: maly badge "Synchronizuję..."
//  - done: badge "✓ +N faktur" (zanika po 5s)
//  - error: nic (cichy fail, blad w /finanse/ksef)
export function AutoSyncOnMount() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState('syncing')
    fetch('/api/finanse/ksef/auto-sync', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.skipped) {
          // throttled / no-config / disabled / no-token — nic nie pokazuj
          setState('idle')
          return
        }
        if (data.ok) {
          setCount(data.count || 0)
          setState('done')
          // odsiez dane jesli sa nowe faktury
          if (data.count > 0) router.refresh()
          // zwin po 5s
          setTimeout(() => { if (!cancelled) setState('idle') }, 5000)
        } else {
          // cichy fail
          setState('error')
          setTimeout(() => { if (!cancelled) setState('idle') }, 3000)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState('error')
          setTimeout(() => { if (!cancelled) setState('idle') }, 3000)
        }
      })
    return () => { cancelled = true }
  }, [router])

  if (state === 'idle') return null

  return (
    <div className="text-xs">
      {state === 'syncing' && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Synchronizuję KSeF…
        </span>
      )}
      {state === 'done' && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
          ✓ KSeF: {count} {count === 1 ? 'nowa faktura' : 'nowych faktur'}
        </span>
      )}
      {state === 'error' && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200" title="Szczegóły w /finanse/ksef">
          ⚠ KSeF: błąd sync
        </span>
      )}
    </div>
  )
}
