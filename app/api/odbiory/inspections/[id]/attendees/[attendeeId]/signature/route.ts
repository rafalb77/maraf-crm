import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'
import { json, jsonError, requireUser } from '@/lib/odbiory/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 600 * 1024 // PNG podpisu ~20–100 KB

/**
 * POST /api/odbiory/inspections/[id]/attendees/[attendeeId]/signature — podpis złożony
 * palcem/rysikiem na tablecie: body { dataUrl: "data:image/png;base64,…" }.
 * Zapis: public/uploads/odbiory/<inspectionId>/sig-<attendeeId>-<ts>.png + signedAt;
 * ślad dowodowy w AuditLog (kto był zalogowany, IP, user-agent, czas).
 * DELETE — usuwa podpis (tylko gdy odbiór W_TOKU), np. gdy podpisała się zła osoba.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; attendeeId: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const dataUrl = String(body.dataUrl || '')
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return jsonError('Brak podpisu (oczekiwano PNG)')
  const buffer = Buffer.from(m[1], 'base64')
  if (buffer.length < 200) return jsonError('Podpis jest pusty')
  if (buffer.length > MAX_BYTES) return jsonError('Podpis jest za duży')
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return jsonError('Nieprawidłowy obraz podpisu')

  const attendee = await prisma.inspectionAttendee.findUnique({
    where: { id: params.attendeeId },
    include: { inspection: { select: { id: true, status: true, number: true } } },
  })
  if (!attendee || attendee.inspectionId !== params.id) return jsonError('Osoba nie istnieje w tym odbiorze', 404)
  if (!attendee.present) return jsonError('Osoba oznaczona jako nieobecna nie może podpisać')

  const dir = path.join(process.cwd(), 'public', 'uploads', 'odbiory', attendee.inspectionId)
  await fs.mkdir(dir, { recursive: true })
  const filename = `sig-${attendee.id}-${Date.now()}.png`
  await fs.writeFile(path.join(dir, filename), buffer)
  // poprzedni plik podpisu (ponowne podpisanie) — best-effort
  if (attendee.signatureUrl) {
    try {
      const prev = path.resolve(process.cwd(), 'public', attendee.signatureUrl.replace(/^\//, ''))
      if (prev.startsWith(dir)) await fs.rm(prev, { force: true })
    } catch {}
  }
  const now = new Date()
  const updated = await prisma.inspectionAttendee.update({
    where: { id: attendee.id },
    data: { signatureUrl: `/uploads/odbiory/${attendee.inspectionId}/${filename}`, signedAt: now },
  })
  const meta = extractRequestMeta(req)
  void audit({
    userId: user.id,
    userEmail: user.email,
    action: 'UPDATE',
    entity: 'InspectionAttendee',
    entityId: attendee.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { signature: 'SIGNED', inspection: attendee.inspection.number, name: attendee.name, role: attendee.role, bytes: buffer.length, signedAt: now.toISOString() },
  })
  return json({ id: updated.id, signatureUrl: updated.signatureUrl, signedAt: updated.signedAt?.toISOString() ?? null })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; attendeeId: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  const attendee = await prisma.inspectionAttendee.findUnique({
    where: { id: params.attendeeId },
    include: { inspection: { select: { id: true, status: true, number: true } } },
  })
  if (!attendee || attendee.inspectionId !== params.id) return jsonError('Osoba nie istnieje w tym odbiorze', 404)
  if (attendee.inspection.status !== 'W_TOKU') return jsonError('Odbiór zakończony — podpisów nie można usuwać (wznów odbiór w zakładce Protokół)')
  if (attendee.signatureUrl) {
    try {
      const dir = path.join(process.cwd(), 'public', 'uploads', 'odbiory', attendee.inspectionId)
      const prev = path.resolve(process.cwd(), 'public', attendee.signatureUrl.replace(/^\//, ''))
      if (prev.startsWith(dir)) await fs.rm(prev, { force: true })
    } catch {}
  }
  await prisma.inspectionAttendee.update({ where: { id: attendee.id }, data: { signatureUrl: null, signedAt: null } })
  const meta = extractRequestMeta(req)
  void audit({ userId: user.id, userEmail: user.email, action: 'UPDATE', entity: 'InspectionAttendee', entityId: attendee.id, ip: meta.ip, userAgent: meta.userAgent, metadata: { signature: 'REMOVED', inspection: attendee.inspection.number, name: attendee.name } })
  return json({ id: attendee.id, signatureUrl: null, signedAt: null })
}
