import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEscrowAlerts } from '@/lib/escrow-alerts'

export const runtime = 'nodejs'

// GET — alerty modułu Rozliczenia powiernicze (zaległe raty, niedopasowane wpływy, ...).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await getEscrowAlerts()
  return NextResponse.json(result)
}
