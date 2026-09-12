import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { json, jsonError, resolveDispatchToken, saveDefectPhoto, toSnapshotDefect, validatePhoto } from '@/lib/odbiory/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/public/odbiory/w/[token]/items/[defectId] — wykonawca zgłasza pozycję.
 * FormData: action = POPRAWIONA (domyślnie) | SPORNA, note?, file? (zdjęcie „po").
 * Wykonawca NIGDY nie zamyka usterki — tylko oznacza „gotowe do ponownego odbioru".
 */
export async function POST(req: NextRequest, { params }: { params: { token: string; defectId: string } }) {
  const dispatch = await resolveDispatchToken(params.token)
  if (!dispatch) return jsonError('Link jest nieprawidłowy albo wygasł', 404)
  const item = dispatch.items.find((i) => i.defect.id === params.defectId)
  if (!item) return jsonError('Ta usterka nie należy do Twojego pakietu', 404)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const action = String(form.get('action') || 'POPRAWIONA')
  const note = form.get('note') ? String(form.get('note')).slice(0, 1000) : null
  const file = form.get('file')
  const actorName = dispatch.subcontractor.contactName ? `${dispatch.subcontractor.name} (${dispatch.subcontractor.contactName})` : dispatch.subcontractor.name

  const defect = item.defect
  if (file instanceof File && file.size > 0) {
    const err = validatePhoto(file)
    if (err) return jsonError(err)
    await saveDefectPhoto({
      defectId: defect.id,
      inspectionId: defect.inspectionId,
      file,
      phase: 'PO',
      photoId: form.get('photoId') ? String(form.get('photoId')) : null,
      byContractor: true,
      actorName,
    })
  }

  if (action === 'SPORNA') {
    if (!note) return jsonError('Napisz, dlaczego pozycja jest sporna')
    if (defect.status === 'DO_POPRAWY' || defect.status === 'POPRAWIONA') {
      await prisma.defect.update({ where: { id: defect.id }, data: { status: 'SPORNA', disputeNote: note } })
      await prisma.defectEvent.create({ data: { defectId: defect.id, event: 'SPORNA', details: note, actorType: 'CONTRACTOR', actorName } })
    }
  } else if (action === 'POPRAWIONA') {
    if (defect.status === 'DO_POPRAWY' || defect.status === 'SPORNA') {
      await prisma.defect.update({
        where: { id: defect.id },
        data: { status: 'POPRAWIONA', fixReportedAt: new Date(), fixNote: note },
      })
      await prisma.defectEvent.create({ data: { defectId: defect.id, event: 'POPRAWIONA', details: note, actorType: 'CONTRACTOR', actorName } })
    } else if (note) {
      await prisma.defectEvent.create({ data: { defectId: defect.id, event: 'KOMENTARZ', details: note, actorType: 'CONTRACTOR', actorName } })
    }
  } else if (action === 'KOMENTARZ') {
    if (note) await prisma.defectEvent.create({ data: { defectId: defect.id, event: 'KOMENTARZ', details: note, actorType: 'CONTRACTOR', actorName } })
  } else {
    return jsonError('Nieznana akcja')
  }

  const fresh = await prisma.defect.findUnique({ where: { id: defect.id }, include: { photos: { orderBy: { createdAt: 'asc' } } } })
  if (!fresh) return jsonError('Usterka nie istnieje', 404)
  const snap = toSnapshotDefect(fresh)
  return json({ ...snap, photos: snap.photos.map((p) => ({ ...p, url: `/api/public/odbiory/w/${params.token}/photo/${p.id}` })) })
}
