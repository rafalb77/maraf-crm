import { NextRequest } from 'next/server'
import { buildSnapshot, json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/** GET /api/odbiory/inspections/[id]/snapshot — pełny pakiet widoku terenowego (cache offline). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  const snapshot = await buildSnapshot(params.id, user)
  if (!snapshot) return jsonError('Odbiór nie istnieje albo nie ma arkusza rzutu', 404)
  return json(snapshot)
}
