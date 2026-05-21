import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/finanse/invoices/[id]/notes
// Edycja komentarza (notes) — DZIAŁA NA KAŻDYM STATUSIE (też OPLACONA).
// Osobny od PATCH /invoices/[id] ktory blokuje edycje pol kwotowych po zatwierdzeniu.
// Body: { notes: string | null }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const notes = body.notes === null || body.notes === undefined || String(body.notes).trim() === ''
    ? null
    : String(body.notes).trim()

  const inv = await prisma.purchaseInvoice.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })

  await prisma.purchaseInvoice.update({ where: { id: params.id }, data: { notes } })
  return NextResponse.json({ ok: true, notes })
}
