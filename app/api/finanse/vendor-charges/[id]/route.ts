import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'

// PATCH — rozliczenie / cofniecie rozliczenia kary: { settled: boolean }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const charge = await prisma.vendorCharge.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!charge) return NextResponse.json({ error: 'Obciążenie nie istnieje' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const data: any = {}
  if (body.settled !== undefined) data.settledAt = body.settled === true ? new Date() : null
  if (body.title !== undefined && String(body.title).trim()) data.title = String(body.title).trim()
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null

  const saved = await prisma.vendorCharge.update({ where: { id: params.id }, data, select: { id: true, settledAt: true } })
  return NextResponse.json(saved)
}

// DELETE — usuniecie omylkowej kary (admin; korekty kwot przez usun+dodaj).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Tylko admin może usuwać obciążenia' }, { status: 403 })
  try {
    await prisma.vendorCharge.delete({ where: { id: params.id } })
  } catch {
    return NextResponse.json({ error: 'Obciążenie nie istnieje' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
