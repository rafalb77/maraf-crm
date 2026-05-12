import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { getFirstAvailableUrl } from '@/lib/permissions'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/signin')

  // Admin (override) → dashboard. Inni → pierwsza dostępna sekcja z ich permissions.
  if (isAdmin(session.user?.email)) redirect('/dashboard')

  const permissions = session.user?.permissions || []
  redirect(getFirstAvailableUrl(permissions))
}
