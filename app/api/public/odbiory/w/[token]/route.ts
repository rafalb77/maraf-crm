import { NextRequest } from 'next/server'
import { json, jsonError, resolveDispatchToken, toSnapshotDefect } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/odbiory/w/[token] — pakiet wykonawcy (bez logowania; gate = token).
 * Zwraca tylko usterki z pakietu, bez danych innych firm.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const dispatch = await resolveDispatchToken(params.token)
  if (!dispatch) return jsonError('Link jest nieprawidłowy albo wygasł', 404)
  const sheet = dispatch.inspection?.sheetId
    ? await (await import('@/lib/prisma')).prisma.planSheet.findUnique({
        where: { id: dispatch.inspection.sheetId },
        select: { id: true, name: true, imageUrl: true, width: true, height: true },
      })
    : null
  const items = dispatch.items
    .map((i) => toSnapshotDefect(i.defect))
    .sort((a, b) => a.seq - b.seq)
    .map((d) => ({
      ...d,
      // zdjęcia serwowane przez publiczną trasę tokenową (catch-all /uploads wymaga sesji)
      photos: d.photos.map((p) => ({ ...p, url: `/api/public/odbiory/w/${params.token}/photo/${p.id}` })),
    }))
  const dueDates = items.map((d) => d.dueAt).filter((d): d is string => !!d)
  return json({
    dispatch: {
      id: dispatch.id,
      status: dispatch.status,
      createdAt: dispatch.createdAt.toISOString(),
      sentAt: dispatch.sentAt ? dispatch.sentAt.toISOString() : null,
      submittedAt: dispatch.submittedAt ? dispatch.submittedAt.toISOString() : null,
      expiresAt: dispatch.tokenExpiresAt.toISOString(),
    },
    contractor: dispatch.subcontractor,
    investment: dispatch.investment,
    inspection: dispatch.inspection
      ? {
          number: dispatch.inspection.number,
          scopeName: dispatch.inspection.scopeName,
          inspectorName: dispatch.inspection.inspectorName,
          fixDueAt: dispatch.inspection.fixDueAt ? dispatch.inspection.fixDueAt.toISOString() : null,
        }
      : null,
    sheet,
    items,
    summary: {
      total: items.length,
      open: items.filter((d) => d.status === 'DO_POPRAWY').length,
      fixed: items.filter((d) => d.status === 'POPRAWIONA').length,
      accepted: items.filter((d) => d.status === 'ODEBRANA').length,
      disputed: items.filter((d) => d.status === 'SPORNA').length,
      urgent: items.filter((d) => d.priority === 'PILNY' && d.status === 'DO_POPRAWY').length,
      dueAt: dueDates.length ? dueDates.sort()[0] : dispatch.inspection?.fixDueAt?.toISOString() ?? null,
    },
  })
}
