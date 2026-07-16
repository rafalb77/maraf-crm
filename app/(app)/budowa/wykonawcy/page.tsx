import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { loadBudowaCostData, contractorContexts } from '@/lib/budowa-alerts'

/**
 * /budowa/wykonawcy — wykonawcy z kontekstem budowy i kosztów (moduł Budowa, Etap 3).
 * Karty: powiązanie z Finansami (mostek), liczba faktur, nieopłacone po terminie,
 * status 🟢/🟡/🔴 (z opóźnień zadań), link do rejestru w Przerobach.
 */
export const dynamic = 'force-dynamic'

function fmt(n: number): string {
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł'
}

export default async function WykonawcyPage() {
  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
  if (!investment) return <div className="p-4 sm:p-6 lg:p-8 text-gray-500">Brak aktywnej inwestycji.</div>

  const data = await loadBudowaCostData(investment.id)
  if (!data) return <div className="p-4 sm:p-6 lg:p-8 text-gray-500">Brak danych.</div>

  const now = new Date()
  const contractors = contractorContexts(data, now)

  // status 🟢/🔴: czerwony gdy nieopłacone FV po terminie (opóźnienia zadań widać w harmonogramie)
  function statusDot(overdueCount: number): { emoji: string; label: string } {
    if (overdueCount > 0) return { emoji: '🔴', label: 'nieopłacone FV po terminie' }
    return { emoji: '🟢', label: 'bez zaległości płatniczych' }
  }

  const active = contractors

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold mb-6">Wykonawcy — {investment.name}</h1>

      {active.length === 0 ? (
        <p className="text-gray-500">Brak wykonawców w rejestrze.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map((c) => {
            const dot = statusDot(c.overdueCount)
            return (
              <div key={c.subcontractorId} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link
                    href={`/przeroby/podwykonawcy/${c.subcontractorId}`}
                    className="font-semibold text-gray-900 hover:text-blue-600"
                  >
                    {c.name}
                  </Link>
                  <span title={dot.label} className="text-lg shrink-0">
                    {dot.emoji}
                  </span>
                </div>

                {c.bridged ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Faktury</span>
                      <span className="tabular-nums">{c.invoiceCount}</span>
                    </div>
                    {c.overdueCount > 0 ? (
                      <div className="flex justify-between text-red-700 font-medium">
                        <span>🔴 Nieopłacone po terminie</span>
                        <span className="tabular-nums">
                          {c.overdueCount} • {fmt(c.overdueAmount)}
                        </span>
                      </div>
                    ) : (
                      <div className="text-green-700 text-xs">✓ brak zaległych płatności</div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    Niepowiązany z Finansami —{' '}
                    <Link href={`/przeroby/podwykonawcy/${c.subcontractorId}`} className="underline">
                      zmostkuj
                    </Link>
                    , żeby widzieć faktury i alerty.
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-gray-100 flex gap-3 text-xs">
                  <Link href={`/przeroby/podwykonawcy/${c.subcontractorId}`} className="text-blue-600 hover:underline">
                    Protokoły →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Rejestr wykonawców i protokoły: <Link href="/przeroby/podwykonawcy" className="underline">Przeroby → Podwykonawcy</Link>.
        Koszty i budżety: <Link href="/budowa/koszty" className="underline">/budowa/koszty</Link>.
      </p>
    </div>
  )
}
