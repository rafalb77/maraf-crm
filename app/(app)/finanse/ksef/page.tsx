import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { KSEF_DEFAULTS } from '@/lib/ksef-defaults'
import { COMPANY_LABELS, type Company } from '@/lib/types'
import { KsefConfigCard } from '@/components/finanse/KsefConfigCard'

export default async function KsefPage() {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.email)) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-900">
          Konfiguracja KSeF dostępna tylko dla administratora.
        </div>
      </div>
    )
  }

  // Lazy-create defaults dla obu firm
  const companies: Company[] = ['MARAF', 'MARAF_DEVELOPMENT']
  const configs = []
  for (const company of companies) {
    let cfg = await prisma.ksefConfig.findUnique({ where: { company } })
    if (!cfg) {
      const def = KSEF_DEFAULTS[company]
      cfg = await prisma.ksefConfig.create({
        data: {
          company,
          nip: def.nip,
          syncFromDate: def.syncFromDate,
          environment: 'PROD',
          enabled: false,
        },
      })
    }
    configs.push(cfg)
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Konfiguracja KSeF</h1>
        <p className="text-gray-500 text-sm mt-1">
          Pobieranie faktur (read-only) z Krajowego Systemu e-Faktur dla obu spółek. Saldeo zostaje dla księgowości.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-900">
        <p className="font-semibold mb-1">ℹ️ Status: implementacja gotowa, oczekuje na test produkcyjny</p>
        <p>
          Klient KSeF API 2.0 (auth + queryMetadata + getInvoiceByKsefNumber + parser FA(3)) zaimplementowany.
          Pierwsze synchronizacje mogą wyrzucić błędy API (różnice w body/response względem dokumentacji) — wklej błąd, naprawimy.
        </p>
      </div>

      <div className="space-y-6">
        {configs.map((cfg) => (
          <KsefConfigCard
            key={cfg.company}
            company={cfg.company}
            companyLabel={COMPANY_LABELS[cfg.company as Company] || cfg.company}
            nip={cfg.nip}
            hasToken={!!cfg.token}
            tokenMasked={cfg.token ? `${'•'.repeat(8)}${cfg.token.slice(-4)}` : null}
            environment={cfg.environment}
            enabled={cfg.enabled}
            syncFromDate={cfg.syncFromDate ? cfg.syncFromDate.toISOString().slice(0, 10) : ''}
            lastSyncAt={cfg.lastSyncAt ? cfg.lastSyncAt.toISOString() : null}
            lastSyncStatus={cfg.lastSyncStatus}
            lastSyncError={cfg.lastSyncError}
            lastSyncCount={cfg.lastSyncCount}
          />
        ))}
      </div>

      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700">
        <p className="font-semibold mb-1">Jak uzyskać token KSeF</p>
        <ol className="list-decimal list-inside space-y-0.5 ml-2">
          <li>Wejdź na <code className="bg-white px-1 rounded">ksef.podatki.gov.pl</code> jako osoba z uprawnieniami właścicielskimi danej spółki.</li>
          <li>Nadaj uprawnienie „odczyt faktur" dla tożsamości, której token użyjesz.</li>
          <li>Wygeneruj token KSeF (długoterminowy) — wklej go w polu „Token KSeF" powyżej.</li>
          <li>Włącz „Aktywny" i ustaw datę startu synchronizacji.</li>
        </ol>
      </div>
    </div>
  )
}
