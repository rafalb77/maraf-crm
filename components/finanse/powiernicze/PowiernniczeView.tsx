'use client'
import { useCallback, useEffect, useState } from 'react'
import { fmtMoney } from '@/lib/finanse-format'
import { AlertyPanel } from './AlertyPanel'
import { ImportWyciaguForm } from './ImportWyciaguForm'
import { DopasowaniePanel } from './DopasowaniePanel'
import { RejestrWplat } from './RejestrWplat'
import { RejestrOdsetek } from './RejestrOdsetek'

export type EscrowAccountLite = { id: string; name: string; accountNumber: string | null }

type Tab = 'przeglad' | 'import' | 'dopasowanie' | 'wplaty' | 'odsetki'

type AlertsSummary = {
  counts: { critical: number; warning: number; info: number }
  summary: {
    overdueCount: number
    overdueAmount: number
    accruedInterest: number
    unmatchedCount: number
    unmatchedAmount: number
    suggestedCount: number
    upcomingCount: number
  }
}

export function PowiernniczeView({ accounts }: { accounts: EscrowAccountLite[] }) {
  const initial = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab')) as Tab | null
  const [tab, setTab] = useState<Tab>(initial && ['przeglad', 'import', 'dopasowanie', 'wplaty', 'odsetki'].includes(initial) ? initial : 'przeglad')
  const [summary, setSummary] = useState<AlertsSummary | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    let alive = true
    fetch('/api/finanse/powiernicze/alerts')
      .then((r) => r.json())
      .then((d) => { if (alive) setSummary(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [refreshKey])

  const s = summary?.summary
  const c = summary?.counts

  return (
    <div>
      {/* Pasek podsumowania / szybkie alerty */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile
          label="Zaległe raty"
          value={s ? String(s.overdueCount) : '—'}
          sub={s ? `${fmtMoney(s.overdueAmount)}` : ''}
          tone={s && s.overdueCount > 0 ? 'red' : 'gray'}
          onClick={() => setTab('przeglad')}
        />
        <KpiTile
          label="Narosłe odsetki"
          value={s ? fmtMoney(s.accruedInterest) : '—'}
          sub="do dziś, szacunek"
          tone={s && s.accruedInterest > 0 ? 'amber' : 'gray'}
          onClick={() => setTab('odsetki')}
        />
        <KpiTile
          label="Niedopasowane wpływy"
          value={s ? String(s.unmatchedCount) : '—'}
          sub={s ? fmtMoney(s.unmatchedAmount) : ''}
          tone={s && s.unmatchedCount > 0 ? 'amber' : 'gray'}
          onClick={() => setTab('dopasowanie')}
        />
        <KpiTile
          label="Do przeglądu"
          value={s ? String(s.suggestedCount) : '—'}
          sub="sugestie dopasowań"
          tone={s && s.suggestedCount > 0 ? 'blue' : 'gray'}
          onClick={() => setTab('dopasowanie')}
        />
      </div>

      {/* Taby */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 flex-wrap">
        <TabBtn active={tab === 'przeglad'} onClick={() => setTab('przeglad')}>
          Przegląd i alerty {c && c.critical + c.warning > 0 ? <Badge tone="red">{c.critical + c.warning}</Badge> : null}
        </TabBtn>
        <TabBtn active={tab === 'import'} onClick={() => setTab('import')}>Import wyciągu</TabBtn>
        <TabBtn active={tab === 'dopasowanie'} onClick={() => setTab('dopasowanie')}>Dopasowanie</TabBtn>
        <TabBtn active={tab === 'wplaty'} onClick={() => setTab('wplaty')}>Rejestr wpłat</TabBtn>
        <TabBtn active={tab === 'odsetki'} onClick={() => setTab('odsetki')}>Rejestr odsetek</TabBtn>
      </div>

      {tab === 'przeglad' && <AlertyPanel refreshKey={refreshKey} onGoImport={() => setTab('import')} />}
      {tab === 'import' && <ImportWyciaguForm onImported={() => { refresh(); setTab('dopasowanie') }} />}
      {tab === 'dopasowanie' && <DopasowaniePanel accounts={accounts} refreshKey={refreshKey} onChanged={refresh} />}
      {tab === 'wplaty' && <RejestrWplat refreshKey={refreshKey} />}
      {tab === 'odsetki' && <RejestrOdsetek refreshKey={refreshKey} onChanged={refresh} />}
    </div>
  )
}

function KpiTile({
  label, value, sub, tone, onClick,
}: {
  label: string; value: string; sub?: string; tone: 'red' | 'amber' | 'blue' | 'gray'; onClick?: () => void
}) {
  const tones = {
    red: 'bg-rose-50 border-rose-200 text-rose-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  }[tone]
  return (
    <button onClick={onClick} className={`text-left rounded-xl border p-4 transition hover:shadow-sm ${tones}`}>
      <div className="text-xs uppercase font-semibold tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub ? <div className="text-xs opacity-70 mt-0.5">{sub}</div> : null}
    </button>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
        active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'red' | 'gray' }) {
  const t = tone === 'red' ? 'bg-rose-600 text-white' : 'bg-gray-200 text-gray-700'
  return <span className={`ml-1.5 inline-flex items-center justify-center text-xs rounded-full px-1.5 min-w-[1.25rem] h-5 ${t}`}>{children}</span>
}
