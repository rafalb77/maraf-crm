'use client'
import { useState, useEffect, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns'
import { pl } from 'date-fns/locale'

interface CalendarEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  description?: string
}

export function CalendarView({ calendarConnected }: { calendarConnected: boolean }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({ summary: '', description: '', start: '', end: '' })
  const [saving, setSaving] = useState(false)

  const loadEvents = useCallback(async () => {
    if (!calendarConnected) return
    setLoading(true)
    try {
      const start = startOfMonth(currentMonth)
      const end = endOfMonth(currentMonth)
      const res = await fetch(`/api/calendar/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}`)
      if (res.ok) setEvents(await res.json())
    } finally {
      setLoading(false)
    }
  }, [calendarConnected, currentMonth])

  useEffect(() => { loadEvents() }, [loadEvents])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  function eventsForDay(day: Date) {
    return events.filter((e) => {
      const dateStr = e.start?.dateTime || e.start?.date
      if (!dateStr) return false
      return isSameDay(new Date(dateStr), day)
    })
  }

  async function createEvent() {
    setSaving(true)
    await fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEvent),
    })
    setShowNewEvent(false)
    setNewEvent({ summary: '', description: '', start: '', end: '' })
    setSaving(false)
    loadEvents()
  }

  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Calendar grid */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">
            {format(currentMonth, 'LLLL yyyy', { locale: pl })}
          </h2>
          <div className="flex gap-1">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={() => setCurrentMonth(new Date())}
              className="px-2 py-1 text-xs rounded-lg hover:bg-gray-100 text-gray-600">
              Dziś
            </button>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
          ))}
          {days.map((day) => {
            const dayEvents = eventsForDay(day)
            const isToday = isSameDay(day, new Date())
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isSelected = selectedDay && isSameDay(day, selectedDay)

            return (
              <button key={day.toString()}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`min-h-[60px] p-1 rounded-lg text-left transition-colors ${
                  !isCurrentMonth ? 'opacity-30' : ''
                } ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                <span className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${
                  isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                }`}>
                  {format(day, 'd')}
                </span>
                <div className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 2).map((e) => (
                    <div key={e.id} className="text-xs bg-blue-100 text-blue-700 rounded px-1 truncate">
                      {e.summary}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-xs text-gray-400">+{dayEvents.length - 2}</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Side panel */}
      <div className="space-y-4">
        {calendarConnected && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm">
                {selectedDay ? format(selectedDay, 'd MMMM', { locale: pl }) : 'Zdarzenia'}
              </h3>
              <button onClick={() => setShowNewEvent(!showNewEvent)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                + Nowe
              </button>
            </div>

            {showNewEvent && (
              <div className="border border-blue-100 rounded-lg p-3 bg-blue-50 space-y-2 mb-3">
                <input value={newEvent.summary} onChange={(e) => setNewEvent({ ...newEvent, summary: e.target.value })}
                  placeholder="Tytuł zdarzenia" className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <input value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Opis (opcjonalnie)" className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="datetime-local" value={newEvent.start} onChange={(e) => setNewEvent({ ...newEvent, start: e.target.value })}
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <input type="datetime-local" value={newEvent.end} onChange={(e) => setNewEvent({ ...newEvent, end: e.target.value })}
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={createEvent} disabled={saving || !newEvent.summary || !newEvent.start || !newEvent.end}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
                    {saving ? '...' : 'Dodaj'}
                  </button>
                  <button onClick={() => setShowNewEvent(false)}
                    className="text-xs text-gray-500 px-3 py-1.5 rounded hover:bg-gray-100">
                    Anuluj
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-gray-400">Ładowanie...</p>
            ) : selectedDayEvents.length > 0 ? (
              <div className="space-y-2">
                {selectedDayEvents.map((e) => (
                  <div key={e.id} className="p-2 rounded-lg bg-blue-50 border border-blue-100">
                    <p className="text-sm font-medium text-gray-900">{e.summary}</p>
                    {e.start?.dateTime && (
                      <p className="text-xs text-gray-500">
                        {format(new Date(e.start.dateTime), 'HH:mm')} –{' '}
                        {e.end?.dateTime ? format(new Date(e.end.dateTime), 'HH:mm') : ''}
                      </p>
                    )}
                    {e.description && <p className="text-xs text-gray-600 mt-1">{e.description}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                {selectedDay ? 'Brak zdarzeń w tym dniu' : 'Wybierz dzień'}
              </p>
            )}
          </div>
        )}

        {!calendarConnected && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-sm text-yellow-800">
            <p className="font-medium mb-2">Nie połączono z Google Calendar</p>
            <p className="text-xs text-yellow-700">Aby korzystać z kalendarza, skonfiguruj integrację w Ustawieniach i kliknij „Połącz z Google Calendar".</p>
          </div>
        )}
      </div>
    </div>
  )
}
