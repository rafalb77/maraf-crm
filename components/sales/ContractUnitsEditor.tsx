'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Car, Home, Loader2, Package, Plus, Store, Warehouse, X, type LucideIcon } from 'lucide-react'
import { UNIT_TYPE_LABELS, type UnitType } from '@/lib/types'
import { formatArea, formatCurrency } from '@/lib/utils'
import { isSessionExpired, SESSION_EXPIRED_HINT } from '@/lib/api-client'
import { legacyDrift, priceDeltaVsCennik } from '@/lib/unit-pricing'

type UnitRow = {
  unitId: string
  number: string
  type: string
  area: number
  building: string | null
  floor: number | null
  basePriceGross: number // cennik (live)
  legacyPriceGross: number // cennik wg starego wzoru (area × stawka brutto) — dryf, nie rabat
  priceGross: number // snapshot na umowie (po rabacie)
  priceNet: number // snapshot netto (fallback wyliczony z VAT w page.tsx)
}
type AvailableUnit = {
  id: string
  number: string
  type: string
  priceGross: number
  area: number
  building: string | null
  floor: number | null
}

type EditRow = {
  unitId: string
  number: string
  type: string
  area: number
  building: string | null
  floor: number | null
  basePriceGross: number
  legacyPriceGross: number
  snapshotPriceGross: number // wartość startowa (snapshot lub cennik dla dodanych)
  discountValue: string
  initialDiscountValue: string // pre-fill z otwarcia edycji — powrót do niego = wiersz nietknięty
  discountMode: 'PLN' | 'PCT'
  touched: boolean // czy user zmienił rabat — tylko wtedy przeliczamy od ceny bazowej
  repriced: boolean // „Wyrównaj do cennika” — wiersz świadomie przeliczony od cennika
  saved: boolean // lokal jest na zapisanej umowie (dodany w edycji nie ma „zapisanej ceny”)
}

