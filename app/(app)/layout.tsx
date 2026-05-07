import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
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
    <div className="flex h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col overflow-hidden">
        <TopBar userName={session.user?.name || session.user?.email} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
