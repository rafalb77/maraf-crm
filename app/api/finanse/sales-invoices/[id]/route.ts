import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'

// PATCH — edycja faktury przychodowej (w tym konwersja zaliczki: isAdvance=false,
// kaucja/KB, notatka, status ANULOWANA).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inv = await prisma.salesInvoice.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const data: any = {}
  if (body.recipientName !== undefined) data.recipientName = String(body.recipientName).trim()
  if (body.recipientCompany !== undefined) data.recipientCompany = body.recipientCompany || null
  if (body.company !== undefined) data.company = String(body.company)
  if (body.number !== undefined) data.number = String(body.number).trim()
  if (body.issueDate !== undefined) data.issueDate = new Date(body.issueDate)
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.vatRate !== undefined) { let v = Number(body.vatRate); if (v > 1) v = v / 100; data.vatRate = v }
  if (body.amountNet !== undefined) data.amountNet = Number(body.amountNet)
  if (body.amountVat !== undefined) data.amountVat = Number(body.amountVat)
  if (body.amountGross !== undefined) data.amountGross = Number(body.amountGross)
  if (body.deposit !== undefined) data.deposit = isFinite(Number(body.deposit)) ? Number(body.deposit) : null
  if (body.buildingCosts !== undefined) data.buildingCosts = isFinite(Number(body.buildingCosts)) ? Number(body.buildingCosts) : null
  if (body.isAdvance !== undefined) data.isAdvance = body.isAdvance === true
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null
  if (body.status !== undefined) data.status = String(body.status)

  const updated = await prisma.salesInvoice.update({ where: { id: params.id }, data, select: { id: true } })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Tylko admin moze usuwac faktury' }, { status: 403 })
  const inv = await prisma.salesInvoice.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })
  await prisma.salesInvoice.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
