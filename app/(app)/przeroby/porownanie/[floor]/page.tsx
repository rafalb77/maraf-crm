import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin, isContractor } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { ComparisonTable } from '@/components/przeroby/ComparisonTable'
import { ProtocolGenerator } from '@/components/przeroby/ProtocolGenerator'

const FLOOR_LABELS: Record<string, string> = {
  PARTER: 'Parter',
  I_PIETRO: 'I piętro',
  II_PIETRO: 'II piętro',
  III_PIETRO: 'III piętro',
  IV_PIETRO: 'IV piętro',
  DACH: 'Dach',
  FUNDAMENTY: 'Fundamenty',
}

export default async function PorownaniaPage({
  params,
}: {
  params: Promise<{ floor: string }>
}) {
  const { floor } = await params
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email
  const userIsAdmin = isAdmin(userEmail)
  const userIsContractor = isContractor(userEmail)
  // Wartość Konrada edytuje Konrad (contractor) lub admin. Maraf-inżynier (zwykły
  // user) edytuje tylko manualValue (Maraf override) — bez zmian względem stanu
  // sprzed dodania pola Konrada.
  const canEditKonrad = userIsAdmin || userIsContractor

  const summary = await prisma.floorSummary.findFirst({
    where: { floor },
    include: {
      scope: true,
      items: {
        orderBy: { position: 'asc' },
        include: {
          history: {
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  })
  if (!summary) notFound()

  // Wszystkie pozycje obmiaru z tego zakresu
  const workItems = await prisma.workItem.findMany({
    where: { category: { scopeId: summary.scope.id } },
    include: { category: true },
  })

  // Wszystkie pozycje wszystkich protokołów (do liczenia postępu per pozycja kosztorysu)
  // Dopasowanie pozycja podsumowania → pozycja umowy → ProtocolItems po nazwie (case-insensitive)
  const allProtocolItems = await prisma.protocolItem.findMany({
    where: { protocol: { status: { not: 'ANULOWANY' } } },
    include: { contractWorkItem: true },
  })
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  // Mapa: normalizowana nazwa pozycji → suma qty / amountNet w protokołach
  const protocolByName: Record<string, { qty: number; amountNet: number; unitPrice: number }> = {}
  for (const pi of allProtocolItems) {
    const k = norm(pi.contractWorkItem.name)
    if (!protocolByName[k]) protocolByName[k] = { qty: 0, amountNet: 0, unitPrice: pi.unitPrice }
    protocolByName[k].qty += pi.qty
    protocolByName[k].amountNet += pi.amountNet
    if (!protocolByName[k].unitPrice) protocolByName[k].unitPrice = pi.unitPrice
  }

  // Dla każdej pozycji podsumowania policz wartość auto z reguły.
  // Maraf jest wyznacznikiem — liczymy autoValue dla KAŻDEJ pozycji z mappingRule,
  // niezależnie od matchMode. matchMode (AUTO_OK / MANUAL_NOT_FOUND / ...) opisuje
  // tylko stan po stronie Konrada (kierownika), nie obecność danych Marafa.
  const computed = summary.items.map((it) => {
    let autoValue: number | null = null
    let autoMatchedCount: number | null = null
    let autoBreakdown: { key: string; count: number; value: number }[] | null = null
    let aggMethod: string | null = null
    let autoUnit = it.unit
    if (it.mappingRule) {
      try {
        const rule = JSON.parse(it.mappingRule)
        aggMethod = rule.agg || null
        const matched = workItems.filter((wi) => matchRule(wi, rule))
        autoMatchedCount = matched.length
        // matched.length === 0 → reguła nie znalazła nic w obmiarze Marafa.
        // Zwracamy null (nie 0) żeby UI pokazał "—" + osobny komunikat,
        // zamiast wprowadzającego w błąd "0,00" jakby Maraf wynosił zero.
        autoValue = matched.length > 0 ? aggregate(matched, rule.agg) : null
        if (rule.agg === 'volumeSum') autoUnit = 'm³'
        else if (rule.agg === 'areaSum') autoUnit = 'm²'
        // Breakdown po elementType — dla pozycji typu "Belki nad I piętro" gdzie reguła
        // nie filtruje elementType i wpadają tam belki/wieńce/nadproża/wsporniki łącznie.
        if (matched.length > 0) {
          const groups = new Map<string, { count: number; value: number }>()
          for (const wi of matched) {
            const key = wi.elementType || '(bez rodzaju)'
            const v = rule.agg === 'volumeSum' ? (wi.volumeM3 || 0)
              : rule.agg === 'areaSum' ? (wi.areaM2 || 0)
              : rule.agg === 'heightCountSum' ? (wi.heightM || 0) * (wi.count || 1)
              : rule.agg === 'countSum' ? (wi.count || 0)
              : 0
            const cur = groups.get(key) || { count: 0, value: 0 }
            cur.count++
            cur.value += v
            groups.set(key, cur)
          }
          autoBreakdown = [...groups.entries()]
            .map(([key, v]) => ({ key, ...v }))
            .sort((a, b) => b.value - a.value)
        }
      } catch {
        autoValue = null
      }
    }
    // Postęp w protokołach: dopasowanie po nazwie pozycji
    const protoMatch = protocolByName[norm(it.name)]
    const protocolDoneQty = protoMatch?.qty || 0
    const protocolDoneAmount = protoMatch?.amountNet || 0
    // requiredQty bazuje WYŁĄCZNIE na laborQty (Robocizny z podsumowania kierownika).
    // manualValue dotyczy tylko porównania obmiar inżynierski ↔ kierownik
    // i nie ma wpływu na cel ilościowy do rozliczenia w protokole.
    const requiredQty = it.laborQty
    const protocolPct = requiredQty > 0 ? Math.min(100, (protocolDoneQty / requiredQty) * 100) : 0

    return {
      id: it.id,
      position: it.position,
      name: it.name,
      unit: it.unit,
      laborQty: it.laborQty,
      concreteVol: it.concreteVol,
      rebarMass: it.rebarMass,
      matchMode: it.matchMode,
      matchReason: it.matchReason,
      manualValue: it.manualValue,
      manualNote: it.manualNote,
      konradManualValue: it.konradManualValue,
      konradManualReason: it.konradManualReason,
      accepted: it.accepted,
      acceptedAt: it.acceptedAt,
      acceptedNote: it.acceptedNote,
      autoValue,
      autoUnit,
      autoMatchedCount,
      autoBreakdown,
      aggMethod,
      protocolDoneQty,
      protocolDoneAmount,
      protocolPct,
      history: it.history.map((h) => ({
        id: h.id,
        action: h.action,
        oldValue: h.oldValue,
        newValue: h.newValue,
        note: h.note,
        userEmail: h.userEmail,
        createdAt: h.createdAt.toISOString(),
      })),
    }
  })

  // KPI
  const totalAuto = computed.filter((c) => c.matchMode === 'AUTO_OK').length
  const totalManual = computed.length - totalAuto
  // Maraf jest wyznacznikiem — % różnicy liczymy względem wartości Maraf (autoValue/manualValue)
  const okMatches = computed.filter((c) => {
    if (c.accepted) return true
    if (c.matchMode !== 'AUTO_OK' || c.autoValue == null) return false
    const kierownik = referenceValue(c)
    if (kierownik == null) return false
    const maraf = c.autoValue
    if (maraf <= 0) return false
    return Math.abs((kierownik - maraf) / maraf) <= 0.05
  }).length
  const totalAccepted = computed.filter((c) => c.accepted).length
  const totalReady = computed.filter((c) => {
    if (c.accepted) return true
    if (c.manualValue != null) return true
    // Konrad wpisany ręcznie + (jeśli Δ > 5%) uzasadnienie → gotowa.
    if (c.konradManualValue != null) {
      const maraf = c.manualValue != null ? c.manualValue : c.autoValue
      if (maraf != null && maraf > 0) {
        const diffPct = Math.abs((c.konradManualValue - maraf) / maraf)
        if (diffPct <= 0.05) return true
        if (c.konradManualReason && c.konradManualReason.trim().length > 0) return true
      } else {
        return true
      }
    }
    if (c.matchMode === 'AUTO_OK' && c.autoValue != null) {
      const kierownik = referenceValue(c)
      const maraf = c.autoValue
      if (kierownik != null && maraf > 0) return Math.abs((kierownik - maraf) / maraf) <= 0.05
    }
    return false
  }).length

  return (
    <div className="p-8">
      <div className="mb-2 text-sm">
        <Link href="/przeroby/porownanie" className="text-gray-500 hover:text-gray-700">
          ← Porównania
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Porównanie obmiarów — {FLOOR_LABELS[summary.floor] || summary.floor}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {summary.scope.name} · obmiar Maraf vs podsumowanie kierownika
            {summary.source && <> · {summary.source}</>}
          </p>
        </div>
        <Link
          href={`/przeroby/obmiar/${summary.scope.slug}`}
          className="text-sm px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          title="Drilldown do pojedynczych elementów obmiaru (Łf-01, S-P.01...)"
        >
          🔍 Pokaż obmiar inżynierski
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Pozycji łącznie" value={String(computed.length)} />
        <Stat label="Auto-dopasowanie" value={`${totalAuto}/${computed.length}`} accent="blue" />
        <Stat label="Zaakceptowane różnice" value={String(totalAccepted)} accent="green" />
        <Stat label="Gotowe do protokołu" value={`${totalReady}/${computed.length}`} accent={totalReady === computed.length ? 'green' : 'amber'} />
      </div>

      <FloorProgress items={computed} />

      <ProtocolGenerator
        summaryId={summary.id}
        floor={summary.floor}
        scopeId={summary.scope.id}
        ready={totalReady}
        total={computed.length}
      />

      <ComparisonTable summaryId={summary.id} items={computed} canEditKonrad={canEditKonrad} canEditMaraf={!userIsContractor || userIsAdmin} />
    </div>
  )
}

function matchRule(wi: any, rule: any): boolean {
  if (rule.categoryName) {
    const want = Array.isArray(rule.categoryName) ? rule.categoryName : [rule.categoryName]
    if (!want.includes(wi.category.name)) return false
  }
  if (rule.elementType) {
    const want = Array.isArray(rule.elementType) ? rule.elementType : [rule.elementType]
    if (!want.includes(wi.elementType)) return false
  }
  if (rule.floor) {
    const want = Array.isArray(rule.floor) ? rule.floor : [rule.floor]
    if (!want.includes(wi.floor)) return false
  }
  if (rule.nameIncludes && !(wi.name || '').includes(rule.nameIncludes)) return false
  if (rule.nameExcludes && (wi.name || '').includes(rule.nameExcludes)) return false
  return true
}

function aggregate(items: any[], method: string): number {
  if (method === 'volumeSum') return items.reduce((s, it) => s + (it.volumeM3 || 0), 0)
  if (method === 'areaSum') return items.reduce((s, it) => s + (it.areaM2 || 0), 0)
  if (method === 'heightCountSum') return items.reduce((s, it) => s + (it.heightM || 0) * (it.count || 1), 0)
  if (method === 'countSum') return items.reduce((s, it) => s + (it.count || 0), 0)
  return 0
}

function referenceValue(c: any): number | null {
  // Konrad wpisany ręcznie ma pierwszeństwo nad wartością z xlsx (np. dla
  // pozycji MANUAL_NOT_FOUND gdzie xlsx Konrada nie ma detalu).
  if (c.konradManualValue != null) return c.konradManualValue
  // Wybór wartości z kierownika do porównania zależy od metody agregacji obmiaru:
  //   volumeSum (m³)  → porównujemy z concreteVol (objętość betonu kierownika)
  //   areaSum  (m²)   → porównujemy z laborQty (powierzchnia robocizny kierownika)
  //   inne            → laborQty
  if (c.aggMethod === 'volumeSum') return c.concreteVol || null
  if (c.aggMethod === 'areaSum') return c.laborQty || null
  // fallback po jednostce pozycji (gdy nie ma reguły / matchMode != AUTO_OK)
  if (c.unit === 'm3' || c.unit === 'm³') return c.concreteVol || c.laborQty
  return c.laborQty
}

function FloorProgress({ items }: { items: any[] }) {
  // Sumarycznie ile m³ betonu ma być rozliczone (z podsumowania) i ile już jest (z protokołów)
  // — używamy concreteVol jeśli jest, inaczej laborQty (dla pozycji m²/szt — i tak liczy się wartość)
  let totalDoneAmount = 0
  let totalAmountToReach = 0 // ile maks. wartości netto kondygnacji (z stawek protokołowych ostatnich)
  for (const it of items) {
    totalDoneAmount += it.protocolDoneAmount || 0
    // Plan = required qty × stawka (znalezioną z protokołu, jeśli była rozliczana)
    const reqQty = it.manualValue != null ? it.manualValue : it.laborQty
    const unitPrice =
      it.protocolDoneQty > 0 && it.protocolDoneAmount > 0
        ? it.protocolDoneAmount / it.protocolDoneQty
        : 0
    if (unitPrice > 0) totalAmountToReach += reqQty * unitPrice
  }
  const moneyPct = totalAmountToReach > 0 ? Math.min(100, (totalDoneAmount / totalAmountToReach) * 100) : 0

  // Pozycji rozliczonych w protokołach (≥99%) vs łącznie
  const fullyBilled = items.filter((it) => it.protocolPct >= 99).length
  const partlyBilled = items.filter((it) => it.protocolPct > 0 && it.protocolPct < 99).length

  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-gray-900 text-sm">Postęp rozliczenia tej kondygnacji</h2>
        <span className="text-sm font-medium text-gray-700 tabular-nums">
          {totalDoneAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
          {totalAmountToReach > 0 && (
            <span className="text-gray-400">
              {' '}/ {totalAmountToReach.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
            </span>
          )}
        </span>
      </div>
      <div className="bg-gray-200 rounded-full overflow-hidden h-3 mb-2">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${moneyPct}%`,
            backgroundColor: moneyPct >= 95 ? '#16a34a' : moneyPct >= 50 ? '#ca8a04' : '#2563eb',
          }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{moneyPct.toFixed(1)}% wartości</span>
        <span>
          ✓ {fullyBilled} ukończonych · ⏳ {partlyBilled} częściowych ·
          {' '}{items.length - fullyBilled - partlyBilled} nierozpoczętych
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'blue' | 'amber' | 'green' }) {
  const color = accent === 'blue' ? 'text-blue-700' : accent === 'amber' ? 'text-amber-700' : accent === 'green' ? 'text-green-700' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}
