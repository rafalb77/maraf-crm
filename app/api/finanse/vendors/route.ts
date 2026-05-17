import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const vendors = await prisma.vendor.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { invoices: true } } },
  })
  return NextResponse.json(vendors)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Nazwa wymagana' }, { status: 400 })

  const category = String(body.category || 'DOSTAWCA')
  const validCategories = ['DOSTAWCA', 'BANK', 'LEASING', 'URZAD', 'PODWYKONAWCA', 'INNE']
  if (!validCategories.includes(category)) {
    return NextResponse.json({ error: 'Nieprawidlowa kategoria' }, { status: 400 })
  }

  const existing = await prisma.vendor.findUnique({ where: { name } })
  if (existing) return NextResponse.json({ error: 'Kontrahent o tej nazwie juz istnieje', vendor: existing }, { status: 409 })

  const created = await prisma.vendor.create({
    data: {
      name,
      category,
      shortCode: body.shortCode ? String(body.shortCode).trim() : null,
      nip: body.nip ? String(body.nip).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      isActive: body.isActive !== false,
    },
  })
  return NextResponse.json(created, { status: 201 })
}
