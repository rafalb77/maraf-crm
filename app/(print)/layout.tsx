// Layout dla widoków drukowanych — pełnoekranowy, bez sidebara/topbara/żadnej nawigacji.
// Wykorzystuje grupę routingową (print), żeby ominąć layout z (app).
// Sprawdza sesję, ale nie renderuje żadnej chrome aplikacji.
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const metadata = {
  title: 'Wydruk',
}

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/signin')
  return <div className="min-h-screen bg-white text-gray-900">{children}</div>
}
