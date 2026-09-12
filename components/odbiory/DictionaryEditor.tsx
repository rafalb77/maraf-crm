'use client'
import { useEffect, useState } from 'react'
import { DEFECT_PRIORITIES, DEFECT_PRIORITY_LABELS, TRADES, TRADE_LABELS } from '@/lib/odbiory/constants'
import { STARTER_DEFECT_TYPES } from '@/lib/odbiory/starter-dictionary'
import { isSessionExpired } from '@/lib/api-client'

type Row = {
  id: string
  code: number
  name: string
  trade: string
  defaultSubcontractorId: string | null
  defaultDays: number | null
  defaultPriority: string
  active: boolean
  usageCount: number
}
type Sub = { id: string; name: string }

export function DictionaryEditor() {
  const [rows, setRows] = useState<Row[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', trade: 'OGOLNE', defaultDays: '7', defaultPriority: 'NORMALNY', defaultSubcontractorId: '' })
  const [showInactive, setShowInactive] = useState(false)

  async function load() {
    const [t, s] = await Promise.all([fetch('/api/odbiory/types', { cache: 'no-store' }), fetch('/api/odbiory/structure', { cache: 'no-store' })])
    if (t.ok) setRows(await t.json())
    if (s.ok) setSubs(((await s.json()).subcontractors || []) as Sub[])
  }
  useEffect(() => {
    void load()
  }, [])

  async function patch(id: string, data: Partial<Row>) {
    const res = await fetch(`/api/odbiory/types/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    if (isSessionExpired(res)) return
    const j = await res.json()
    if (!res.ok) {
      setError(j?.error || 'Błąd zapisu')
      return
    }
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...j } : x)))
  }

  async function add() {
    if (!form.name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/odbiory/types', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), trade: form.trade, defaultDays: form.defaultDays === '' ? null : Number(form.defaultDays), defaultPriority: form.defaultPriority, defaultSubcontractorId: form.defaultSubcontractorId || null }),
      })
      if (isSessionExpired(res)) return
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Błąd')
      setRows((r) => [...r, j].sort((a, b) => a.code - b.code))
      setForm((f) => ({ ...f, name: '' }))
    } catch (e: any) {
      setError(e?.message)
    } finally {
      setBusy(false)
    }
  }

  async function seed() {
    if (!confirm(`Wgrać słownik startowy (${STARTER_DEFECT_TYPES.length} pozycji)? Istniejące kody zostaną pominięte.`)) return
    setBusy(true)
    const have = new Set(rows.map((r) => r.code))
    let added = 0
    for (const t of STARTER_DEFECT_TYPES) {
      if (have.has(t.code)) continue
      const res = await fetch('/api/odbiory/types', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(t) })
      if (res.ok) added++
    }
    setBusy(false)
    await load()
    alert(`Dodano ${added} pozycji.`)
  }

  const visible = rows.filter((r) => showInactive || r.active)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-gray-900">Dodaj typ usterki</div>
        <div className="flex flex-wrap gap-2">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="np. Brak kąta przy otworze drzwiowym" className="min-w-[260px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <select value={form.trade} onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-2 text-sm">
            {TRADES.map((t) => (
              <option key={t} value={t}>{TRADE_LABELS[t]}</option>
            ))}
          </select>
          <select value={form.defaultSubcontractorId} onChange={(e) => setForm((f) => ({ ...f, defaultSubcontractorId: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-2 text-sm">
            <option value="">domyślny wykonawca: brak</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input value={form.defaultDays} onChange={(e) => setForm((f) => ({ ...f, defaultDays: e.target.value }))} type="number" min={0} className="w-24 rounded-md border border-gray-300 px-2 py-2 text-sm" title="Domyślny termin (dni)" placeholder="dni" />
          <select value={form.defaultPriority} onChange={(e) => setForm((f) => ({ ...f, defaultPriority: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-2 text-sm">
            {DEFECT_PRIORITIES.map((p) => (
              <option key={p} value={p}>{DEFECT_PRIORITY_LABELS[p]}</option>
            ))}
          </select>
          <button type="button" onClick={add} disabled={busy || !form.name.trim()} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Dodaj</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button type="button" onClick={seed} disabled={busy} className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 disabled:opacity-40">Wgraj słownik startowy ({STARTER_DEFECT_TYPES.length})</button>
          <label className="flex items-center gap-2 text-gray-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> pokaż nieaktywne</label>
          {error && <span className="text-red-600">{error}</span>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm lg:min-w-0">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 w-16">Kod</th>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Branża</th>
              <th className="px-3 py-2">Domyślny wykonawca</th>
              <th className="px-3 py-2 w-20">Dni</th>
              <th className="px-3 py-2">Priorytet</th>
              <th className="px-3 py-2 w-16">Użyć</th>
              <th className="px-3 py-2 w-20">Aktywny</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
                <td className="px-3 py-1.5 font-bold text-gray-800">{r.code}</td>
                <td className="px-3 py-1.5">
                  <input defaultValue={r.name} onBlur={(e) => e.target.value.trim() !== r.name && patch(r.id, { name: e.target.value.trim() })} className="w-full rounded border border-transparent px-2 py-1 hover:border-gray-300 focus:border-gray-400" />
                </td>
                <td className="px-3 py-1.5">
                  <select value={r.trade} onChange={(e) => patch(r.id, { trade: e.target.value })} className="rounded border border-gray-200 px-1 py-1">
                    {TRADES.map((t) => (
                      <option key={t} value={t}>{TRADE_LABELS[t]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select value={r.defaultSubcontractorId || ''} onChange={(e) => patch(r.id, { defaultSubcontractorId: e.target.value || null })} className="rounded border border-gray-200 px-1 py-1">
                    <option value="">—</option>
                    {subs.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" min={0} defaultValue={r.defaultDays ?? ''} onBlur={(e) => patch(r.id, { defaultDays: e.target.value === '' ? null : Number(e.target.value) })} className="w-16 rounded border border-gray-200 px-2 py-1" />
                </td>
                <td className="px-3 py-1.5">
                  <select value={r.defaultPriority} onChange={(e) => patch(r.id, { defaultPriority: e.target.value })} className="rounded border border-gray-200 px-1 py-1">
                    {DEFECT_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{DEFECT_PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5 text-gray-500">{r.usageCount}</td>
                <td className="px-3 py-1.5">
                  <input type="checkbox" checked={r.active} onChange={(e) => patch(r.id, { active: e.target.checked })} />
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">Słownik jest pusty. Wgraj słownik startowy albo dodaj pierwszy typ.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
