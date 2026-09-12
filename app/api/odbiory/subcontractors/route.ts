import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { json, jsonError, requireUser } from '@/lib/odbiory/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/odbiory/subcontractors — szybkie dodanie wykonawcy z kreatora / mini-menu
 * (pełna karta wykonawcy jest w module Budowa; tu tylko nazwa + kontakt).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const name = String(body.name || '').trim().slice(0, 160)
  if (!name) return jsonError('Podaj nazwę wykonawcy')
  const email = body.email ? String(body.email).trim().slice(0, 160) : null
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('Nieprawidłowy e-mail')
  const existing = await prisma.subcontractor.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
  if (existing) return json({ id: existing.id, name: existing.name, email: existing.email, contactName: existing.contactName, existed: true })
  const created = await prisma.subcontractor.create({
    data: {
      name,
      email,
      phone: body.phone ? String(body.phone).slice(0, 40) : null,
      contactName: body.contactName ? String(body.contactName).slice(0, 120) : null,
    },
  })
  void audit({ userId: user.id, userEmail: user.email, action: 'CREATE', entity: 'Subcontractor', entityId: created.id })
  return json({ id: created.id, name: created.name, email: created.email, contactName: created.contactName, existed: false }, 201)
}
