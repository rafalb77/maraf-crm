'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { INSPECTION_KINDS, INSPECTION_KIND_LABELS } from '@/lib/odbiory/constants'
import { isSessionExpired } from '@/lib/api-client'
import type { InvestmentStructure } from '@/lib/odbiory/sheets'

type StructureResponse = {
  investments: { id: string; name: string; code: string | null; status: string }[]
  structure: InvestmentStructure | null
  subcontractors: { id: string; name: string; email: string | null }[]
  users: { id: string; name: string | null; email: string }[]
}

const STAGE_SUGGESTIONS = ['Stan surowy', 'Stan surowy zamknięty', 'Tynki', 'Wylewki', 'Instalacje elektryczne', 'Instalacje sanitarne', 'Stolarka', 'Stan deweloperski']

export function NewInspectionWizard() {
  const router = useRouter()
  const [data, setData] = useState<StructureResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [investmentId, setInvestmentId] = useState('')
  const [building, setBuilding] = useState('')
  const [staircase, setStaircase] = useState('')
  const [markersKey, setMarkersKey] = useState('')
  const [kind, setKind] = useState('ROBOTY')
  const [stage, setStage] = useState('Stan surowy')
  const [subcontractorId, setSubcontractorId] = useState('')
  const [newSub, setNewSub] = useState({ name: '', email: '' })
  const [showNewSub, setShowNewSub] = useState(false)
  const [notes, setNotes] = useState('')

  async function loadStructure(invId?: string) {
    try {
      const res = await fetch(`/api/odbiory/structure${invId ? `?investmentId=${invId}` : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Błąd ${res.status}`)
      const j = (await res.json()) as StructureResponse
      setData(j)
      if (!invId && j.structure) setInvestmentId(j.structure.id)
      if (j.structure && j.structure.buildings.length === 1) setBuilding(j.structure.buildings[0].name)
    } catch (e: any) {
      setError(e?.message || 'Nie udało się pobrać struktury inwestycji')
    }
  }

  useEffect(() => {
    void loadStructure()
  }, [])

  const bld = useMemo(() => data?.structure?.buildings.find((b) => b.name === building) || null, [data, building])

  async function addSub() {
    const name = newSub.name.trim()
    if (!name) return
    const res = await fetch('/api/odbiory/subcontractors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: newSub.email.trim() || null }) })
    if (isSessionExpired(res)) return
    const j = await res.json()
    if (!res.ok) {
      setError(j?.error || 'Nie udało się dodać wykonawcy')
      return
    }
    setData((d) => (d ? { ...d, subcontractors: [...d.subcontractors.filter((s) => s.id !== j.id), { id: j.id, name: j.name, email: j.email }].sort((a, b) => a.name.localeCompare(b.name, 'pl')) } : d))
    setSubcontractorId(j.id)
    setShowNewSub(false)
    setNewSub({ name: '', email: '' })
  }

  async function submit() {
    setError(null)
    if (!investmentId) return setError('Wybierz inwestycję')
    if (!markersKey) return setError('Wybierz kondygnację')
    setBusy(true)
    try {
      const res = await fetch('/api/odbiory/inspections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ investmentId, building: building || null, staircase: staircase || null, markersKey, kind, stage: stage.trim() || null, subcontractorId: subcontractorId || null, notes: notes.trim() || null }),
      })
      if (isSessionExpired(res)) return
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Nie udało się utworzyć odbioru')
      router.push(`/odbiory/teren/${j.id}`)
    } catch (e: any) {
      setError(e?.message || 'Błąd')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="text-gray-500">{error || 'Wczytuję strukturę inwestycji…'}</div>

  return (
    <div className="max-w-3xl space-y-6">
      <Section step="1" title="Projekt">
        <div className="flex flex-wrap gap-2">
          {data.investments.map((i) => (
            <Chip key={i.id} active={investmentId === i.id} onClick={() => { setInvestmentId(i.id); void loadStructure(i.id) }}>
              {i.name}
            </Chip>
          ))}
          {data.investments.length === 0 && <span className="text-sm text-gray-500">Brak inwestycji — dodaj ją w module Budowa.</span>}
        </div>
      </Section>

      <Section step="2" title="Budynek">
        <div className="flex flex-wrap gap-2">
          {data.structure?.buildings.map((b) => (
            <Chip key={b.name} active={building === b.name} onClick={() => { setBuilding(b.name); setStaircase('') }}>
              {b.name}
            </Chip>
          ))}
        </div>
      </Section>

      <Section step="3" title="Klatka" hint={bld && bld.staircases.length === 0 ? 'Lokale w bazie nie mają przypisanej klatki — odbiór obejmie całą kondygnację.' : 'Opcjonalnie: rzut zostanie przybliżony do wybranej klatki.'}>
        <div className="flex flex-wrap gap-2">
          <Chip active={staircase === ''} onClick={() => setStaircase('')}>cała kondygnacja</Chip>
          {bld?.staircases.map((s) => (
            <Chip key={s} active={staircase === s} onClick={() => setStaircase(s)}>
              klatka {s}
            </Chip>
          ))}
        </div>
      </Section>

      <Section step="4" title="Kondygnacja (arkusz rzutu)">
        <div className="flex flex-wrap gap-2">
          {bld?.floors.map((f) => (
            <Chip key={f.key} active={markersKey === f.key} onClick={() => setMarkersKey(f.key)}>
              {f.label} <span className="ml-1 text-xs opacity-70">({f.unitCount})</span>
            </Chip>
          ))}
          {bld && bld.floors.length === 0 && <span className="text-sm text-gray-500">Brak rzutów w public/rzuty/markers.json.</span>}
        </div>
      </Section>

      <Section step="5" title="Rodzaj i zakres odbioru">
        <div className="mb-3 flex flex-wrap gap-2">
          {INSPECTION_KINDS.map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {INSPECTION_KIND_LABELS[k]}
            </Chip>
          ))}
        </div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Zakres robót</label>
        <input value={stage} onChange={(e) => setStage(e.target.value)} list="stage-suggestions" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="np. Stan surowy" />
        <datalist id="stage-suggestions">
          {STAGE_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Section>

      <Section step="6" title="Wykonawca odbieranych robót" hint="Domyślny adresat usterek; przy każdej usterce można wybrać innego.">
        <div className="flex flex-wrap gap-2">
          <select value={subcontractorId} onChange={(e) => setSubcontractorId(e.target.value)} className="min-w-[240px] rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">— bez wykonawcy —</option>
            {data.subcontractors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setShowNewSub((v) => !v)} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700">
            + Nowy wykonawca
          </button>
        </div>
        {showNewSub && (
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={newSub.name} onChange={(e) => setNewSub((s) => ({ ...s, name: e.target.value }))} placeholder="Nazwa firmy" className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input value={newSub.email} onChange={(e) => setNewSub((s) => ({ ...s, email: e.target.value }))} placeholder="e-mail do pakietów usterek" className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <button type="button" onClick={addSub} className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white">Dodaj</button>
          </div>
        )}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notatka do odbioru (opcjonalnie)" className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </Section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={busy || !markersKey} className="rounded-lg bg-gray-900 px-5 py-3 text-base font-semibold text-white disabled:opacity-40">
          {busy ? 'Tworzę…' : 'Rozpocznij odbiór → rzut'}
        </button>
        <span className="text-sm text-gray-500">Po utworzeniu otworzy się widok terenowy; na tablecie dotknij rzut, żeby postawić pierwszą pinezkę.</span>
      </div>
    </div>
  )
}

function Section({ step, title, hint, children }: { step: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">{step}</span>
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
      {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
    </section>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-4 py-2 text-sm ${active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}>
      {children}
    </button>
  )
}
