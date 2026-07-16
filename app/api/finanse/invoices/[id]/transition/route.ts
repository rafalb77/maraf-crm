import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'

// POST /api/finanse/invoices/[id]/transition
// Zmiana statusu workflow akceptacji + audit log.
//
// Body: { action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RESET' | 'CANCEL', comment?: string }
//
// Uprawnienia:
//  SUBMIT  — kazdy z permission 'finanse' (Marta)
//  APPROVE — wymaga 'finanse.approve' (Bohdan/admin)
//  REJECT  — wymaga 'finanse.approve' (Bohdan/admin) + comment WYMAGANY
//  RESET   — kazdy 'finanse' lub admin (cofa do WPROWADZONA, np. po edycji)
//  CANCEL  — admin tylko (faktura skorygowana po stronie dostawcy)
//
// Przejscia statusow:
//  WPROWADZONA           → SUBMIT  → DO_ZATWIERDZENIA
//  DO_ZATWIERDZENIA      → APPROVE → ZATWIERDZONA
//  DO_ZATWIERDZENIA      → REJECT  → ODRZUCONA (z komentarzem)
//  ODRZUCONA             → RESET   → WPROWADZONA (do poprawy przez Marte)
//  ZATWIERDZONA          → RESET   → WPROWADZONA (admin override, np. blad)
//  dowolny != OPLACONA   → CANCEL  → ANULOWANA (admin only)

// Workflow uproszczony 2026-05-31: Marta sama zatwierdza, brak osobnej fazy
// "do zatwierdzenia". Nowe faktury wpadaja od razu jako ZATWIERDZONA. Akcje
// zostaja dla cofania/anulowania jesli pomylka.
const TRANSITIONS: Record<string, { from: string[]; to: string; requirePerm?: string; requireAdmin?: boolean; requireComment?: boolean }> = {
  APPROVE: { from: ['POBRANA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'ODRZUCONA'], to: 'ZATWIERDZONA' },
  REJECT: { from: ['POBRANA', 'WPROWADZONA', 'DO_ZATWIERDZENIA', 'ZATWIERDZONA'], to: 'ODRZUCONA', requireComment: true },
  RESET: { from: ['DO_ZATWIERDZENIA', 'ZATWIERDZONA', 'ODRZUCONA'], to: 'WPROWADZONA' },
  CANCEL: { from: ['WPROWADZONA', 'DO_ZATWIERDZENIA', 'ZATWIERDZONA', 'ZAPLANOWANA', 'CZESCIOWO_OPLACONA', 'ODRZUCONA'], to: 'ANULOWANA', requireAdmin: true },
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 }) }

  const action = String(body.action || '').toUpperCase()
  const comment = body.comment ? String(body.comment).trim() : null

  const def = TRANSITIONS[action]
  if (!def) return NextResponse.json({ error: `Nieznana akcja: ${action}` }, { status: 400 })

  // Uprawnienia
  const adminUser = isAdmin(session.user.email)
  const userPerms = ((session.user as any).permissions as string[]) || []
  if (def.requireAdmin && !adminUser) {
    return NextResponse.json({ error: 'Tylko admin moze wykonac te akcje' }, { status: 403 })
  }
  if (def.requirePerm && !adminUser && !userPerms.includes(def.requirePerm)) {
    return NextResponse.json({ error: `Wymagane uprawnienie: ${def.requirePerm}` }, { status: 403 })
  }
  if (def.requireComment && !comment) {
    return NextResponse.json({ error: 'Komentarz jest wymagany dla tej akcji' }, { status: 400 })
  }

  const inv = await prisma.purchaseInvoice.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  })
  if (!inv) return NextResponse.json({ error: 'Faktura nie istnieje' }, { status: 404 })

  if (!def.from.includes(inv.status)) {
    return NextResponse.json({
      error: `Akcja ${action} niedozwolona ze statusu ${inv.status}. Dozwolone z: ${def.from.join(', ')}`,
    }, { status: 400 })
  }

  // Zapis: status + audit
  await prisma.$transaction([
    prisma.purchaseInvoice.update({
      where: { id: params.id },
      data: { status: def.to },
    }),
    prisma.purchaseInvoiceApproval.create({
      data: {
        invoiceId: params.id,
        action,
        userId: session.user.id || null,
        userEmail: session.user.email || null,
        comment,
      },
    }),
  ])

  return NextResponse.json({ ok: true, newStatus: def.to })
}
