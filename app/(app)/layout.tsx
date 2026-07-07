import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { TopBar } from '@/components/layout/TopBar'

// Wszystkie strony pod (app) wymagaja zalogowanej sesji NextAuth i robia
// queries do Prismy — nie ma sensu probowac SSG. Wymuszamy dynamic rendering
// zeby Next.js nie probowal generowac stron statycznie podczas `next build`
// (co padalo przy budowie w Coolify, prawdopodobnie OOM przy 52 stronach).
export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/signin')

  return (
    <AppShell topBar={<TopBar userName={session.user?.name} userEmail={session.user?.email} />}>
      {children}
    </AppShell>
  )
}
