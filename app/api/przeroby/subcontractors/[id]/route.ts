import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Sprawdź powiązania zanim usuniemy
  const sub = await prisma.subcontractor.findUnique({
    where: { id },
    include: {
      _count: { select: { protocols: true, contracts: true } },
    },
  })
  if (!sub) return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 })

  if (sub._count.protocols > 0) {
    return NextResponse.json(
      {
        error:
          `Nie można usunąć — podwykonawca ma ${sub._count.protocols} ${sub._count.protocols === 1 ? 'protokół' : 'protokołów'}. ` +
          `Najpierw anuluj/usuń protokoły lub dezaktywuj podwykonawcę.`,
      },
      { status: 409 },
    )
  }

  await prisma.subcontractor.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const data: any = {}
  for (const k of ['name', 'nip', 'regon', 'address', 'city', 'zipCode', 'contactName', 'email', 'phone', 'bankAccount', 'notes']) {
    if (k in body) data[k] = body[k] || null
  }
  if ('active' in body) data.active = !!body.active

  const updated = await prisma.subcontractor.update({ where: { id }, data })
  return NextResponse.json(updated)
}
