'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type HistoryEntry = {
  id: string
  action: string
  oldValue: string | null
  newValue: string | null
  note: string | null
  userEmail: string | null
  createdAt: string
}

type Item = {
  id: string
  position: number
  name: string
  unit: string
  laborQty: number
  concreteVol: number
  rebarMass: number
  matchMode: string
  matchReason: string | null
  manualValue: number | null
  manualNote: string | null
  konradManualValue: number | null
  konradManualReason: string | null
  accepted: boolean
  acceptedAt: Date | string | null
  acceptedNote: string | null
  autoValue: number | null
  autoUnit: string
  autoMatchedCount?: number | null
  autoBreakdown?: { key: string; count: number; value: number }[] | null
  aggMethod?: string | null
  protocolDoneQty?: number
  protocolDoneAmount?: number
  protocolPct?: number
  history?: HistoryEntry[]
}

// Próg w obrębie którego wartość Konrada uznajemy za zgodną z Marafem.
// Powyżej tego progu — kierownik musi wpisać konradManualReason.
const KONRAD_DIFF_THRESHOLD = 0.05

const ACTION_LABEL: Record<string, string> = {
  ACCEPT: '✓ Zaakceptowano różnicę',
  UNACCEPT: '↩ Cofnięto akceptację',
  SET_MANUAL_VALUE: '✏ Ustawiono ręczną wartość Marafa',
  CLEAR_MANUAL_VALUE: '🗑 Wyczyszczono ręczną wartość Marafa',
  SET_KONRAD_VALUE: '✏ Ustawiono ręczną wartość kierownika',
  CLEAR_KONRAD_VALUE: '🗑 Wyczyszczono ręczną wartość kierownika',
  EDIT_NOTE: '📝 Zmieniono komentarz',
  REIMPORT: '🔄 Reimport — zaktualizowano wartość kierownika',
}
const ACTION_COLOR: Record<string, string> = {
  ACCEPT: 'text-green-700',
  UNACCEPT: 'text-amber-700',
  SET_MANUAL_VALUE: 'text-blue-700',
  CLEAR_MANUAL_VALUE: 'text-gray-600',
  SET_KONRAD_VALUE: 'text-indigo-700',
  CLEAR_KONRAD_VALUE: 'text-gray-600',
  REIMPORT: 'text-purple-700',
  EDIT_NOTE: 'text-gray-700',
}

const MATCH_MODE_LABEL: Record<string, string> = {
  AUTO_OK: 'auto',
  MANUAL_FLOOR_SPLIT: 'wielokondygnacyjny',
  MANUAL_DIFF_UNIT: 'inna jednostka',
  MANUAL_OUT_OF_SCOPE: 'poza ŻB',
  MANUAL_NOT_FOUND: 'brak u kierownika',
  MANUAL_OVERRIDE: 'ręczne nadpisanie',
}
const MATCH_MODE_BADGE: Record<string, string> = {
  AUTO_OK: 'bg-blue-50 text-blue-700',
  MANUAL_FLOOR_SPLIT: 'bg-purple-50 text-purple-700',
  MANUAL_DIFF_UNIT: 'bg-orange-50 text-orange-700',
  MANUAL_OUT_OF_SCOPE: 'bg-gray-100 text-gray-600',
  MANUAL_NOT_FOUND: 'bg-amber-50 text-amber-700',
  MANUAL_OVERRIDE: 'bg-emerald-50 text-emerald-700',
}

function refValue(it: Item): number | null {
  // Konrad wpisany ręcznie ma pierwszeństwo nad wartością z xlsx Konrada.
  if (it.konradManualValue != null) return it.konradManualValue
  if (it.aggMethod === 'volumeSum') return it.concreteVol || null
  if (it.aggMethod === 'areaSum') return it.laborQty || null
  if (it.unit === 'm3' || it.unit === 'm³') return it.concreteVol || it.laborQty
  return it.laborQty
}

