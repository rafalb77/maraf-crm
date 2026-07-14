import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'
import { reconcileStatement, applyMatch } from '@/lib/bank-reconcile'

export const runtime = 'nodejs'

// POST — ponowne dopasowanie wpłat do harmonogramu.
// body: { statementId?: string, autoApply?: boolean }
//   - statementId podany → tylko ten wyciąg; brak → wszystkie wyciągi firmy
//   - autoApply=true → od razu księguje pozycje MATCHED (rata OPLACONA + deposit + odsetki)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = getActiveCompany()

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* body opcjonalne */
  }
  const statementId = body.statementId ? String(body.statementId) : null
  const autoApply = body.autoApply === true

  const statements = statementId
    ? await prisma.bankStatement.findMany({ where: { id: statementId, company }, select: { id: true } })
    : await prisma.bankStatement.findMany({ where: { company }, select: { id: true } })

  const agg = { matched: 0, suggested: 0, unmatched: 0, credits: 0 }
  for (const s of statements) {
    const r = await reconcileStatement(s.id)
    agg.matched += r.matched
    agg.suggested += r.suggested
    agg.unmatched += r.unmatched
    agg.credits += r.credits
    await prisma.bankStatement.update({ where: { id: s.id }, data: { matchedCount: r.matched } })
  }

  let applied = 0
  let interestTotal = 0
  const applyErrors: string[] = []
  if (autoApply) {
    const toApply = await prisma.bankTransaction.findMany({
      where: {
        statement: statementId ? { id: statementId } : { company },
        matchStatus: 'MATCHED',
        contractPaymentId: { not: null },
        escrowDeposit: null,
      },
      select: { id: true, contractPaymentId: true },
    })
    for (const t of toApply) {
      const res = await applyMatch(t.id, t.contractPaymentId!)
      if (res.ok) {
        applied++
        interestTotal += res.interest
      } else {
        applyErrors.push(res.error)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    statements: statements.length,
    ...agg,
    applied,
    interestTotal: Math.round(interestTotal * 100) / 100,
    applyErrors: applyErrors.slice(0, 10),
  })
}
