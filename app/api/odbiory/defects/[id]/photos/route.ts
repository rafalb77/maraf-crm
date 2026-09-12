import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { json, jsonError, requireUser, saveDefectPhoto, validatePhoto } from '@/lib/odbiory/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/odbiory/defects/[id]/photos — JEDNO zdjęcie per request (FormData: file, phase, photoId?).
 * Jeden plik = jeden request z własnym ponowieniem (wzorzec check-inu budowy); photoId od
 * klienta daje idempotencję przy synchronizacji offline.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('Brak pliku')
  const err = validatePhoto(file)
  if (err) return jsonError(err)
  const phase = String(form.get('phase') || 'PRZED') === 'PO' ? 'PO' : 'PRZED'
  const photoId = form.get('photoId') ? String(form.get('photoId')) : null

  const defect = await prisma.defect.findUnique({ where: { id: params.id }, select: { id: true, inspectionId: true } })
  if (!defect) return jsonError('Usterka nie istnieje', 404)

  const photo = await saveDefectPhoto({
    defectId: defect.id,
    inspectionId: defect.inspectionId,
    file,
    phase,
    photoId,
    byUserId: user.id || null,
    actorName: user.name,
  })
  void audit({ userId: user.id, userEmail: user.email, action: 'CREATE', entity: 'DefectPhoto', entityId: photo.id })
  return json({ id: photo.id, url: photo.url, phase: photo.phase, createdAt: photo.createdAt.toISOString(), byContractor: photo.byContractor }, 201)
}
