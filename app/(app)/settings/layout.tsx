import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.email)) {
    redirect('/dashboard')
  }
  return <>{children}</>
}
