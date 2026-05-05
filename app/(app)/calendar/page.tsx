import { CalendarView } from '@/components/calendar/CalendarView'
import { prisma } from '@/lib/prisma'

export default async function CalendarPage() {
  const calendarConnected = !!(await prisma.calendarToken.findFirst())

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kalendarz</h1>
          <p className="text-gray-500 text-sm mt-1">
            {calendarConnected ? (
              <span className="text-green-600">✓ Połączono z Google Calendar</span>
            ) : (
              <span className="text-gray-400">Nie połączono z Google Calendar</span>
            )}
          </p>
        </div>
        {!calendarConnected && (
          <a href="/api/calendar/connect"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
            Połącz z Google Calendar
          </a>
        )}
      </div>
      <CalendarView calendarConnected={calendarConnected} />
    </div>
  )
}
