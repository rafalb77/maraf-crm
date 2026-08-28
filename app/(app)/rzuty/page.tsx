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

  const units = await prisma.unit.findMany({
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
  })

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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Rzuty pięter</h1>
        <p className="text-gray-500 text-sm mt-1">
          Nova Staffa — Etap 1 · statusy lokali na żywo z bazy, kliknięcie znacznika otwiera kartę lokalu
        </p>
      </div>
      <FloorPlanViewerLazy floors={markersData.floors} units={unitsByNumber} alerts={alerts} />
    </div>
  )
}
