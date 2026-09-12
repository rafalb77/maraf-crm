'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, AlertTriangle, RefreshCw, Send } from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import { DEFECT_STATUS_RING, type DefectStatus } from '@/lib/odbiory/constants'
import { formatDatePl, formatDateTimePl, unitShortLabel } from '@/lib/odbiory/codes'
import type { SnapshotDefect } from '@/lib/odbiory/types'

type Portal = {
  dispatch: { id: string; status: string; createdAt: string; sentAt: string | null; submittedAt: string | null; expiresAt: string }
  contractor: { id: string; name: string; contactName: string | null }
  investment: { id: string; name: string }
  inspection: { number: string; scopeName: string; inspectorName: string | null; fixDueAt: string | null } | null
  sheet: { id: string; name: string; imageUrl: string; width: number; height: number } | null
  items: SnapshotDefect[]
  summary: { total: number; open: number; fixed: number; accepted: number; disputed: number; urgent: number; dueAt: string | null }
}

const ORDER: Record<string, number> = { DO_POPRAWY: 0, SPORNA: 1, POPRAWIONA: 2, ODEBRANA: 3, ANULOWANA: 4 }

export function ContractorPortal({ token }: { token: string }) {
  const [data, setData] = useState<Portal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const res = await fetch(`/api/public/odbiory/w/${encodeURIComponent(token)}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Nie udało się wczytać')
      setData(j)
    } catch (e: any) {
      setError(e?.message || 'Błąd')
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const items = useMemo(() => (data ? [...data.items].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.seq - b.seq) : []), [data])

  async function submitAll() {
    if (!data) return
    const n = data.summary.fixed
    if (!confirm(`Zgłosić ${n} ${n === 1 ? 'pozycję' : n < 5 ? 'pozycje' : 'pozycji'} do ponownego odbioru?`)) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/odbiory/w/${encodeURIComponent(token)}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Nie udało się zgłosić')
      setSubmitMsg(`Zgłoszono ${j.count} pozycji. Prowadzący odbiór dostał powiadomienie i umówi ponowny odbiór.`)
      await load()
    } catch (e: any) {
      setError(e?.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-orange-500" />
        <p className="text-gray-800">{error}</p>
        <p className="mt-2 text-sm text-gray-500">Link mógł wygasnąć albo został zastąpiony nowym. Poproś o nowy link od prowadzącego odbiór.</p>
      </div>
    )
  }
  if (!data) return <div className="flex h-[60vh] items-center justify-center text-gray-500"><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Wczytuję…</div>

  return (
    <div className="mx-auto max-w-2xl pb-28">
      <header className="bg-white px-4 py-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">Usterki do poprawy · {data.investment.name}</div>
        <h1 className="text-xl font-bold text-gray-900">{data.contractor.name}</h1>
        {data.inspection && <div className="text-sm text-gray-600">{data.inspection.number} · {data.inspection.scopeName}{data.inspection.inspectorName ? ` · prowadzi ${data.inspection.inspectorName}` : ''}</div>}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Tile label="do poprawy" value={data.summary.open} color={DEFECT_STATUS_RING.DO_POPRAWY} sub={data.summary.urgent ? `${data.summary.urgent} pilne` : undefined} />
          <Tile label="zgłoszone" value={data.summary.fixed} color={DEFECT_STATUS_RING.POPRAWIONA} />
          <Tile label="odebrane" value={data.summary.accepted} color={DEFECT_STATUS_RING.ODEBRANA} />
        </div>
        {data.summary.dueAt && <div className="mt-2 text-sm text-gray-700">Termin usunięcia: <b>{formatDatePl(data.summary.dueAt)}</b></div>}
        {data.dispatch.submittedAt && <div className="mt-1 text-xs text-green-700">Ostatnie zgłoszenie do ponownego odbioru: {formatDateTimePl(data.dispatch.submittedAt)}</div>}
        <p className="mt-2 text-xs text-gray-500">Przy każdej pozycji: rzut z miejscem usterki, zdjęcie i opis. Po naprawie dodaj zdjęcie „po” i naciśnij „Gotowe do ponownego odbioru”. Na końcu zgłoś wszystkie jednym przyciskiem.</p>
      </header>

      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}
      {submitMsg && <p className="mx-4 mt-3 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">{submitMsg}</p>}

      <ul className="space-y-3 p-4">
        {items.map((d) => (
          <ItemCard key={d.id} token={token} item={d} sheet={data.sheet} onChanged={(nd) => setData((p) => (p ? { ...p, items: p.items.map((x) => (x.id === nd.id ? nd : x)), summary: recount(p.items.map((x) => (x.id === nd.id ? nd : x)), p.summary) } : p))} />
        ))}
      </ul>

      {data.summary.fixed > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-300 bg-white p-3">
          <div className="mx-auto max-w-2xl">
            <button type="button" onClick={submitAll} disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-4 text-base font-bold uppercase tracking-wide text-white disabled:opacity-50">
              <Send className="h-5 w-5" /> Zgłoś {data.summary.fixed} {data.summary.fixed === 1 ? 'pozycję' : data.summary.fixed < 5 ? 'pozycje' : 'pozycji'} do ponownego odbioru
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function recount(items: SnapshotDefect[], prev: Portal['summary']): Portal['summary'] {
  return {
    ...prev,
    open: items.filter((d) => d.status === 'DO_POPRAWY').length,
    fixed: items.filter((d) => d.status === 'POPRAWIONA').length,
    accepted: items.filter((d) => d.status === 'ODEBRANA').length,
    disputed: items.filter((d) => d.status === 'SPORNA').length,
    urgent: items.filter((d) => d.priority === 'PILNY' && d.status === 'DO_POPRAWY').length,
  }
}

function Tile({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-2 py-2">
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      {sub && <div className="text-[11px] font-semibold text-red-600">{sub}</div>}
    </div>
  )
}

function PlanCrop({ sheet, x, y, color }: { sheet: NonNullable<Portal['sheet']>; x: number; y: number; color: string }) {
  const zoom = 1.8
  const w = 280
  const h = 170
  return (
    <div className="relative overflow-hidden rounded-md border border-gray-300 bg-gray-100" style={{ width: w, height: h, backgroundImage: `url(${sheet.imageUrl})`, backgroundRepeat: 'no-repeat', backgroundSize: `${sheet.width * zoom}px ${sheet.height * zoom}px`, backgroundPosition: `${-(x * zoom - w / 2)}px ${-(y * zoom - h / 2)}px` }}>
      <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" style={{ border: `3px solid ${color}` }} />
      <div className="absolute bottom-1 right-1 rounded bg-white/80 px-1 text-[10px] text-gray-600">{sheet.name}</div>
    </div>
  )
}

function ItemCard({ token, item, sheet, onChanged }: { token: string; item: SnapshotDefect; sheet: Portal['sheet']; onChanged: (d: SnapshotDefect) => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const status = item.status as DefectStatus
  const ring = DEFECT_STATUS_RING[status] || '#dc2626'
  const overdue = item.dueAt && status === 'DO_POPRAWY' && new Date(item.dueAt).getTime() < Date.now() - 12 * 3600 * 1000
  const before = item.photos.filter((p) => p.phase !== 'PO')
  const after = item.photos.filter((p) => p.phase === 'PO')
  const actionable = status === 'DO_POPRAWY' || status === 'SPORNA'

  async function send(action: 'POPRAWIONA' | 'SPORNA') {
    setBusy(true)
    setErr(null)
    try {
      let last: SnapshotDefect | null = null
      const list = files.length ? files : [null]
      for (let i = 0; i < list.length; i++) {
        const form = new FormData()
        form.append('action', i === list.length - 1 ? action : 'KOMENTARZ')
        if (i === list.length - 1 && note.trim()) form.append('note', note.trim())
        const f = list[i]
        if (f) {
          const c = await compressImage(f).catch(() => f)
          form.append('file', c, c.name || 'zdjecie.jpg')
        }
        const res = await fetch(`/api/public/odbiory/w/${encodeURIComponent(token)}/items/${item.id}`, { method: 'POST', body: form })
        const j = await res.json()
        if (!res.ok) throw new Error(j?.error || 'Nie udało się zapisać')
        last = j
      }
      if (last) onChanged(last)
      setOpen(false)
      setFiles([])
      setNote('')
    } catch (e: any) {
      setErr(e?.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold" style={{ border: `4px solid ${ring}` }}>{item.seq}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{item.title}</span>
            {item.priority === 'PILNY' && status === 'DO_POPRAWY' && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Pilne</span>}
          </div>
          <div className="text-sm text-gray-600">
            {item.unitNumber ? `Lokal ${unitShortLabel(item.unitNumber)}` : 'Część wspólna'}{item.room ? ` / ${item.room}` : ''}
            {item.dueAt ? <span className={overdue ? ' font-semibold text-red-600' : ''}> · termin {formatDatePl(item.dueAt)}{overdue ? ' (po terminie)' : ''}</span> : null}
          </div>
          {item.description && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{item.description}</p>}
          <div className="mt-1 text-xs font-medium" style={{ color: ring }}>
            {status === 'DO_POPRAWY' ? 'Do poprawy' : status === 'POPRAWIONA' ? `Zgłoszona jako poprawiona ${formatDateTimePl(item.fixReportedAt)} — czeka na odbiór` : status === 'ODEBRANA' ? `Odebrana ${formatDateTimePl(item.acceptedAt)} ✓` : status === 'SPORNA' ? `Sporna${item.disputeNote ? `: ${item.disputeNote}` : ''}` : status}
            {item.rejectedCount > 0 && status === 'DO_POPRAWY' && <span className="text-red-600"> · nie odebrana {item.rejectedCount}× — sprawdź uwagi</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {sheet && <PlanCrop sheet={sheet} x={item.x} y={item.y} color={ring} />}
        {before.map((p) => (
          <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="h-[170px] w-auto max-w-[240px] rounded-md border border-gray-300 object-cover" />
          </a>
        ))}
        {after.map((p) => (
          <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="h-[170px] w-auto max-w-[240px] rounded-md border-2 border-orange-400 object-cover" />
            <span className="absolute left-1 top-1 rounded bg-orange-500 px-1 text-[10px] font-bold text-white">PO</span>
          </a>
        ))}
      </div>
      {actionable && !open && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setOpen(true)} className="flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-3 text-sm font-bold text-white">
            <Check className="h-4 w-4" /> Gotowe do ponownego odbioru
          </button>
          <button type="button" onClick={() => { setOpen(true); setNote((n) => n || '') }} className="flex items-center justify-center gap-1.5 rounded-lg border border-purple-400 px-3 py-3 text-sm font-semibold text-purple-800">
            <AlertTriangle className="h-4 w-4" /> Sporne / nie mój zakres
          </button>
        </div>
      )}
      {actionable && open && (
        <div className="mt-3 rounded-lg border border-gray-300 bg-gray-50 p-3">
          <div className="text-sm font-semibold text-gray-800">Zdjęcie po naprawie (zalecane) i uwaga</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-md border border-gray-400 bg-white px-3 py-2 text-sm">
              <Camera className="h-4 w-4" /> {files.length ? `${files.length} zdj.` : 'Zrób zdjęcie „po”'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { setFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
            {files.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={URL.createObjectURL(f)} alt="" className="h-12 w-12 rounded border object-cover" />
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Uwaga (opcjonalnie; przy „sporne” — wymagana)" className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">Anuluj</button>
            <button type="button" disabled={busy || !note.trim()} onClick={() => send('SPORNA')} className="rounded-md border border-purple-400 bg-white px-3 py-2 text-sm font-semibold text-purple-800 disabled:opacity-40">Sporne</button>
            <button type="button" disabled={busy} onClick={() => send('POPRAWIONA')} className="rounded-md bg-green-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Wysyłam…' : 'Poprawione'}</button>
          </div>
        </div>
      )}
    </li>
  )
}
