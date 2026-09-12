import type { Metadata } from 'next'

/**
 * Route group (public) — strony dla osób z zewnątrz BEZ sesji (wykonawca z linkiem
 * tokenowym). Autoryzacja = token w URL sprawdzany w route handlerach
 * /api/public/odbiory/w/[token]. Bez sidebara, bez danych innych firm.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Usterki do poprawy — MARAF',
  robots: { index: false, follow: false },
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-100 text-gray-900">{children}</div>
}
