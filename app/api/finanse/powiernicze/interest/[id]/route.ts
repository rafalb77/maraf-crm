import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH — zmiana statusu naliczenia odsetek (np. umorzenie decyzją zarządu).
// body: { status: 'NALICZONE' | 'UMORZONE' | 'ZAPLACONE', note?: string }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 })
  }
  const status = String(body.status || '')
  if (!['NALICZONE', 'UMORZONE', 'ZAPLACONE'].includes(status)) {
    return NextResponse.json({ error: 'Nieprawidłowy status' }, { status: 400 })
  }
  await prisma.paymentInterest.update({
    where: { id: params.id },
    data: { status, ...(body.note !== undefined ? { note: String(body.note).trim() || null } : {}) },
  })
  return NextResponse.json({ ok: true })
}
