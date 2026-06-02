import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/finanse/vendors/[id]
// Edycja kontrahenta — głównie defaultDepositPct + defaultBuildingCostsPct
// (prefilują pola faktury przy tworzeniu).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.vendor.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Kontrahent nie istnieje' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
    if (!isFinite(n) || n < 0 || n > 100) return null
    return n
  }

  const data: any = {}
  if (body.name !== undefined) data.name = String(body.name).trim()
  if (body.shortCode !== undefined) data.shortCode = body.shortCode ? String(body.shortCode).trim() : null
  if (body.nip !== undefined) data.nip = body.nip ? String(body.nip).trim() : null
  if (body.category !== undefined) data.category = String(body.category)
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null
  if (body.isActive !== undefined) data.isActive = body.isActive === true
  if (body.defaultDepositPct !== undefined) data.defaultDepositPct = body.defaultDepositPct === null || body.defaultDepositPct === '' ? null : num(body.defaultDepositPct)
  if (body.defaultBuildingCostsPct !== undefined) data.defaultBuildingCostsPct = body.defaultBuildingCostsPct === null || body.defaultBuildingCostsPct === '' ? null : num(body.defaultBuildingCostsPct)

  await prisma.vendor.update({ where: { id: params.id }, data })
  return NextResponse.json({ ok: true })
}
