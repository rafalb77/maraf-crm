import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'
import { parseStatement } from '@/lib/bank-import'
import { decodeBankFile } from '@/lib/bank-import/decode'
import { commitStatement, fileHashOf, findEscrowAccountForIban } from '@/lib/bank-statement-import'
import { loadOpenPayments, matchTransaction } from '@/lib/bank-reconcile'

export const runtime = 'nodejs'

// GET — lista zaimportowanych wyciągów aktywnej firmy.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = getActiveCompany()

  const statements = await prisma.bankStatement.findMany({
    where: { company },
    orderBy: { createdAt: 'desc' },
    include: {
      escrowAccount: { select: { id: true, name: true } },
      importedBy: { select: { name: true, email: true } },
      _count: { select: { transactions: true } },
    },
  })

  return NextResponse.json(
    statements.map((s) => ({
      id: s.id,
      format: s.format,
      fileName: s.fileName,
      accountNumber: s.accountNumber,
      statementNumber: s.statementNumber,
      periodFrom: s.periodFrom?.toISOString() ?? null,
      periodTo: s.periodTo?.toISOString() ?? null,
      openingBalance: s.openingBalance,
      closingBalance: s.closingBalance,
      currency: s.currency,
      txCount: s._count.transactions,
      matchedCount: s.matchedCount,
      escrowAccount: s.escrowAccount,
      importedBy: s.importedBy?.name || s.importedBy?.email || null,
      createdAt: s.createdAt.toISOString(),
    }))
  )
}

// POST /api/finanse/powiernicze/statements?mode=preview|commit
// multipart/form-data: field `file` = wyciąg (MT940 / CSV / camt.053)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const company = getActiveCompany()

  if (company !== 'MARAF_DEVELOPMENT') {
    return NextResponse.json(
      { error: 'Rozliczenia powiernicze dostępne tylko dla Maraf Development. Przełącz firmę w nagłówku.' },
      { status: 400 }
    )
  }

  const mode = req.nextUrl.searchParams.get('mode') === 'commit' ? 'commit' : 'preview'

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy form-data' }, { status: 400 })
  }
  const file = formData.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Brak pliku w polu "file"' }, { status: 400 })
  }
  const fileName = (file as any).name || 'wyciag'
  const buffer = Buffer.from(await file.arrayBuffer())
  const forceFormat = (formData.get('format') as string) || undefined

  let text: string
  let parsed
  try {
    text = decodeBankFile(buffer)
    parsed = parseStatement(text, fileName, forceFormat as any)
  } catch (e: any) {
    return NextResponse.json({ error: 'Błąd parsowania pliku: ' + (e?.message || e) }, { status: 400 })
  }

  const hash = fileHashOf(buffer)

  if (mode === 'commit') {
    const result = await commitStatement(parsed, {
      fileName,
      fileHash: hash,
      company,
      importedById: session.user.id || null,
    })
    return NextResponse.json({ mode: 'commit', ...result })
  }

  // ---- preview ----
  const [already, matchedAccount, openPayments] = await Promise.all([
    prisma.bankStatement.findUnique({ where: { fileHash: hash }, select: { id: true } }),
    findEscrowAccountForIban(parsed.accountNumber, company),
    loadOpenPayments(),
  ])

  const credits = parsed.transactions.filter((t) => t.side === 'CREDIT')
  const debits = parsed.transactions.filter((t) => t.side === 'DEBIT')
  const creditSum = credits.reduce((s, t) => s + t.amount, 0)

  let matched = 0
  let suggested = 0
  let unmatched = 0
  const preview = parsed.transactions.slice(0, 200).map((t) => {
    let matchStatus: string | null = null
    let matchReason: string | null = null
    let contractNumber: string | null = null
    if (t.side === 'CREDIT') {
      const outcome = matchTransaction(t, openPayments)
      matchStatus = outcome.status
      matchReason = outcome.reason
      contractNumber = outcome.best?.contractNumber ?? null
      if (outcome.status === 'MATCHED') matched++
      else if (outcome.status === 'SUGGESTED') suggested++
      else unmatched++
    }
    return {
      bookingDate: t.bookingDate.toISOString().slice(0, 10),
      side: t.side,
      amount: t.amount,
      counterpartyName: t.counterpartyName,
      title: t.title,
      matchStatus,
      matchReason,
      contractNumber,
    }
  })

  return NextResponse.json({
    mode: 'preview',
    format: parsed.format,
    fileName,
    accountNumber: parsed.accountNumber,
    matchedAccount,
    alreadyImported: !!already,
    period: {
      from: parsed.periodFrom?.toISOString().slice(0, 10) ?? null,
      to: parsed.periodTo?.toISOString().slice(0, 10) ?? null,
    },
    openingBalance: parsed.openingBalance,
    closingBalance: parsed.closingBalance,
    currency: parsed.currency,
    totals: {
      transactions: parsed.transactions.length,
      credits: credits.length,
      debits: debits.length,
      creditSum,
      matched,
      suggested,
      unmatched,
    },
    warnings: parsed.warnings,
    preview,
  })
}
