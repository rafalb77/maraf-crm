import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'

export const runtime = 'nodejs'

// Subrachunki OMRP nabywców (Contract.escrowSubaccount).
// ING nadaje kazdemu nabywcy indywidualny numer subrachunku powierniczego —
// wypelniony daje PEWNE dopasowanie wplat z wyciagu (sygnal decydujacy
// w lib/bank-reconcile.ts), niezaleznie od tytulu przelewu.
//
// GET   → lista umow z harmonogramem (nabywca, nr, raty, subrachunek)
// PATCH → zapis subrachunku { contractId, escrowSubaccount|null }

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getActiveCompany() !== 'MARAF_DEVELOPMENT') {
    return NextResponse.json({ error: 'Rozliczenia powiernicze dostępne tylko dla Maraf Development.' }, { status: 400 })
  }

  // Wszystkie umowy (nie tylko z harmonogramem) — numer warto wpisac wczesniej.
  const contracts = await prisma.contract.findMany({
    orderBy: { number: 'asc' },
    select: {
      id: true,
      number: true,
      investmentName: true,
      escrowSubaccount: true,
      client: { select: { firstName: true, lastName: true } },
      contractClients: { select: { client: { select: { firstName: true, lastName: true } } } },
      contractUnits: { select: { unit: { select: { number: true, escrowSubaccount: true } } } },
      payments: { select: { status: true, toEscrow: true } },
    },
  })

  return NextResponse.json(
    contracts.map((c) => {
      const buyers = [c.client, ...c.contractClients.map((cc) => cc.client)]
        .filter(Boolean)
        .map((cl) => `${cl!.firstName} ${cl!.lastName}`.trim())
      const units = c.contractUnits.map((cu) => cu.unit).filter(Boolean) as { number: string; escrowSubaccount: string | null }[]
      return {
        contractId: c.id,
        number: c.number,
        investmentName: c.investmentName,
        buyers: Array.from(new Set(buyers)),
        // Reczny numer na umowie (nadpisanie) — edytowalny w zakladce.
        escrowSubaccount: c.escrowSubaccount,
        // Numery dziedziczone z lokali umowy (rachunki wirtualne ING per lokal,
        // edycja na karcie lokalu / skryptem) — dopasowanie widzi jedne i drugie.
        unitNumbers: units.map((u) => u.number),
        unitSubaccounts: units.map((u) => u.escrowSubaccount).filter(Boolean) as string[],
        paymentsTotal: c.payments.length,
        paymentsPaid: c.payments.filter((p) => p.status === 'OPLACONA').length,
      }
    })
  )
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getActiveCompany() !== 'MARAF_DEVELOPMENT') {
    return NextResponse.json({ error: 'Rozliczenia powiernicze dostępne tylko dla Maraf Development.' }, { status: 400 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const contractId = String(body.contractId || '')
  if (!contractId) return NextResponse.json({ error: 'contractId wymagane' }, { status: 400 })
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true } })
  if (!contract) return NextResponse.json({ error: 'Umowa nie istnieje' }, { status: 404 })

  // Format dowolny (NRB/IBAN, ze spacjami lub bez) — dopasowanie i tak porownuje
  // po znakach alfanumerycznych (normRef). Pusty string = czyszczenie.
  const raw = body.escrowSubaccount == null ? '' : String(body.escrowSubaccount).trim()
  if (raw.length > 64) return NextResponse.json({ error: 'Numer za długi (max 64 znaki)' }, { status: 400 })
  const digits = raw.replace(/[^A-Za-z0-9]/g, '')
  if (raw && digits.length < 6) {
    return NextResponse.json({ error: 'Numer za krótki — podaj co najmniej 6 znaków (pełny NRB/IBAN subrachunku).' }, { status: 400 })
  }

  const saved = await prisma.contract.update({
    where: { id: contractId },
    data: { escrowSubaccount: raw || null },
    select: { id: true, escrowSubaccount: true },
  })
  return NextResponse.json(saved)
}
