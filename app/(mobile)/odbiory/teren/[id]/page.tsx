import type { Metadata } from 'next'
import { FieldInspectionLazy } from '@/components/odbiory/FieldInspectionLazy'

export const metadata: Metadata = {
  title: 'Odbiór — widok terenowy · MARAF',
}

/**
 * /odbiory/teren/[id] — widok terenowy odbioru (tablet / telefon / komputer).
 * Route group (mobile): bez sidebara, session-check w layoucie. Dane i zmiany żyją
 * w IndexedDB (offline-first), synchronizacja po odzyskaniu zasięgu.
 * ?tryb=weryfikacja — od razu tryb ponownego odbioru; ?usterka=<id> — otwórz kartę.
 */
export default function FieldInspectionPage({ params, searchParams }: { params: { id: string }; searchParams?: Record<string, string | string[] | undefined> }) {
  const tryb = typeof searchParams?.tryb === 'string' ? searchParams.tryb : ''
  const usterka = typeof searchParams?.usterka === 'string' ? searchParams.usterka : null
  return <FieldInspectionLazy inspectionId={params.id} initialMode={tryb === 'weryfikacja' ? 'verify' : 'inspect'} focusDefectId={usterka} />
}
