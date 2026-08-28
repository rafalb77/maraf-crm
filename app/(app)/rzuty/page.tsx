import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { computeOrphanStorageAlerts, orphanAlertText } from '@/lib/floorplan'
import type { FloorData, FloorUnitInfo, FloorAlert } from '@/components/rzuty/FloorPlanViewer'
import { FloorPlanViewerLazy } from '@/components/rzuty/FloorPlanViewerLazy'

// Interaktywne rzuty kondygnacji: znaczniki statusów lokali naniesione
// automatycznie z warstwy tekstowej PDF-ów marketingowych (public/rzuty/,
// pipeline: scripts/extract-floorplan-markers.mjs → markers.json).
export default async function RzutyPage() {
  const markersRaw = fs.readFileSync(path.join(process.cwd(), 'public', 'rzuty', 'markers.json'), 'utf8')
  const markersData = JSON.parse(markersRaw) as { floors: Record<string, FloorData> }

  const [units, activeContracts, allAssignments] = await Promise.all([
    prisma.unit.findMany({
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        floor: true,
        building: true,
        priceGross: true,
        clientUnits: { include: { client: { select: { firstName: true, lastName: true } } }, take: 1 },
      },
    }),
    // Powiązania „kupione razem": składniki tej samej aktywnej umowy.
    prisma.contract.findMany({
      where: { status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] } },
      select: { contractUnits: { select: { unit: { select: { number: true } } } } },
    }),
    // Oraz lokale przypisane temu samemu klientowi (rezerwacje przed umową).
    prisma.clientUnit.findMany({ select: { clientId: true, unit: { select: { number: true } } } }),
  ])

  // links[nr] = numery lokali kupowanych/rezerwowanych razem z nim (pakiet
  // klienta: mieszkanie + komórka + miejsce postojowe/garażowe).
  const links: Record<string, string[]> = {}
  const linkGroup = (numbers: string[]) => {
    const uniq = [...new Set(numbers)]
    if (uniq.length < 2) return
    for (const a of uniq) {
      links[a] = links[a] || []
      for (const b of uniq) if (b !== a && !links[a].includes(b)) links[a].push(b)
    }
  }
  for (const c of activeContracts) linkGroup(c.contractUnits.map((cu) => cu.unit.number))
  const byClient = new Map<string, string[]>()
  for (const cu of allAssignments) {
    const arr = byClient.get(cu.clientId) || []
    arr.push(cu.unit.number)
    byClient.set(cu.clientId, arr)
  }
  for (const nums of byClient.values()) linkGroup(nums)

  const unitsByNumber: Record<string, FloorUnitInfo> = {}
  for (const u of units) {
    const client = u.clientUnits[0]?.client
    unitsByNumber[u.number] = {
      id: u.id,
      number: u.number,
      type: u.type,
      status: u.status,
      priceGross: u.priceGross,
      clientName: client ? `${client.firstName} ${client.lastName}` : null,
    }
  }

  const alerts: FloorAlert[] = computeOrphanStorageAlerts(units).map((a) => ({
    severity: a.severity,
    floor: a.floor,
    text: orphanAlertText(a),
  }))

  // Ręcznie obrysowane kontury mieszkań (edytor na /rzuty, Settings
  // 'rzuty.shapes') — nadpisują przybliżoną obwiednię z etykiet.
  const shapesRow = await prisma.settings.findUnique({ where: { key: 'rzuty.shapes' } })
  if (shapesRow) {
    try {
      const shapes = JSON.parse(shapesRow.value) as Record<string, Record<string, [number, number][]>>
      for (const [floorKey, floorShapes] of Object.entries(shapes)) {
        const floor = markersData.floors[floorKey]
        if (!floor) continue
        for (const m of floor.markers) {
          const pts = floorShapes[m.number]
          if (pts && pts.length >= 3) m.poly = pts
        }
      }
    } catch {}
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Rzuty pięter</h1>
        <p className="text-gray-500 text-sm mt-1">
          Nova Staffa — Etap 1 · statusy lokali na żywo z bazy, kliknięcie znacznika otwiera kartę lokalu
        </p>
      </div>
      <FloorPlanViewerLazy floors={markersData.floors} units={unitsByNumber} alerts={alerts} links={links} />
    </div>
  )
}
