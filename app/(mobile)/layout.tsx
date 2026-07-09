import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'

/**
 * Route group (mobile) — lekki layout mobilny BEZ AppShell/sidebara (moduł Budowa).
 * Mieszkają tu: /checkin (raport kierownika) i /budowa/przeglad (Widok Prezesa).
 * Sidebar (app) jest fixed 256px i nie nadaje się na telefon — patrz
 * docs/budowa-rozpoczecie.md sekcja Mobile.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  manifest: '/manifest.json',
}

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/signin')

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {children}
    </div>
  )
}
