import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { SettingsForm } from '@/components/settings/SettingsForm'
import { UsersSection } from '@/components/settings/UsersSection'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string }
}) {
  const session = await getServerSession(authOptions)
  const currentUserEmail = session?.user?.email || ''
  const calendarToken = await prisma.calendarToken.findFirst()
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

  // Sprawdź konfigurację SMTP z bazy (Settings) lub env vars (fallback)
  const smtpRows = await prisma.settings.findMany({
    where: { key: { in: ['smtpHost', 'smtpUser', 'smtpPass'] } },
  })
  const smtpDbMap = Object.fromEntries(smtpRows.map((r) => [r.key, r.value]))
  const smtpConfigured = !!(
    (smtpDbMap.smtpHost && smtpDbMap.smtpUser && smtpDbMap.smtpPass) ||
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  )

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ustawienia</h1>
        <p className="text-gray-500 text-sm mt-1">Konfiguracja integracji i parametrów systemu</p>
      </div>

      {searchParams.success === 'calendar_connected' && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          ✓ Pomyślnie połączono z Google Calendar
        </div>
      )}

      <div className="space-y-5">
        {/* Users management — pełen UI w kliencie (lista + add + delete + reset) */}
        <UsersSection currentUserEmail={currentUserEmail} />

        {/* Google Calendar */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Google Calendar</h2>
              <p className="text-sm text-gray-500 mt-1">Synchronizacja wydarzeń z kalendarzem Google</p>
            </div>
            {calendarToken ? (
              <span className="px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                ✓ Połączono
              </span>
            ) : (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                Nie połączono
              </span>
            )}
          </div>

          {!googleConfigured ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              <p className="font-medium mb-2">Brak konfiguracji OAuth</p>
              <p className="mb-3">Aby włączyć integrację, uzupełnij w pliku <code className="bg-yellow-100 px-1 rounded">.env.local</code>:</p>
              <pre className="bg-white border border-yellow-100 rounded p-2 text-xs text-gray-700 overflow-x-auto">{`GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="https://crm.maraf.pl/api/calendar/callback"`}</pre>
              <p className="mt-3 text-xs">
                Klucze uzyskasz w <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a>.
                Włącz API „Google Calendar API" i dodaj URL przekierowania.
              </p>
            </div>
          ) : (
            <div className="flex gap-3">
              <a href="/api/calendar/connect"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                {calendarToken ? 'Połącz ponownie' : 'Połącz z Google Calendar'}
              </a>
              {calendarToken && <DisconnectCalendarButton />}
            </div>
          )}
        </div>

        {/* Status SMTP — formularz konfiguracji jest w SettingsForm poniżej */}
        {!smtpConfigured && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">SMTP nieskonfigurowany</p>
            <p className="text-blue-700">
              Wypełnij dane serwera poczty w sekcji „Serwer poczty (SMTP)" poniżej. Dla home.pl użyj presetu — automatycznie ustawi host/port/szyfrowanie.
            </p>
          </div>
        )}

        {/* App settings — dane firmy + SMTP + test mail */}
        <SettingsForm />

        {/* Info about app */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Informacje o aplikacji</h2>
          <div className="text-sm text-gray-600 space-y-1">
            <p>• Baza danych: PostgreSQL</p>
            <p>• Uploadowane rzuty: <code className="bg-gray-100 px-1 rounded">public/uploads/floorplans/</code></p>
            <p>• Środowisko: {process.env.NODE_ENV}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function DisconnectCalendarButton() {
  return null // inline disconnect via API - simple link works
}
