import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'
import { syncCompanyFromKsef } from '@/lib/ksef-client'

// POST /api/finanse/ksef/sync/[company]
// Uruchamia synchronizacje faktur z KSeF dla danej firmy.
// SZKIELET: klient KSeF nie jest jeszcze zaimplementowany (lib/ksef-client.ts),
// wiec zwraca informacje o tym + nie modyfikuje danych.
// Aktualizuje lastSyncAt + lastSyncStatus zeby user widzial ze przycisk dziala.
export async function POST(_req: NextRequest, { params }: { params: { company: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Tylko admin' }, { status: 403 })

  const company = params.company === 'MARAF_DEVELOPMENT' ? 'MARAF_DEVELOPMENT' : 'MARAF'

  const cfg = await prisma.ksefConfig.findUnique({ where: { company } })
  if (!cfg) return NextResponse.json({ error: 'Brak konfiguracji KSeF dla tej firmy' }, { status: 404 })
  if (!cfg.enabled) return NextResponse.json({ error: 'KSeF wyłączony dla tej firmy (włącz "Aktywny" w konfiguracji)' }, { status: 400 })
  if (!cfg.token) return NextResponse.json({ error: 'Brak tokenu KSeF dla tej firmy — wpisz go w konfiguracji' }, { status: 400 })

  // Wywolanie klienta (na razie stub — zwraca ok:false + komunikat)
  const result = await syncCompanyFromKsef(company)

  await prisma.ksefConfig.update({
    where: { company },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: result.ok ? 'OK' : 'ERROR',
      lastSyncError: result.ok ? null : (result.error || 'Nieznany blad'),
      lastSyncCount: result.ok ? result.count : null,
    },
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, count: result.count }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: result.count })
}
