import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ProfileForm, type ProfileUser } from '@/components/profil/ProfileForm'

/**
 * /profil — strona dostępna dla KAŻDEGO zalogowanego usera (bez permission).
 * Permission map w lib/permissions.ts zwraca null dla tej ścieżki.
 */
export default async function ProfilPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      preferredName: true,
      interests: true,
      customInterests: true,
    },
  })

  if (!dbUser) {
    redirect('/auth/signin')
  }

  const initial: ProfileUser = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    preferredName: dbUser.preferredName,
    interests: dbUser.interests,
    customInterests: dbUser.customInterests,
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Mój profil
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Personalizuj sposób, w jaki system Cię wita i jakie newsy widzisz na Pulpicie.
        </p>
      </div>

      <ProfileForm initial={initial} />
    </div>
  )
}
