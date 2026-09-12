import { NextRequest } from 'next/server'
import { audit } from '@/lib/audit-log'
import { DEFECT_ACTIONS, type DefectAction } from '@/lib/odbiory/constants'
import { HttpError, applyDefectAction, json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/odbiory/defects/[id]/action — akcja prowadzącego odbiór:
 * ODEBRANO | NIE_ODEBRANO | ANULUJ | SPORNA | PRZYWROC | POPRAWIONA (w imieniu wykonawcy).
 * Tylko zalogowany użytkownik może zamknąć usterkę; AI i wykonawca nigdy.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const action = String(body.action || '') as DefectAction
  if (!(DEFECT_ACTIONS as readonly string[]).includes(action)) return jsonError('Nieznana akcja')
  const note = body.note ? String(body.note).slice(0, 1000) : null
  try {
    const defect = await applyDefectAction(params.id, action, note, user)
    void audit({ userId: user.id, userEmail: user.email, action: 'UPDATE', entity: 'Defect', entityId: params.id, metadata: { action, note } })
    return json({ defect })
  } catch (e: any) {
    if (e instanceof HttpError) return jsonError(e.message, e.status)
    console.error('[odbiory] action', e)
    return jsonError('Nie udało się wykonać akcji', 500)
  }
}
