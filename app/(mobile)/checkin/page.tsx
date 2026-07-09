import { prisma } from '@/lib/prisma'
import { CheckinForm } from '@/components/budowa/CheckinForm'

/**
 * /checkin — mobilny raport kierownika budowy (moduł Budowa, Etap 1).
 * Permission 'checkin' egzekwuje middleware; sesja — layout (mobile).
 * Cel: 2 minuty na telefonie. Zdjęcia dosyłane pojedynczo po zapisie tekstu.
 */
export default async function CheckinPage() {
  const [investment, subcontractors] = await Promise.all([
    prisma.investment.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      select: { name: true },
    }),
    prisma.subcontractor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  if (!investment) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-gray-500">
        Brak aktywnej inwestycji — skontaktuj się z biurem.
      </div>
    )
  }

  return (
    <CheckinForm
      investmentName={investment.name}
      subcontractors={subcontractors}
    />
  )
}
