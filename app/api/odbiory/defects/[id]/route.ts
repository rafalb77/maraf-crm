import { NextRequest } from 'next/server'
import { audit } from '@/lib/audit-log'
import { HttpError, json, jsonError, loadDefect, requireUser, toSnapshotDefect, upsertDefect } from '@/lib/odbiory/server'
import type { DefectUpsertBody } from '@/lib/odbiory/types'

export const dynamic = 'force-dynamic'

/** GET /api/odbiory/defects/[id] */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  const d = await loadDefect(params.id)
  if (!d) return jsonError('Usterka nie istnieje', 404)
  return json(toSnapshotDefect(d))
}

/**
 * PUT /api/odbiory/defects/[id] — upsert po id (id nadaje klient, także offline).
 * Idempotentne: ponowienie tego samego zapisu nie tworzy duplikatu.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: DefectUpsertBody
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  if (!body || !body.inspectionId) return jsonError('Brak odbioru')
  try {
    const result = await upsertDefect(params.id, body, user)
    void audit({ userId: user.id, userEmail: user.email, action: 'UPDATE', entity: 'Defect', entityId: params.id })
    return json(result)
  } catch (e: any) {
    if (e instanceof HttpError) return jsonError(e.message, e.status)
    console.error('[odbiory] upsertDefect', e)
    return jsonError('Nie udało się zapisać usterki', 500)
  }
}
