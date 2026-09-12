'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Tablet, CheckSquare, Printer, Send, Copy, ExternalLink, Users, ListChecks, FileText, Flag } from 'lucide-react'
import {
  ATTENDEE_ROLES,
  ATTENDEE_ROLE_LABELS,
  DEFECT_STATUS_BADGE,
  DEFECT_STATUS_LABELS,
  DEFECT_STATUS_RING,
  DEFECT_PRIORITY_LABELS,
  INSPECTION_KIND_LABELS,
  INSPECTION_RESULTS,
  INSPECTION_RESULT_LABELS,
  INSPECTION_STATUS_BADGE,
  INSPECTION_STATUS_LABELS,
  TRADE_LABELS,
  type DefectStatus,
  type InspectionKind,
  type InspectionResult,
  type InspectionStatus,
} from '@/lib/odbiory/constants'
import { formatDatePl, formatDateTimePl, unitShortLabel } from '@/lib/odbiory/codes'
import type { SnapshotDefect } from '@/lib/odbiory/types'
import { isSessionExpired } from '@/lib/api-client'

export type InspectionDetail = {
  id: string
  number: string
  kind: string
  scopeName: string
  stage: string | null
  status: string
  result: string | null
  building: string | null
  staircase: string | null
  floor: number | null
  inspectorName: string | null
  startedAt: string
  finishedAt: string | null
  scheduledAt: string | null
  fixDueAt: string | null
  notes: string | null
  protocolUrl: string | null
  investment: { id: string; name: string; code: string | null }
  subcontractor: { id: string; name: string; email: string | null } | null
  sheet: { id: string; name: string; imageUrl: string; width: number; height: number } | null
  parent: { id: string; number: string } | null
  children: { id: string; number: string; startedAt: string }[]
  attendees: Attendee[]
  defects: SnapshotDefect[]
}

type Attendee = {
  id?: string
  role: string
  name: string
  company: string | null
  userId: string | null
  subcontractorId: string | null
  email: string | null
  phone: string | null
  present: boolean
}

type Sub = { id: string; name: string; email: string | null }
type DispatchRow = {
  id: string
  status: string
  createdAt: string
  sentAt: string | null
  sentTo: string | null
  submittedAt: string | null
  subcontractor: { id: string; name: string; email: string | null }
  count: number
  open: number
  fixed: number
  accepted: number
}

const TABS = [
  { key: 'defects', label: 'Usterki', icon: <ListChecks className="h-4 w-4" /> },
  { key: 'contractors', label: 'Wykonawcy i pakiety', icon: <Send className="h-4 w-4" /> },
  { key: 'protocol', label: 'Protokół i obecni', icon: <FileText className="h-4 w-4" /> },
] as const

