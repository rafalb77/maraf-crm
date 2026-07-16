'use client'
import Link from 'next/link'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  CONTRACT_TYPE_LABELS, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS,
  type ContractType, type ContractStatus,
} from '@/lib/types'
import { ClickableRow } from '@/components/ui/ClickableRow'
import { useTableSort, SortHeader } from '@/components/ui/sortableTable'

export type ContractRow = {
  id: string
  number: string
  investmentName: string
  type: string
  clientName: string
  unitLabel: string
  amountGross: number | null
  introducedAt: string // ISO
  signedAt: string | null // ISO
  status: string
}

type Key = 'klient' | 'lokal' | 'typ' | 'kwota' | 'podpis' | 'status'

function getValue(c: ContractRow, key: Key): string | number | null {
  switch (key) {
    case 'klient': return c.clientName
    case 'lokal': return c.unitLabel
    case 'typ': return CONTRACT_TYPE_LABELS[c.type as ContractType] || c.type
    case 'kwota': return c.amountGross
    case 'podpis': return c.signedAt
    case 'status': return CONTRACT_STATUS_LABELS[c.status as ContractStatus] || c.status
  }
}

// Kolor badge typu umowy (oprawa v2 — odwzorowanie standalone):
// deweloperska = akcent (złoto), rezerwacyjna = ostrzeżenie, przeniesienia = sukces.
const TYPE_BADGE: Record<ContractType, { bg: string; fg: string; border: string }> = {
  DEWELOPERSKA:  { bg: 'var(--status-accent-bg)',  fg: 'var(--status-accent-fg)',  border: 'var(--status-accent-border)' },
  REZERWACYJNA:  { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning-fg)', border: 'var(--status-warning-border)' },
  PRZENIESIENIA: { bg: 'var(--status-success-bg)', fg: 'var(--status-success-fg)', border: 'var(--status-success-border)' },
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase()
}

const TH = 'px-4 py-3 font-medium'

export function SalesTable({ rows }: { rows: ContractRow[] }) {
  const { sorted, sortKey, sortDir, onSort } = useTableSort<ContractRow, Key>(rows, getValue, 'podpis', 'desc')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Mobile (<md): karty zamiast tabeli — wzorzec ClientsTable.tsx. Cała karta
          klika w szczegóły umowy (Link absolute inset-0). */}
      <ul className="md:hidden divide-y divide-gray-100">
        {sorted.length === 0 ? (
          <li className="px-4 py-12 text-center text-gray-400 text-sm">Brak umów</li>
        ) : (
          sorted.map((c) => {
            const badge = TYPE_BADGE[c.type as ContractType]
            return (
              <li key={c.id} className="relative px-4 py-3">
                <Link
                  href={`/sales/${c.id}`}
                  prefetch={false}
                  className="absolute inset-0"
                  aria-label={`${c.clientName} — ${c.number}`}
                />
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    {initials(c.clientName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{c.clientName}</p>
                    <p className="text-[11px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{c.number}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${CONTRACT_STATUS_COLORS[c.status as ContractStatus]}`}>
                    {CONTRACT_STATUS_LABELS[c.status as ContractStatus]}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-[11px] font-medium border"
                    style={badge ? { background: badge.bg, color: badge.fg, borderColor: badge.border } : undefined}
                  >
                    {CONTRACT_TYPE_LABELS[c.type as ContractType]}
                  </span>
                  <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{c.unitLabel}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                  <span className="tabular-nums text-gray-900 font-medium">
                    {c.amountGross != null ? formatCurrency(c.amountGross) : '—'}
                  </span>
                  <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {c.signedAt ? formatDate(new Date(c.signedAt)) : '—'}
                  </span>
                </div>
              </li>
            )
          })
        )}
      </ul>

      {/* Desktop/tablet (md+): pełna sortowalna tabela */}
      <table className="w-full hidden md:table">
        <thead className="text-xs uppercase" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
          <tr>
            <SortHeader label="Klient" colKey="klient" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Lokal" colKey="lokal" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Umowa" colKey="typ" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
            <SortHeader label="Kwota brutto" colKey="kwota" activeKey={sortKey} dir={sortDir} onSort={onSort} className={`${TH} text-right`} />
            <SortHeader label="Data podpisania" colKey="podpis" activeKey={sortKey} dir={sortDir} onSort={onSort} className={`${TH} text-right`} />
            <SortHeader label="Status" colKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} className={TH} />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-12 text-gray-400">Brak umów</td>
            </tr>
          ) : (
            sorted.map((c) => {
              const badge = TYPE_BADGE[c.type as ContractType]
              return (
                <ClickableRow key={c.id} href={`/sales/${c.id}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        {initials(c.clientName)}
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900 block truncate">{c.clientName}</span>
                        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{c.number}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{c.unitLabel}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-medium border"
                      style={badge ? { background: badge.bg, color: badge.fg, borderColor: badge.border } : undefined}
                    >
                      {CONTRACT_TYPE_LABELS[c.type as ContractType]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums text-gray-900">
                    {c.amountGross != null ? formatCurrency(c.amountGross) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {c.signedAt ? formatDate(new Date(c.signedAt)) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${CONTRACT_STATUS_COLORS[c.status as ContractStatus]}`}>
                      {CONTRACT_STATUS_LABELS[c.status as ContractStatus]}
                    </span>
                  </td>
                </ClickableRow>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
