import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { createReportFlagTasks } from '@/lib/budowa-tasks'

/**
 * POST /api/budowa/checkin — zapis raportu kierownika budowy (moduł Budowa, Etap 1).
 *
 * Celowo TYLKO tekst + flagi — zdjęcia dosyłane osobno, pojedynczo, przez
 * /api/budowa/checkin/photos (słaby LTE na budowie nie może utopić raportu).
 * Permission 'checkin' egzekwuje middleware (prefiks /api/budowa/checkin).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }

  const workDone = typeof body.workDone === 'string' ? body.workDone.trim() : ''
  if (workDone.length < 3) {
    return NextResponse.json({ error: 'Wpisz krótko, co zostało zrobione' }, { status: 400 })
  }

  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!investment) {
    return NextResponse.json({ error: 'Brak aktywnej inwestycji' }, { status: 400 })
  }

  // Wykonawca z flagi "reakcja wykonawcy" — waliduj, że istnieje (skalar bez FK)
  let contractorId: string | null = null
  if (body.needsContractorAction && typeof body.contractorSubcontractorId === 'string') {
    const sub = await prisma.subcontractor.findUnique({
      where: { id: body.contractorSubcontractorId },
      select: { id: true },
    })
    contractorId = sub?.id ?? null
  }

  const report = await prisma.siteReport.create({
    data: {
      investmentId: investment.id,
      authorId: session.user.id || null,
      authorEmail: session.user.email || null,
      workDone: workDone.slice(0, 2000),
      hasIssue: body.hasIssue === true,
      issueNote: body.hasIssue === true ? String(body.issueNote || '').slice(0, 2000) || null : null,
      needsDecision: body.needsDecision === true,
      decisionNote:
        body.needsDecision === true ? String(body.decisionNote || '').slice(0, 2000) || null : null,
      needsContractorAction: body.needsContractorAction === true,
      contractorActionNote:
        body.needsContractorAction === true
          ? String(body.contractorActionNote || '').slice(0, 2000) || null
          : null,
      contractorActionSubcontractorId: contractorId,
    },
  })

  // Flagi → Taski dla Rafała (idempotentne po ruleKey). Awaria reguł nie może
  // utopić zapisanego raportu — łapiemy i logujemy.
  try {
    await createReportFlagTasks(report)
  } catch (e) {
    console.error('[budowa.checkin] błąd tworzenia zadań z flag:', e)
  }

  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'CREATE',
    entity: 'SiteReport',
    entityId: report.id,
  })

  return NextResponse.json({ id: report.id }, { status: 201 })
}
