import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID = ['SZKIC', 'WYSLANA', 'ZAAKCEPTOWANA', 'ODRZUCONA', 'ANULOWANA']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status } = await req.json()
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: 'Nieprawidłowy status' }, { status: 400 })
  }
  const updated = await prisma.offer.update({ where: { id }, data: { status } })
  return NextResponse.json(updated)
}