function refLabel(it: Item): string {
  if (it.aggMethod === 'volumeSum') return 'm³ betonu'
  if (it.aggMethod === 'areaSum') return 'm²'
  return it.unit
}

function unitLabel(u: string) {
  if (u === 'm3') return 'm³'
  if (u === 'm2') return 'm²'
  return u
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ComparisonTable({
  summaryId,
  items: initial,
}: {
  summaryId: string
  items: Item[]
}) {
  const [items, setItems] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-3 font-medium w-10">Lp.</th>
              <th className="text-left px-3 py-3 font-medium">Pozycja kierownika</th>
              <th className="text-center px-2 py-3 font-medium">Jedn.<br/>poz.</th>
              <th className="text-right px-3 py-3 font-medium bg-blue-50/50">Maraf<br/>(wyznacznik)</th>
              <th className="text-right px-3 py-3 font-medium">Kierownik</th>
              <th className="text-right px-3 py-3 font-medium">Δ</th>
              <th className="text-right px-3 py-3 font-medium">Δ%</th>
              <th className="text-left px-3 py-3 font-medium w-32">Postęp<br/>w protokołach</th>
              <th className="text-left px-3 py-3 font-medium">Tryb</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                isOpen={openId === it.id}
                onToggle={() => setOpenId(openId === it.id ? null : it.id)}
                onUpdate={(patch) => setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, ...patch } : x)))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ItemRow({
  item,
  isOpen,
  onToggle,
  onUpdate,
}: {
  item: Item
  isOpen: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<Item>) => void
}) {
  const router = useRouter()
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)

  // Maraf (obmiar projektowy) jest wyznacznikiem — pokazujemy go pierwszego.
  // Kierownik to porównanie. Δ = kierownik − Maraf, Δ% = Δ / Maraf × 100.
  const kierownikValue = refValue(item) ?? 0
  const marafValue = item.manualValue != null ? item.manualValue : item.autoValue
  const diff = marafValue != null && marafValue > 0 ? kierownikValue - marafValue : null
  const diffPct = diff != null && marafValue != null && marafValue > 0 ? (diff / marafValue) * 100 : null

  const flag = item.accepted
    ? '✓'
    : diffPct == null
      ? ''
      : Math.abs(diffPct) <= 5
        ? '✓'
        : Math.abs(diffPct) <= 15
          ? '~'
          : '✗'

  const flagCls = item.accepted
    ? 'text-green-600'
    : flag === '✓' ? 'text-green-600' : flag === '~' ? 'text-amber-600' : flag === '✗' ? 'text-red-600' : 'text-gray-400'

  async function save(patch: any) {
    setSaving(true)
    try {
      const res = await fetch(`/api/przeroby/floor-summaries/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Błąd')
      const data = await res.json().catch(() => ({}))
      onUpdate({
        manualValue: 'manualValue' in patch ? patch.manualValue : item.manualValue,
        manualNote: 'manualNote' in patch ? patch.manualNote : item.manualNote,
        konradManualValue: 'konradManualValue' in patch ? patch.konradManualValue : item.konradManualValue,
        konradManualReason: 'konradManualReason' in patch ? patch.konradManualReason : item.konradManualReason,
        accepted: 'accepted' in patch ? patch.accepted : item.accepted,
        acceptedNote: 'acceptedNote' in patch ? patch.acceptedNote : item.acceptedNote,
        acceptedAt: 'accepted' in patch ? (patch.accepted ? new Date() : null) : item.acceptedAt,
      })
      setSavedAt(new Date())
      router.refresh()
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  // Czy widoczny jest przycisk „Akceptuj różnicę"?
  // Pokazujemy gdy:
  //  - mamy auto-policzoną wartość lub ręczną (jest co akceptować)
  //  - LUB wymagana jest decyzja kierownika (MANUAL_*)
  // Nie pokazujemy gdy: różnica <=5% (już matchuje) lub poza ŻB (nie ma sensu akceptować braku)
  const showAcceptButton = !item.accepted &&
    item.matchMode !== 'MANUAL_OUT_OF_SCOPE' &&
    (marafValue != null || item.matchMode.startsWith('MANUAL_')) &&
    !(diffPct != null && Math.abs(diffPct) <= 5)

  return (
    <>
      <tr
        className={`border-t border-gray-100 ${item.matchMode !== 'AUTO_OK' ? 'bg-gray-50/30' : ''} hover:bg-gray-50/60 cursor-pointer`}
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-gray-500 text-xs">{item.position}.</td>
        <td className="px-3 py-2 text-gray-900">{item.name}</td>
        <td className="px-2 py-2 text-center text-xs text-gray-600">{unitLabel(item.unit)}</td>
        <td className="px-3 py-2 text-right tabular-nums bg-blue-50/30">
          {marafValue != null ? (
            <>
              {fmt(marafValue)}
              {item.manualValue != null && (
                <span className="ml-1 text-emerald-600 text-xs" title="Wartość ręczna">✏</span>
              )}
              <span className="block text-[10px] text-gray-400">{refLabel(item)}</span>
            </>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {fmt(kierownikValue)}
          {item.konradManualValue != null && (
            <span className="ml-1 text-indigo-600 text-xs" title="Wartość ręczna kierownika">✏</span>
          )}
          <span className="block text-[10px] text-gray-400">{refLabel(item)}</span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {diff != null ? fmt(diff) : '—'}
        </td>
        <td className={`px-3 py-2 text-right tabular-nums ${flagCls} font-medium`}>
          {diffPct != null ? `${flag} ${diffPct.toFixed(1)}%` : ''}
        </td>
        <td className="px-3 py-2">
          <ProgressMini
            pct={item.protocolPct || 0}
            label={
              item.protocolDoneQty && item.protocolDoneQty > 0
                ? `${fmt(item.protocolDoneQty)} ${unitLabel(item.unit)}`
                : '—'
            }
          />
        </td>
        <td className="px-3 py-2">
          <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider rounded ${MATCH_MODE_BADGE[item.matchMode] || 'bg-gray-100'}`}>
            {MATCH_MODE_LABEL[item.matchMode] || item.matchMode}
          </span>
        </td>
        <td className="px-3 py-2 text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</td>
      </tr>

      {isOpen && (
        <tr className="border-t border-gray-100 bg-gray-50/40">
          <td colSpan={10} className="px-5 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Detale liczbowe kierownika */}
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Dane kierownika</p>
                <div className="space-y-1 text-xs">
                  <Detail label="Robocizny" value={`${fmt(item.laborQty)} ${unitLabel(item.unit)}`} />
                  <Detail label="Beton C25/30" value={`${fmt(item.concreteVol)} m³`} />
                  <Detail label="Zbrojenie" value={`${fmt(item.rebarMass)} kg`} />
                </div>
              </div>

              {/* Powód trybu ręcznego */}
              {item.matchMode !== 'AUTO_OK' && (
                <div className="bg-white rounded-lg border border-amber-200 p-3 lg:col-span-2">
                  <p className="text-xs font-semibold text-amber-800 mb-2">
                    Dlaczego ręczne porównanie?
                  </p>
                  <p className="text-xs text-gray-700 leading-relaxed">{item.matchReason || 'Brak opisu.'}</p>
                  {item.aggMethod && item.autoMatchedCount === 0 && (
                    <p className="text-xs text-red-700 mt-2 leading-relaxed">
                      ⚠ Reguła Marafa nie dopasowała żadnej pozycji obmiaru — sprawdź czy dane Marafa są zaimportowane dla tej kategorii / kondygnacji.
                    </p>
                  )}
                </div>
              )}

              {/* Wartość auto + reguła (gdy są dane Marafa policzone z reguły) */}
              {item.autoValue != null && (
                <div className="bg-white rounded-lg border border-blue-200 p-3 lg:col-span-2">
                  <p className="text-xs font-semibold text-blue-800 mb-2">
                    Auto-dopasowanie (Maraf)
                  </p>
                  <div className="text-xs text-gray-700">
                    Wartość Marafa obliczona automatycznie z obmiaru projektowego:{' '}
                    <strong>{fmt(item.autoValue)} {unitLabel(item.autoUnit)}</strong>
                    {item.autoMatchedCount != null && item.autoMatchedCount > 0 && (
                      <span className="text-gray-500"> · z {item.autoMatchedCount} pozycji obmiaru</span>
                    )}.
                    Możesz nadpisać tę wartość ręcznie poniżej.
                  </div>
                  {item.autoBreakdown && item.autoBreakdown.length > 1 && (
                    <div className="mt-3 pt-2 border-t border-blue-100">
                      <p className="text-[10px] uppercase tracking-wider text-blue-700 mb-1">Składowe</p>
                      <ul className="text-xs text-gray-700 space-y-0.5">
                        {item.autoBreakdown.map((b) => (
                          <li key={b.key} className="flex justify-between gap-3">
                            <span className="text-gray-700">
                              {b.key} <span className="text-gray-400">({b.count})</span>
                            </span>
                            <span className="tabular-nums font-medium text-gray-900">
                              {fmt(b.value)} {unitLabel(item.autoUnit)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Akceptacja różnicy */}
            <div className="mt-4 bg-white rounded-lg border border-gray-200 p-3">
              {item.accepted ? (
                <AcceptedBanner item={item} saving={saving} onSave={save} />
              ) : showAcceptButton ? (
                <AcceptForm item={item} diffPct={diffPct} saving={saving} onSave={save} />
              ) : (
                <p className="text-xs text-gray-400">
                  {diffPct != null && Math.abs(diffPct) <= 5
                    ? 'Pozycja w zakresie tolerancji (≤5%) — akceptacja niewymagana.'
                    : 'Pozycja jest poza zakresem porównania.'}
                </p>
              )}
            </div>

            {/* Edycja ręczna — wartość kierownika */}
            <div className="mt-4 bg-white rounded-lg border border-indigo-200 p-3">
              <p className="text-xs font-semibold text-indigo-800 mb-1">
                Wartość kierownika (ręczna)
              </p>
              <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                Wpisz wartość kierownika gdy nie ma jej w xlsx „Ściany i słupy żelb.". Jeśli różnica vs Maraf przekroczy {Math.round(KONRAD_DIFF_THRESHOLD * 100)}% — wymagane uzasadnienie.
              </p>
              <KonradEditor
                item={item}
                marafValue={marafValue}
                saving={saving}
                onSave={save}
              />
            </div>

            {/* Edycja ręczna — wartość Marafa */}
            <div className="mt-4 bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-3">
                Ręczne wprowadzenie wartości Marafa i komentarz
              </p>
              <ManualEditor
                item={item}
                saving={saving}
                onSave={save}
              />
            </div>

            {savedAt && (
              <p className="text-xs text-green-600 mt-2">✓ Zapisano o {savedAt.toLocaleTimeString('pl-PL')}</p>
            )}

            {/* Historia zmian */}
            {item.history && item.history.length > 0 && (
              <HistoryPanel entries={item.history} />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function AcceptForm({
  item,
  diffPct,
  saving,
  onSave,
}: {
  item: Item
  diffPct: number | null
  saving: boolean
  onSave: (patch: any) => void
}) {
  const [note, setNote] = useState<string>(item.acceptedNote || '')
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p className="text-xs font-semibold text-gray-700 mb-2">
        Akceptacja różnicy
      </p>
      <p className="text-xs text-gray-600 mb-3 leading-relaxed">
        {diffPct != null
          ? `Kierownik różni się od Marafa o ${diffPct.toFixed(1)}%. `
          : 'Brak automatycznego porównania. '}
        Jeśli wartość jest poprawna w kontekście realizacji robót, możesz świadomie zaakceptować różnicę — pozycja zaliczy się do gotowości protokołu.
      </p>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder="np. „Tolerancja projektowa, fragmenty ścian wystają poza obrys parteru"
        className="w-full mb-2 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      <button
        onClick={() => onSave({ accepted: true, acceptedNote: note })}
        disabled={saving}
        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded text-sm font-medium"
      >
        {saving ? 'Zapisuję...' : '✓ Zaakceptuj różnicę'}
      </button>
    </div>
  )
}

function AcceptedBanner({ item, saving, onSave }: { item: Item; saving: boolean; onSave: (patch: any) => void }) {
  const acceptedAt = item.acceptedAt instanceof Date ? item.acceptedAt : item.acceptedAt ? new Date(item.acceptedAt as any) : null
  return (
    <div className="bg-green-50 border border-green-200 rounded p-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800 mb-1">
            ✓ Różnica zaakceptowana
          </p>
          {item.acceptedNote && (
            <p className="text-xs text-green-700 italic">„{item.acceptedNote}"</p>
          )}
          {acceptedAt && (
            <p className="text-[10px] text-green-600 mt-1">
              {acceptedAt.toLocaleString('pl-PL')}
            </p>
          )}
        </div>
        <button
          onClick={() => onSave({ accepted: false, acceptedNote: null })}
          disabled={saving}
          className="text-xs text-green-700 hover:text-green-900 underline"
        >
          Cofnij akceptację
        </button>
      </div>
    </div>
  )
}

function ManualEditor({
  item,
  saving,
  onSave,
}: {
  item: Item
  saving: boolean
  onSave: (patch: { manualValue?: number | null; manualNote?: string }) => void
}) {
  const [value, setValue] = useState<string>(item.manualValue != null ? String(item.manualValue) : '')
  const [note, setNote] = useState<string>(item.manualNote || '')

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Wartość Marafa ręczna ({item.unit})</label>
          <input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder={item.autoValue != null ? String(item.autoValue) : '0.00'}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-600 mb-1">Komentarz / uzasadnienie</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="np. Z rzutów konstrukcji ścian na poziomie parteru = 95 m³"
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSave({
            manualValue: value === '' ? null : Number(value),
            manualNote: note,
          })}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded text-sm font-medium"
        >
          {saving ? 'Zapisuję...' : '💾 Zapisz'}
        </button>
        {item.manualValue != null && (
          <button
            onClick={() => { setValue(''); setNote(''); onSave({ manualValue: null, manualNote: '' }) }}
            disabled={saving}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
          >
            Wyczyść ręczną wartość
          </button>
        )}
      </div>
    </div>
  )
}

function KonradEditor({
  item,
  marafValue,
  saving,
  onSave,
}: {
  item: Item
  marafValue: number | null
  saving: boolean
  onSave: (patch: { konradManualValue?: number | null; konradManualReason?: string | null }) => void
}) {
  const [value, setValue] = useState<string>(item.konradManualValue != null ? String(item.konradManualValue) : '')
  const [reason, setReason] = useState<string>(item.konradManualReason || '')

  const parsedValue = value === '' ? null : Number(value)
  const valueIsValidNumber = parsedValue == null || !Number.isNaN(parsedValue)

  // Δ% vs Maraf — liczone live, żeby kierownik widział czy uzasadnienie jest wymagane.
  const diffPct =
    parsedValue != null && marafValue != null && marafValue > 0 && valueIsValidNumber
      ? ((parsedValue - marafValue) / marafValue) * 100
      : null

  const reasonRequired = diffPct != null && Math.abs(diffPct) > KONRAD_DIFF_THRESHOLD * 100
  const reasonMissing = reasonRequired && reason.trim().length === 0
  const canSave = !saving && valueIsValidNumber && !reasonMissing && parsedValue != null

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Wartość kierownika ({item.unit})</label>
          <input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder={marafValue != null ? `Maraf: ${marafValue.toFixed(2)}` : '0.00'}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
          />
          {diffPct != null && (
            <p className={`text-[11px] mt-1 ${Math.abs(diffPct) <= KONRAD_DIFF_THRESHOLD * 100 ? 'text-green-700' : 'text-amber-700'}`}>
              Δ vs Maraf: {diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%
              {Math.abs(diffPct) > KONRAD_DIFF_THRESHOLD * 100 && ' — uzasadnienie wymagane'}
            </p>
          )}
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-600 mb-1">
            Z czego wynika różnica? {reasonRequired && <span className="text-red-600">*</span>}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="np. Strop nad I p. = 1018 m² wg pomiaru na budowie (vs 1013,90 wg projektu) — uwzględniono zwiększone otwory technologiczne."
            rows={2}
            className={`w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${reasonMissing ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
          />
          {reasonMissing && (
            <p className="text-[11px] text-red-600 mt-1">Wpisz uzasadnienie — różnica przekracza {Math.round(KONRAD_DIFF_THRESHOLD * 100)}%.</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSave({
            konradManualValue: parsedValue,
            konradManualReason: reason.trim() || null,
          })}
          disabled={!canSave}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded text-sm font-medium"
          title={reasonMissing ? 'Wpisz uzasadnienie' : ''}
        >
          {saving ? 'Zapisuję...' : '💾 Zapisz wartość kierownika'}
        </button>
        {item.konradManualValue != null && (
          <button
            onClick={() => { setValue(''); setReason(''); onSave({ konradManualValue: null, konradManualReason: null }) }}
            disabled={saving}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
          >
            Wyczyść
          </button>
        )}
      </div>
    </div>
  )
}

function HistoryPanel({ entries }: { entries: HistoryEntry[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4 bg-white rounded-lg border border-gray-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
      >
        <span className="text-xs font-semibold text-gray-700">
          📜 Historia zmian ({entries.length})
        </span>
        <span className="text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {entries.map((h) => {
            const date = new Date(h.createdAt)
            const oldVal = formatHistoryValue(h.oldValue)
            const newVal = formatHistoryValue(h.newValue)
            return (
              <div key={h.id} className="px-3 py-2 text-xs">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className={`font-medium ${ACTION_COLOR[h.action] || 'text-gray-700'}`}>
                    {ACTION_LABEL[h.action] || h.action}
                  </span>
                  <span className="text-[10px] text-gray-400 tabular-nums">
                    {date.toLocaleString('pl-PL')}
                    {h.userEmail && <> · {h.userEmail}</>}
                  </span>
                </div>
                {(oldVal !== '—' || newVal !== '—') && (
                  <div className="text-[11px] text-gray-600 ml-1">
                    <span className="text-gray-400">{oldVal}</span>
                    <span className="mx-1">→</span>
                    <span className="text-gray-900 font-medium">{newVal}</span>
                  </div>
                )}
                {h.note && (
                  <p className="text-[11px] text-gray-700 italic ml-1 mt-0.5">„{h.note}"</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatHistoryValue(s: string | null): string {
  if (s == null) return '—'
  try {
    const parsed = JSON.parse(s)
    if (parsed === null) return '∅'
    if (typeof parsed === 'boolean') return parsed ? 'tak' : 'nie'
    if (typeof parsed === 'number') return parsed.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (typeof parsed === 'string') return parsed.length > 60 ? parsed.substring(0, 60) + '…' : parsed
    return String(parsed)
  } catch {
    return s
  }
}

function ProgressMini({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const color =
    clamped >= 99 ? '#16a34a' : clamped >= 50 ? '#ca8a04' : clamped > 0 ? '#2563eb' : '#e5e7eb'
  return (
    <div className="space-y-0.5">
      <div className="bg-gray-200 rounded-full overflow-hidden h-1.5">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span className="tabular-nums">{clamped.toFixed(0)}%</span>
        <span className="text-right">{label}</span>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium tabular-nums">{value}</span>
    </div>
  )
}
