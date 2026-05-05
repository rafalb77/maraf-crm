import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'Nazwa firmy wymagana' }, { status: 400 })
  }

  const sub = await prisma.subcontractor.create({
    data: {
      name: body.name.trim(),
      nip: body.nip || null,
      regon: body.regon || null,
      address: body.address || null,
      city: body.city || null,
      zipCode: body.zipCode || null,
      contactName: body.contactName || null,
      email: body.email || null,
      phone: body.phone || null,
      bankAccount: body.bankAccount || null,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(sub)
}