export function InspectionCard({ initial, subcontractors }: { initial: InspectionDetail; subcontractors: Sub[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('defects')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [subFilter, setSubFilter] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const insp = initial
  const readOnly = insp.status !== 'W_TOKU'

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const d of insp.defects) c[d.status] = (c[d.status] || 0) + 1
    return c
  }, [insp.defects])

  const subName = (id: string | null) => subcontractors.find((s) => s.id === id)?.name || null

  const filtered = insp.defects.filter((d) => (!statusFilter || d.status === statusFilter) && (!subFilter || (subFilter === 'none' ? !d.subcontractorId : d.subcontractorId === subFilter)))

  async function patch(data: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/odbiory/inspections/${insp.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      if (isSessionExpired(res)) return false
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Błąd zapisu')
      router.refresh()
      return true
    } catch (e: any) {
      setError(e?.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Nagłówek */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <Link href="/odbiory" className="hover:underline">Odbiory</Link>
            <span>/</span>
            <span className="font-mono">{insp.number}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${INSPECTION_STATUS_BADGE[insp.status as InspectionStatus] || ''}`}>{INSPECTION_STATUS_LABELS[insp.status as InspectionStatus] || insp.status}</span>
            {insp.result && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">{INSPECTION_RESULT_LABELS[insp.result as InspectionResult] || insp.result}</span>}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{insp.scopeName}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {INSPECTION_KIND_LABELS[insp.kind as InspectionKind] || insp.kind}
            {insp.subcontractor ? ` · ${insp.subcontractor.name}` : ''} · prowadzi {insp.inspectorName || '—'} · rozpoczęty {formatDateTimePl(insp.startedAt)}
            {insp.finishedAt ? ` · zakończony ${formatDateTimePl(insp.finishedAt)}` : ''}
            {insp.fixDueAt ? ` · termin usunięcia ${formatDatePl(insp.fixDueAt)}` : ''}
          </p>
          {insp.parent && (
            <p className="mt-1 text-xs text-gray-500">
              Ponowny odbiór po <Link href={`/odbiory/${insp.parent.id}`} className="text-blue-700 underline">{insp.parent.number}</Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/odbiory/teren/${insp.id}`} className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
            <Tablet className="h-4 w-4" /> Rzut i pinezki
          </Link>
          <Link href={`/odbiory/teren/${insp.id}?tryb=weryfikacja`} className="flex items-center gap-1.5 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">
            <CheckSquare className="h-4 w-4" /> Ponowny odbiór
          </Link>
          <a href={`/odbiory/${insp.id}/protokol`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Printer className="h-4 w-4" /> Protokół
          </a>
        </div>
      </div>

      {/* KPI */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Usterek" value={insp.defects.length} />
        <Kpi label="Do poprawy" value={counts.DO_POPRAWY || 0} color={DEFECT_STATUS_RING.DO_POPRAWY} />
        <Kpi label="Do odbioru" value={counts.POPRAWIONA || 0} color={DEFECT_STATUS_RING.POPRAWIONA} />
        <Kpi label="Odebrane" value={counts.ODEBRANA || 0} color={DEFECT_STATUS_RING.ODEBRANA} />
        <Kpi label="Sporne / anulowane" value={(counts.SPORNA || 0) + (counts.ANULOWANA || 0)} color={DEFECT_STATUS_RING.SPORNA} />
      </div>

      {/* Zakładki */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {tab === 'defects' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {[['', 'Wszystkie'], ['DO_POPRAWY', 'Do poprawy'], ['POPRAWIONA', 'Do odbioru'], ['ODEBRANA', 'Odebrane'], ['SPORNA', 'Sporne'], ['ANULOWANA', 'Anulowane']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setStatusFilter(k)} className={`rounded-full px-3 py-1 ${statusFilter === k ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>
                {l}
                {k && counts[k] ? ` (${counts[k]})` : ''}
              </button>
            ))}
            <select value={subFilter} onChange={(e) => setSubFilter(e.target.value)} className="ml-auto rounded-md border border-gray-300 px-2 py-1 text-sm">
              <option value="">wszyscy wykonawcy</option>
              <option value="none">nieprzypisane</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] text-sm lg:min-w-0">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 w-14">Nr</th>
                  <th className="px-3 py-2">Kod</th>
                  <th className="px-3 py-2">Lokal / pom.</th>
                  <th className="px-3 py-2">Usterka</th>
                  <th className="px-3 py-2">Wykonawca</th>
                  <th className="px-3 py-2">Termin</th>
                  <th className="px-3 py-2">Priorytet</th>
                  <th className="px-3 py-2">Zdj.</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((d) => {
                  const overdue = d.dueAt && d.status === 'DO_POPRAWY' && new Date(d.dueAt).getTime() < Date.now() - 12 * 3600 * 1000
                  return (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link href={`/odbiory/teren/${insp.id}?usterka=${d.id}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-gray-900" style={{ border: `3px solid ${DEFECT_STATUS_RING[d.status as DefectStatus] || '#dc2626'}` }} title="Pokaż na rzucie">
                          {d.seq}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{d.code}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {d.unitNumber ? unitShortLabel(d.unitNumber) : <span className="text-gray-400">część wspólna</span>}
                        {d.room ? <div className="text-xs text-gray-500">{d.room}</div> : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{d.title}</div>
                        {d.description && <div className="line-clamp-2 text-xs text-gray-500">{d.description}</div>}
                        {d.trade && <div className="text-[11px] uppercase tracking-wide text-gray-400">{TRADE_LABELS[d.trade as keyof typeof TRADE_LABELS] || d.trade}</div>}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{subName(d.subcontractorId) || <span className="text-gray-400">—</span>}</td>
                      <td className={`px-3 py-2 ${overdue ? 'font-semibold text-red-600' : 'text-gray-700'}`}>{d.dueAt ? formatDatePl(d.dueAt) : '—'}</td>
                      <td className="px-3 py-2">{d.priority === 'PILNY' ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">Pilne</span> : <span className="text-gray-500">{DEFECT_PRIORITY_LABELS[d.priority as keyof typeof DEFECT_PRIORITY_LABELS] || d.priority}</span>}</td>
                      <td className="px-3 py-2 text-gray-500">{d.photos.length || ''}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DEFECT_STATUS_BADGE[d.status as DefectStatus] || ''}`}>{DEFECT_STATUS_LABELS[d.status as DefectStatus] || d.status}</span>
                        {d.rejectedCount > 0 && <div className="text-[11px] text-red-600">nie odebrana {d.rejectedCount}×</div>}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-gray-500">Brak usterek w tym widoku. Postaw pinezki w widoku terenowym.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'contractors' && <ContractorsTab insp={insp} subcontractors={subcontractors} />}

      {tab === 'protocol' && <ProtocolTab insp={insp} subcontractors={subcontractors} readOnly={readOnly} busy={busy} onPatch={patch} />}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
        {color && <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />}
        {value}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function ContractorsTab({ insp, subcontractors }: { insp: InspectionDetail; subcontractors: Sub[] }) {
  const [dispatches, setDispatches] = useState<DispatchRow[]>([])
  const [result, setResult] = useState<{ subId: string; url: string; count: number; urgent: number; dueAt: string | null; sent: boolean; sentTo: string | null; mailError: string | null } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toOverride, setToOverride] = useState<Record<string, string>>({})

  async function loadDispatches() {
    const res = await fetch(`/api/odbiory/inspections/${insp.id}/dispatch`, { cache: 'no-store' })
    if (res.ok) setDispatches(await res.json())
  }
  useEffect(() => {
    void loadDispatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insp.id])

  const groups = useMemo(() => {
    const map = new Map<string | null, SnapshotDefect[]>()
    for (const d of insp.defects) {
      if (d.status === 'ANULOWANA') continue
      const arr = map.get(d.subcontractorId) || []
      arr.push(d)
      map.set(d.subcontractorId, arr)
    }
    return [...map.entries()].sort((a, b) => (a[0] === null ? 1 : b[0] === null ? -1 : 0))
  }, [insp.defects])

  async function send(subId: string) {
    setBusyId(subId)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/odbiory/inspections/${insp.id}/dispatch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subcontractorId: subId, send: true, to: toOverride[subId] || undefined }),
      })
      if (isSessionExpired(res)) return
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Nie udało się wysłać')
      setResult({ subId, ...j })
      void loadDispatches()
    } catch (e: any) {
      setError(e?.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {groups.map(([subId, defects]) => {
        const sub = subcontractors.find((s) => s.id === subId)
        const open = defects.filter((d) => d.status === 'DO_POPRAWY')
        const urgent = open.filter((d) => d.priority === 'PILNY')
        const fixed = defects.filter((d) => d.status === 'POPRAWIONA')
        const accepted = defects.filter((d) => d.status === 'ODEBRANA')
        const disputed = defects.filter((d) => d.status === 'SPORNA')
        const due = open.map((d) => d.dueAt).filter(Boolean).sort()[0] || null
        const last = dispatches.find((x) => x.subcontractor.id === subId && x.status !== 'ZAMKNIETY')
        return (
          <div key={subId || 'none'} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-gray-900">{sub?.name || 'Nieprzypisane do wykonawcy'}</div>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-600">
                  <span><b className="text-red-600">{open.length}</b> do poprawy{urgent.length ? ` (${urgent.length} pilne)` : ''}</span>
                  <span><b className="text-orange-600">{fixed.length}</b> do odbioru</span>
                  <span><b className="text-green-700">{accepted.length}</b> odebrane</span>
                  {disputed.length > 0 && <span><b className="text-purple-700">{disputed.length}</b> sporne</span>}
                  {due && <span>termin {formatDatePl(due)}</span>}
                </div>
                <div className="mt-1 text-xs text-gray-500">{defects.map((d) => `#${d.seq}`).join(', ')}</div>
                {last && (
                  <div className="mt-2 text-xs text-gray-600">
                    Ostatni pakiet: {last.status === 'WYSLANY' ? `wysłany ${formatDateTimePl(last.sentAt)} do ${last.sentTo}` : last.status === 'ZGLOSZONY' ? `wykonawca zgłosił do odbioru ${formatDateTimePl(last.submittedAt)}` : `utworzony ${formatDateTimePl(last.createdAt)} (link nie wysłany mailem)`} · {last.count} poz.
                  </div>
                )}
              </div>
              {subId && (
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={toOverride[subId] ?? (sub?.email || '')}
                      onChange={(e) => setToOverride((m) => ({ ...m, [subId]: e.target.value }))}
                      placeholder="e-mail wykonawcy"
                      className="w-56 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <button type="button" disabled={busyId === subId || open.length + disputed.length === 0} onClick={() => send(subId)} className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                      <Send className="h-4 w-4" /> {busyId === subId ? 'Wysyłam…' : 'Wyślij poprawki'}
                    </button>
                  </div>
                  <span className="text-[11px] text-gray-500">Pakiet = otwarte usterki tej firmy z tego odbioru; wykonawca dostaje prywatny link.</span>
                </div>
              )}
            </div>
            {result && result.subId === subId && (
              <div className={`mt-3 rounded-lg border p-3 text-sm ${result.sent ? 'border-green-300 bg-green-50' : 'border-orange-300 bg-orange-50'}`}>
                <div className="font-medium">
                  {result.sent ? `Wysłano do ${result.sentTo}` : result.mailError ? `Nie wysłano mailem: ${result.mailError}` : 'Link utworzony (bez wysyłki mailem — brak adresu)'} · {result.count} usterek{result.urgent ? `, ${result.urgent} pilne` : ''}
                  {result.dueAt ? `, termin ${formatDatePl(result.dueAt)}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input readOnly value={result.url} className="min-w-[280px] flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs" onFocus={(e) => e.target.select()} />
                  <button type="button" onClick={() => navigator.clipboard?.writeText(result.url)} className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium">
                    <Copy className="h-3.5 w-3.5" /> Kopiuj link
                  </button>
                  <a href={result.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium">
                    <ExternalLink className="h-3.5 w-3.5" /> Podgląd jak wykonawca
                  </a>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">Link jest prywatny (ważny 90 dni). Możesz go też wysłać SMS-em lub WhatsAppem. Kolejne „Wyślij poprawki” tworzy nowy link i unieważnia poprzedni.</p>
              </div>
            )}
          </div>
        )
      })}
      {groups.length === 0 && <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">Brak usterek — nie ma czego wysyłać.</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
function ProtocolTab({ insp, subcontractors, readOnly, busy, onPatch }: { insp: InspectionDetail; subcontractors: Sub[]; readOnly: boolean; busy: boolean; onPatch: (data: Record<string, unknown>) => Promise<boolean> }) {
  const router = useRouter()
  const [attendees, setAttendees] = useState<Attendee[]>(insp.attendees.length ? insp.attendees : [{ role: 'INSPEKTOR', name: insp.inspectorName || '', company: 'MARAF Development', userId: null, subcontractorId: null, email: null, phone: null, present: true }])
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [notes, setNotes] = useState(insp.notes || '')
  const [result, setResult] = useState(insp.result || '')
  const [fixDueAt, setFixDueAt] = useState(insp.fixDueAt ? insp.fixDueAt.slice(0, 10) : '')
  const [saved, setSaved] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/odbiory/structure', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setUsers(j.users || []))
      .catch(() => {})
  }, [])

  const openCount = insp.defects.filter((d) => d.status === 'DO_POPRAWY' || d.status === 'POPRAWIONA' || d.status === 'SPORNA').length

  async function saveAttendees() {
    setErr(null)
    const res = await fetch(`/api/odbiory/inspections/${insp.id}/attendees`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attendees }) })
    if (isSessionExpired(res)) return
    if (!res.ok) {
      setErr((await res.json().catch(() => ({})))?.error || 'Błąd zapisu obecnych')
      return
    }
    setSaved('Obecni zapisani')
    router.refresh()
  }

  async function saveMeta() {
    setSaved(null)
    const ok = await onPatch({ notes, result: result || null, fixDueAt: fixDueAt || null })
    if (ok) setSaved('Zapisano')
  }

  async function finish() {
    if (!result) {
      setErr('Wybierz wynik odbioru')
      return
    }
    if (!confirm(`Zakończyć odbiór ${insp.number}? Po zakończeniu usterki są zablokowane do edycji (nadal można je odbierać i wysyłać wykonawcom).`)) return
    await saveAttendees()
    const ok = await onPatch({ notes, result, fixDueAt: fixDueAt || null, status: 'ZAKONCZONY' })
    if (ok) window.open(`/odbiory/${insp.id}/protokol`, '_blank')
  }

  const suggestions = [
    ...users.map((u) => ({ name: u.name || u.email, company: 'MARAF Development', role: 'INSPEKTOR', userId: u.id, subcontractorId: null as string | null })),
    ...subcontractors.map((s) => ({ name: s.name, company: s.name, role: 'WYKONAWCA', userId: null as string | null, subcontractorId: s.id })),
  ]

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900"><Users className="h-4 w-4" /> Obecni przy odbiorze</div>
          <p className="mb-3 text-xs text-gray-500">Wybierz z książki projektu (użytkownicy CRM i wykonawcy) albo wpisz. Odznacz „obecny”, gdy ktoś się nie stawił — trafi to do protokołu.</p>
          <datalist id="attendee-names">
            {suggestions.map((s, i) => (
              <option key={i} value={s.name} />
            ))}
          </datalist>
          <div className="space-y-2">
            {attendees.map((a, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <select value={a.role} onChange={(e) => setAttendees((l) => l.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} className="col-span-12 rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-3">
                  {ATTENDEE_ROLES.map((r) => (
                    <option key={r} value={r}>{ATTENDEE_ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <input
                  list="attendee-names"
                  value={a.name}
                  onChange={(e) => {
                    const v = e.target.value
                    const s = suggestions.find((x) => x.name === v)
                    setAttendees((l) => l.map((x, j) => (j === i ? { ...x, name: v, company: s ? s.company : x.company, role: s && x.role === 'INNY' ? s.role : x.role, userId: s?.userId ?? null, subcontractorId: s?.subcontractorId ?? null } : x)))
                  }}
                  placeholder="Imię i nazwisko"
                  className="col-span-12 rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-4"
                />
                <input value={a.company || ''} onChange={(e) => setAttendees((l) => l.map((x, j) => (j === i ? { ...x, company: e.target.value } : x)))} placeholder="Firma" className="col-span-8 rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-3" />
                <label className={`col-span-3 flex items-center gap-1 text-xs sm:col-span-1 ${a.present ? 'text-gray-700' : 'text-red-600'}`}>
                  <input type="checkbox" checked={a.present} onChange={(e) => setAttendees((l) => l.map((x, j) => (j === i ? { ...x, present: e.target.checked } : x)))} /> {a.present ? 'obecny' : 'nie stawił się'}
                </label>
                <button type="button" onClick={() => setAttendees((l) => l.filter((_, j) => j !== i))} className="col-span-1 text-gray-400 hover:text-red-600" title="Usuń">×</button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setAttendees((l) => [...l, { role: 'WYKONAWCA', name: '', company: insp.subcontractor?.name || '', userId: null, subcontractorId: insp.subcontractor?.id || null, email: null, phone: null, present: true }])} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">+ Dodaj osobę</button>
            <button type="button" onClick={saveAttendees} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white">Zapisz obecnych</button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900"><Flag className="h-4 w-4" /> Wynik i uwagi</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Wynik odbioru</label>
              <select value={result} onChange={(e) => setResult(e.target.value)} disabled={readOnly} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm">
                <option value="">— wybierz —</option>
                {INSPECTION_RESULTS.map((r) => (
                  <option key={r} value={r}>{INSPECTION_RESULT_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Wspólny termin usunięcia usterek</label>
              <input type="date" value={fixDueAt} onChange={(e) => setFixDueAt(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm" />
            </div>
          </div>
          <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-gray-500">Uwagi do protokołu</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Ustalenia, prace niedokończone, uwagi stron…" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={saveMeta} disabled={busy} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium">Zapisz</button>
            {!readOnly ? (
              <button type="button" onClick={finish} disabled={busy} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white">Zakończ odbiór i otwórz protokół</button>
            ) : (
              <button type="button" onClick={() => onPatch({ status: 'W_TOKU' })} disabled={busy} className="rounded-md border border-gray-300 px-3 py-2 text-sm">Wznów odbiór (odblokuj edycję)</button>
            )}
            {saved && <span className="text-sm text-green-700">{saved}</span>}
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <div className="mb-2 font-semibold text-gray-900">Protokół wypełnia się sam</div>
          <dl className="space-y-1 text-gray-700">
            <div className="flex justify-between"><dt className="text-gray-500">Data</dt><dd>{formatDatePl(insp.finishedAt || insp.startedAt)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Inwestycja</dt><dd>{insp.investment.name}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Zakres</dt><dd className="text-right">{insp.scopeName}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Wykonawca</dt><dd>{insp.subcontractor?.name || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Usterek</dt><dd>{insp.defects.filter((d) => d.status !== 'ANULOWANA').length} (otwartych {openCount})</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Obecnych</dt><dd>{attendees.filter((a) => a.present && a.name).length} / nieobecnych {attendees.filter((a) => !a.present && a.name).length}</dd></div>
          </dl>
          <div className="mt-3 flex flex-col gap-2">
            <a href={`/odbiory/${insp.id}/protokol`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 font-medium text-gray-800"><Printer className="h-4 w-4" /> Protokół (PDF / druk)</a>
            <a href={`/odbiory/${insp.id}/protokol?zdjecia=1`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 font-medium text-gray-800"><Printer className="h-4 w-4" /> Załącznik: rzut, legenda i zdjęcia</a>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">Otwiera widok do druku; „Zapisz jako PDF” w przeglądarce. Pinezki na rzucie w kolorach statusów lub czarno-białe (opcja w widoku).</p>
        </div>
        {insp.children.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <div className="mb-2 font-semibold text-gray-900">Kolejne odbiory</div>
            <ul className="space-y-1">
              {insp.children.map((c) => (
                <li key={c.id}><Link href={`/odbiory/${c.id}`} className="text-blue-700 underline">{c.number}</Link> · {formatDatePl(c.startedAt)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
