'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Alert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  kind: string
  title: string
  detail: string
  amount?: number
  contractId?: string
  contractNumber?: string
  href?: string
}

export function AlertyPanel({ refreshKey, onGoImport }: { refreshKey: number; onGoImport: () => void }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch('/api/finanse/powiernicze/alerts')
      .then((r) => r.json())
      .then((d) => { if (alive) setAlerts(d.alerts || []) })
      .catch(() => { if (alive) setAlerts([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [refreshKey])

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Ładowanie alertów…</div>

  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="font-semibold text-gray-900 mb-1">Brak alertów</h2>
        <p className="text-sm text-gray-500">Wszystkie wpłaty rozliczone, brak zaległości. Zaimportuj nowy wyciąg, aby zaktualizować stan.</p>
        <button onClick={onGoImport} className="mt-4 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-medium">
          Importuj wyciąg
        </button>
      </div>
    )
  }

  const groups: { key: Alert['severity']; label: string; icon: string }[] = [
    { key: 'critical', label: 'Krytyczne', icon: '🔴' },
    { key: 'warning', label: 'Wymagają uwagi', icon: '🟠' },
    { key: 'info', label: 'Informacyjne', icon: '🟡' },
  ]

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const items = alerts.filter((a) => a.severity === g.key)
        if (items.length === 0) return null
        return (
          <div key={g.key}>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              {g.icon} {g.label} <span className="text-gray-400">({items.length})</span>
            </h3>
            <div className="space-y-2">
              {items.map((a) => <AlertCard key={a.id} a={a} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AlertCard({ a }: { a: Alert }) {
  const tone = {
    critical: 'bg-rose-50 border-rose-200',
    warning: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200',
  }[a.severity]
  const inner = (
    <div className={`rounded-lg border p-3 ${tone} ${a.href ? 'hover:shadow-sm transition cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-gray-900 text-sm">{a.title}</div>
          <div className="text-xs text-gray-600 mt-0.5">{a.detail}</div>
        </div>
        {a.amount ? (
          <div className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
            {a.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
          </div>
        ) : null}
      </div>
    </div>
  )
  if (a.href && a.href.startsWith('/sales')) return <Link href={a.href}>{inner}</Link>
  return inner
}