const UNIT_TYPE_ICONS: Record<UnitType, LucideIcon> = {
  MIESZKALNY: Home,
  USLUGOWY: Store,
  PARKING: Car,
  GARAZ: Warehouse,
  KOMORKA: Package,
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function formatPct(pct: number): string {
  // Dopłata 0,08 zł to 0,00002 % — „0 %” obok niezerowej kwoty wyglądałoby na błąd.
  if (pct > 0 && pct < 0.005) return '< 0,01 %'
  return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(pct)} %`
}

function formatSigned(n: number): string {
  return `${n < 0 ? '−' : '+'}${formatCurrency(Math.abs(n))}`
}

/** Porównanie wartości pola liczbowo (puste = puste; '5000' = '5000.00'). */
function sameDiscountValue(a: string, b: string): boolean {
  const x = parseFloat(a)
  const y = parseFloat(b)
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) && Number.isNaN(y)
  return Math.abs(x - y) < 0.004
}

/**
 * Pole wróciło do stanu z otwarcia edycji = wiersz znów nietknięty (cena
 * zapisana bez zmian). Pre-fill jest zawsze w zł, więc „5” w trybie % to
 * inna wartość niż startowe „5” zł; puste pole jest puste w obu jednostkach.
 */
function backToInitial(row: Pick<EditRow, 'initialDiscountValue' | 'repriced'>, value: string, mode: 'PLN' | 'PCT'): boolean {
  if (row.repriced) return false
  if (value === '' && row.initialDiscountValue === '') return true
  if (mode !== 'PLN') return false
  return sameDiscountValue(value, row.initialDiscountValue)
}

function rowFromUnit(u: UnitRow): EditRow {
  // Pre-fill rabatu (ujemny = dopłata): różnica równa dryfowi cennika (stary wzór) to nie rabat.
  const discount = priceDeltaVsCennik(u.basePriceGross, u.priceGross, [u.basePriceGross, u.legacyPriceGross])
  const discountValue = Math.abs(discount) > 0.004 ? String(discount) : ''
  return {
    unitId: u.unitId,
    number: u.number,
    type: u.type,
    area: u.area,
    building: u.building,
    floor: u.floor,
    basePriceGross: u.basePriceGross,
    legacyPriceGross: u.legacyPriceGross,
    snapshotPriceGross: u.priceGross,
    discountValue,
    initialDiscountValue: discountValue,
    discountMode: 'PLN',
    touched: false,
    repriced: false,
    saved: true,
  }
}

/**
 * Cena po rabacie. Nietknięty wiersz zachowuje snapshot (nie re-wycenia się).
 * BAZĄ rabatu jest zawsze cennik (nie cena z umowy) — inaczej rabat 5000 na
 * wierszu z ceną wg starego wzoru zapisałby się jako 5 000,08 i tak wracał
 * w widoku umowy, przy re-edycji i na karcie klienta. Dryf wobec cennika
 * edytor pokazuje jawnie (legacyDrift) i daje akcję „Wyrównaj do cennika”.
 * Rabat ujemny (np. -2) = dopłata: cena rośnie powyżej cennika. Jedyny limit
 * to cena nieujemna.
 */
function finalGrossOf(row: EditRow): number {
  if (!row.touched) return round2(row.snapshotPriceGross)
  const base = row.basePriceGross
  const d = parseFloat(row.discountValue) || 0
  const final = row.discountMode === 'PCT' ? base * (1 - d / 100) : base - d
  return Math.max(0, round2(final))
}

/**
 * Rabat (+) / dopłata (−) wiersza wobec cennika. Ta sama równoważność co w
 * widoku po zapisie (cena równa cennikowi wg starego wzoru = 0), żeby edytor
 * nie pokazywał „rabat −0,08”, które po zapisie zniknie.
 */
function rowDiscountOf(row: EditRow): number {
  return priceDeltaVsCennik(row.basePriceGross, finalGrossOf(row), [row.basePriceGross, row.legacyPriceGross])
}

function rowDriftOf(row: EditRow): number {
  return legacyDrift(row.basePriceGross, row.snapshotPriceGross, row.legacyPriceGross)
}

function UnitTypeBadge({ type }: { type: string }) {
  const Icon = UNIT_TYPE_ICONS[type as UnitType] ?? Home
  return (
    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
      <Icon className="w-4 h-4 text-blue-500" />
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 font-medium text-right">{children}</dd>
    </div>
  )
}

export function ContractUnitsEditor({
  contractId,
  status,
  units,
  availableUnits,
  reservationFee: storedFee,
  contractUpdatedAt,
}: {
  contractId: string
  status: string
  units: UnitRow[]
  availableUnits: AvailableUnit[]
  /** Opłata rezerwacyjna zapisana na umowie (1% wartości); null dla starych umów. */
  reservationFee?: number | null
  /** Znacznik wersji umowy (ISO) — backend odrzuci zapis, gdy ktoś edytował równolegle. */
  contractUpdatedAt?: string
}) {
  const router = useRouter()
  const canEdit = status === 'W_PRZYGOTOWANIU'
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<EditRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addId, setAddId] = useState('')

  function startEdit() {
    setRows(units.map(rowFromUnit))
    setAddId('')
    setError(null)
    setEditing(true)
  }

  const usedIds = useMemo(() => new Set(rows.map((r) => r.unitId)), [rows])
  // Pula do dodania = wolne lokale z serwera + składniki TEJ umowy (serwer je
  // wyklucza z availableUnits, a usunięty w trakcie edycji wiersz musi dać się
  // dodać z powrotem bez zapisywania).
  const addPool = useMemo(() => {
    const pool = new Map<string, AvailableUnit>()
    for (const u of availableUnits) pool.set(u.id, u)
    for (const u of units) {
      if (!pool.has(u.unitId)) {
        pool.set(u.unitId, {
          id: u.unitId,
          number: u.number,
          type: u.type,
          priceGross: u.basePriceGross,
          area: u.area,
          building: u.building,
          floor: u.floor,
        })
      }
    }
    return [...pool.values()].sort((a, b) => a.number.localeCompare(b.number, 'pl'))
  }, [availableUnits, units])
  const addable = addPool.filter((u) => !usedIds.has(u.id))

  const totalGross = rows.reduce((s, r) => s + finalGrossOf(r), 0)
  const reservationFee = round2(totalGross * 0.01)
  // Stopka edycji: rabat/dopłata łącznie (jak w widoku po zapisie), zmiana
  // wobec zapisanej umowy i wiersze z ceną wg starego wzoru do wyrównania.
  const editTotalDiscount = round2(rows.reduce((s, r) => s + rowDiscountOf(r), 0))
  const driftedUntouched = rows.filter((r) => !r.touched && rowDriftOf(r) !== 0)
  // Stary wzór zaokrąglał stawkę w obie strony — dryfy poniżej i powyżej cennika osobno.
  const driftedBelow = driftedUntouched.filter((r) => rowDriftOf(r) > 0)
  const driftedAbove = driftedUntouched.filter((r) => rowDriftOf(r) < 0)
  const driftSummary = [
    driftedBelow.length > 0
      ? `${driftedBelow.length} poniżej cennika o ${formatCurrency(round2(driftedBelow.reduce((s, r) => s + rowDriftOf(r), 0)))}`
      : null,
    driftedAbove.length > 0
      ? `${driftedAbove.length} powyżej cennika o ${formatCurrency(round2(driftedAbove.reduce((s, r) => s - rowDriftOf(r), 0)))}`
      : null,
  ]
    .filter(Boolean)
    .join(', ')

  function setRow(unitId: string, patch: Partial<EditRow>) {
    setRows((prev) => prev.map((r) => (r.unitId === unitId ? { ...r, ...patch } : r)))
  }
  function setDiscount(unitId: string, discountValue: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.unitId !== unitId) return r
        // Powrót do wartości startowej = wiersz znów nietknięty (cena wraca do
        // zapisanej). Wyjątek: po „Wyrównaj do cennika” wiersz zostaje przeliczony.
        return { ...r, discountValue, touched: !backToInitial(r, discountValue, r.discountMode) }
      }),
    )
  }
  function toggleMode(unitId: string, mode: 'PLN' | 'PCT') {
    setRows((prev) =>
      prev.map((r) => {
        if (r.unitId !== unitId || r.discountMode === mode) return r
        const d = parseFloat(r.discountValue) || 0
        const base = r.basePriceGross
        // Puste pole: sama zmiana jednostki nie jest edycją — nie przelicza ceny.
        if (d === 0 || base <= 0) return { ...r, discountMode: mode }
        // Konwertuj wartość, żeby zachować cenę końcową co do grosza (procent
        // z 8 miejscami — 2 miejsca dawały np. 5000 zł → 1,42 % → 5 016,95 zł,
        // 6 miejsc gubiło grosz przy cenach ≥ 1 mln zł).
        const converted =
          mode === 'PCT' ? String(Number(((d / base) * 100).toFixed(8))) : String(round2((base * d) / 100))
        return { ...r, discountMode: mode, discountValue: converted, touched: !backToInitial(r, converted, mode) }
      }),
    )
  }
  /** Świadome przeliczenie wiersza od bieżącego cennika (usuwa dryf starego wzoru). */
  function alignToCennik(unitId: string) {
    setRow(unitId, { discountValue: '', discountMode: 'PLN', touched: true, repriced: true })
  }
  function undoAlign(unitId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.unitId === unitId
          ? { ...r, discountValue: r.initialDiscountValue, discountMode: 'PLN', touched: false, repriced: false }
          : r,
      ),
    )
  }
  function alignAllDrifted() {
    setRows((prev) =>
      prev.map((r) =>
        !r.touched && rowDriftOf(r) !== 0
          ? { ...r, discountValue: '', discountMode: 'PLN', touched: true, repriced: true }
          : r,
      ),
    )
  }
  function removeRow(unitId: string) {
    setRows((prev) => prev.filter((r) => r.unitId !== unitId))
  }
  function addRow() {
    // Składnik tej umowy usunięty i dodany z powrotem wraca ze swoim snapshotem
    // (i ewentualnym dryfem), a nie jako nowy lokal po cenniku.
    const savedUnit = units.find((x) => x.unitId === addId)
    const u = addPool.find((x) => x.id === addId)
    if (!savedUnit && !u) return
    setRows((prev) => [
      ...prev,
      savedUnit
        ? rowFromUnit(savedUnit)
        : {
            unitId: u!.id,
            number: u!.number,
            type: u!.type,
            area: u!.area,
            building: u!.building,
            floor: u!.floor,
            basePriceGross: u!.priceGross,
            legacyPriceGross: u!.priceGross,
            snapshotPriceGross: u!.priceGross,
            discountValue: '',
            initialDiscountValue: '',
            discountMode: 'PLN',
            touched: false,
            repriced: false,
            saved: false,
          },
    ])
    setAddId('')
  }

  async function save() {
    if (rows.length === 0) {
      setError('Umowa musi zawierać co najmniej jeden lokal.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/units`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          units: rows.map((r) => ({ unitId: r.unitId, priceGross: finalGrossOf(r) })),
          expectedUpdatedAt: contractUpdatedAt,
        }),
      })
      if (!res.ok) {
        // Wygasła sesja (8h): komunikat ratujący zmiany, formularz zostaje otwarty.
        if (isSessionExpired(res)) {
          setError(SESSION_EXPIRED_HINT)
          return
        }
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Nie udało się zapisać składników')
      }
      setEditing(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const totalBase = units.reduce((s, u) => s + u.basePriceGross, 0)
  const totalSnapshot = units.reduce((s, u) => s + u.priceGross, 0)
  const totalNet = units.reduce((s, u) => s + u.priceNet, 0)
  // Ze znakiem: dodatnia = rabat łącznie, ujemna = dopłata łącznie.
  const totalDiscount = round2(
    units.reduce((s, u) => s + priceDeltaVsCennik(u.basePriceGross, u.priceGross, [u.basePriceGross, u.legacyPriceGross]), 0),
  )
  const changeVsSavedTotal = round2(totalGross - totalSnapshot)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Składniki umowy</h2>
        {canEdit &&
          (!editing ? (
            <button onClick={startEdit} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Edytuj składniki
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} disabled={busy} className="text-sm text-gray-600 hover:text-gray-800">
                Anuluj
              </button>
              <button
                onClick={save}
                disabled={busy || rows.length === 0}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1.5"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Zapisz
              </button>
            </div>
          ))}
      </div>

      {!editing ? (
        units.length === 0 ? (
          <p className="text-gray-400 text-sm">Brak lokali</p>
        ) : (
          <div className="space-y-2">
            {units.map((u) => {
              const discountGross = priceDeltaVsCennik(u.basePriceGross, u.priceGross, [u.basePriceGross, u.legacyPriceGross])
              const discounted = discountGross > 0.004
              const surcharged = discountGross < -0.004
              const discountPct = u.basePriceGross > 0 ? (Math.abs(discountGross) / u.basePriceGross) * 100 : 0
              // Dryf starego wzoru pokazujemy tylko na umowie edytowalnej — podpisana cena jest ceną.
              const drift = canEdit ? legacyDrift(u.basePriceGross, u.priceGross, u.legacyPriceGross) : 0
              return (
                <div key={u.unitId} className="rounded-lg bg-blue-50/50 border border-gray-200 p-2.5">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <div className="flex items-center gap-2.5 sm:items-start flex-1 min-w-0">
                      <UnitTypeBadge type={u.type} />
                      <div className="min-w-0">
                        <Link
                          href={`/units/${u.unitId}`}
                          className="text-sm font-semibold text-gray-900 hover:text-blue-600 break-words"
                        >
                          {u.number}
                        </Link>
                        <p className="text-xs text-gray-500">{UNIT_TYPE_LABELS[u.type as UnitType] ?? u.type}</p>
                      </div>
                    </div>
                    <dl className="sm:w-72 space-y-0.5 text-xs">
                      <Detail label="Budynek">{u.building || '—'}</Detail>
                      {u.floor != null && <Detail label="Piętro">{u.floor === 0 ? 'parter' : u.floor}</Detail>}
                      <Detail label="Powierzchnia umowna">{formatArea(u.area)}</Detail>
                      {(discounted || surcharged) && (
                        <Detail label="Cena cennikowa">
                          <span className="text-gray-400 line-through font-normal">{formatCurrency(u.basePriceGross)}</span>
                        </Detail>
                      )}
                      <Detail label={surcharged ? 'Dopłata' : 'Rabat'}>{discounted || surcharged ? formatPct(discountPct) : '—'}</Detail>
                      <Detail label={surcharged ? 'Dopłata brutto' : 'Rabat brutto'}>
                        {discounted ? formatCurrency(discountGross) : surcharged ? `+${formatCurrency(-discountGross)}` : '—'}
                      </Detail>
                      <Detail label="Cena netto">{formatCurrency(u.priceNet)}</Detail>
                      <Detail label="Cena brutto">
                        <span className="font-semibold">{formatCurrency(u.priceGross)}</span>
                      </Detail>
                      {drift !== 0 && (
                        <div className="text-[11px] text-gray-400 text-right">
                          cena wg starego wzoru, {formatCurrency(Math.abs(drift))} {drift > 0 ? 'poniżej' : 'powyżej'} cennika — to nie rabat
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              )
            })}
            {totalDiscount > 0.004 && (
              <div className="flex justify-between items-center pt-1 text-xs text-gray-500">
                <span>Rabat łącznie</span>
                <span>−{formatCurrency(totalDiscount)}</span>
              </div>
            )}
            {totalDiscount < -0.004 && (
              <div className="flex justify-between items-center pt-1 text-xs text-gray-500">
                <span>Dopłata łącznie</span>
                <span>+{formatCurrency(-totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 text-xs text-gray-500 border-t border-gray-100">
              <span>Razem netto</span>
              <span className="tabular-nums">{formatCurrency(totalNet)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Razem brutto</span>
              <span className="font-semibold text-gray-900">{formatCurrency(totalSnapshot)}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Opłata rezerwacyjna (1%)</span>
              <span>{formatCurrency(storedFee ?? round2(totalSnapshot * 0.01))}</span>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const final = finalGrossOf(r)
            // Nietknięty wiersz pokazuje rabat bez dryfu cennika; po edycji — dokładną różnicę.
            const rowDiscount = rowDiscountOf(r)
            const drift = rowDriftOf(r)
            const changeVsSaved = round2(final - r.snapshotPriceGross)
            return (
              <div key={r.unitId} className="rounded-lg bg-blue-50/50 border border-gray-200 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UnitTypeBadge type={r.type} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 break-words">{r.number}</p>
                      <p className="text-xs text-gray-500">
                        {UNIT_TYPE_LABELS[r.type as UnitType] ?? r.type}
                        {r.building ? ` · bud. ${r.building}` : ''} · {formatArea(r.area)} · cennik{' '}
                        {formatCurrency(r.basePriceGross)}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => removeRow(r.unitId)} className="text-gray-400 hover:text-red-600 flex-shrink-0" title="Usuń składnik">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-2 mt-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Rabat</span>
                    <input
                      type="number"
                      step="0.01"
                      value={r.discountValue}
                      onChange={(e) => setDiscount(r.unitId, e.target.value)}
                      placeholder="0"
                      title={`Rabat liczony od cennika (${formatCurrency(r.basePriceGross)}). Wartość ujemna, np. -2, to dopłata ponad cennik. 0, usunięcie rabatu lub „Wyrównaj do cennika” = cena cennikowa; lokal bez rabatu z pustym polem zachowuje zapisaną cenę.`}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
                      {(['PLN', 'PCT'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => toggleMode(r.unitId, m)}
                          className={`px-2 py-1 ${r.discountMode === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                          {m === 'PLN' ? 'zł' : '%'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(final)}</span>
                    {rowDiscount > 0.004 && (
                      <p className="text-[11px] text-gray-400">rabat −{formatCurrency(rowDiscount)}</p>
                    )}
                    {rowDiscount < -0.004 && (
                      <p className="text-[11px] text-amber-700">dopłata +{formatCurrency(-rowDiscount)}</p>
                    )}
                    {!r.touched && drift !== 0 && (
                      <p className="text-[11px] text-gray-400">
                        cena wg starego wzoru: {formatCurrency(Math.abs(drift))} {drift > 0 ? 'poniżej' : 'powyżej'} cennika ·{' '}
                        <button
                          type="button"
                          onClick={() => alignToCennik(r.unitId)}
                          className="text-blue-600 hover:underline"
                          title={`Ustawia cenę na bieżący cennik (${formatCurrency(r.basePriceGross)}); rabat liczy się od cennika. Zapisze się dopiero po „Zapisz”.`}
                        >
                          Wyrównaj do cennika
                        </button>
                      </p>
                    )}
                    {r.touched && r.saved && Math.abs(changeVsSaved) >= 0.005 && (
                      <p className="text-[11px] text-gray-400">
                        {drift !== 0 && Math.abs(changeVsSaved - drift) < 0.005
                          ? `wyrównano do cennika ${formatSigned(drift)}`
                          : `wobec zapisanej ceny ${formatSigned(changeVsSaved)}${
                              drift !== 0 ? ` (w tym wyrównanie do cennika ${formatSigned(drift)})` : ''
                            }`}
                        {r.repriced && r.discountValue === '' && (
                          <>
                            {' · '}
                            <button type="button" onClick={() => undoAlign(r.unitId)} className="text-blue-600 hover:underline">
                              cofnij
                            </button>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {addable.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— dodaj lokal —</option>
                {addable.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.number} ({UNIT_TYPE_LABELS[u.type as UnitType] ?? u.type}) · {formatArea(u.area)} · {formatCurrency(u.priceGross)}
                  </option>
                ))}
              </select>
              <button
                onClick={addRow}
                disabled={!addId}
                className="px-2.5 py-1.5 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Dodaj
              </button>
            </div>
          )}

          {driftedUntouched.length > 0 && (
            <div className="flex justify-between items-center gap-3 pt-2 text-xs text-gray-500 border-t border-gray-100">
              <span>
                Ceny wg starego wzoru: {driftedUntouched.length} lok. ({driftSummary})
              </span>
              <button type="button" onClick={alignAllDrifted} className="text-blue-600 hover:underline whitespace-nowrap">
                Wyrównaj wszystkie do cennika
              </button>
            </div>
          )}
          {editTotalDiscount > 0.004 && (
            <div className="flex justify-between items-center pt-1 text-xs text-gray-500">
              <span>Rabat łącznie</span>
              <span>−{formatCurrency(editTotalDiscount)}</span>
            </div>
          )}
          {editTotalDiscount < -0.004 && (
            <div className="flex justify-between items-center pt-1 text-xs text-gray-500">
              <span>Dopłata łącznie</span>
              <span>+{formatCurrency(-editTotalDiscount)}</span>
            </div>
          )}
          {Math.abs(changeVsSavedTotal) >= 0.005 && (
            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Zmiana wobec zapisanej umowy</span>
              <span>{formatSigned(changeVsSavedTotal)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 text-sm border-t border-gray-100">
            <span className="text-gray-600">Razem brutto</span>
            <span className="font-semibold text-gray-900">{formatCurrency(totalGross)}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>Opłata rezerwacyjna (1%)</span>
            <span>{formatCurrency(reservationFee)}</span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
