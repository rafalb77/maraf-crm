import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH — rachunek wirtualny ING (OMRP) przypisany do LOKALU.
// Osobny endpoint (nie glowny PATCH lokalu, ktory jest pelnym updatem z
// formularza edycji) — edycja inline z karty lokalu i skryptow.
// Body: { escrowSubaccount: string | null } ('' / null = czyszczenie)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unit = await prisma.unit.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!unit) return NextResponse.json({ error: 'Lokal nie istnieje' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const raw = body.escrowSubaccount == null ? '' : String(body.escrowSubaccount).trim()
  if (raw.length > 64) return NextResponse.json({ error: 'Numer za długi (max 64 znaki)' }, { status: 400 })
  const alnum = raw.replace(/[^A-Za-z0-9]/g, '')
  if (raw && alnum.length < 6) {
    return NextResponse.json({ error: 'Numer za krótki — podaj pełny NRB/IBAN subrachunku.' }, { status: 400 })
  }

  const saved = await prisma.unit.update({
    where: { id: params.id },
    data: { escrowSubaccount: raw || null },
    select: { id: true, escrowSubaccount: true },
  })
  return NextResponse.json(saved)
}
