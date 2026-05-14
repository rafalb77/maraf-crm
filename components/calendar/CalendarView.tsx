'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from 'date-fns'
import { pl } from 'date-fns/locale'

interface CalendarEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  description?: string
}

type CalView = 'day' | 'week' | 'month'

const VIEW_LABELS: Record<CalView, string> = {
  day: 'Dzień',
  week: 'Tydzień',
  month: 'Miesiąc',
}

// Zakres dat pobierany z API dla danego widoku.
function viewRange(date: Date, view: CalView): { start: Date; end: Date } {
  if (view === 'day') return { start: startOfDay(date), end: endOfDay(date) }
  if (view === 'week') {
    return {
      start: startOfWeek(date, { weekStartsOn: 1 }),
      end: endOfWeek(date, { weekStartsOn: 1 }),
    }
  }
  return { start: startOfMonth(date), end: endOfMonth(date) }
}

export function CalendarView({ calendarConnected }: { calendarConnected: boolean }) {
  const [view, setView] = useState<CalView>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
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
      const { start, end } = viewRange(currentDate, view)
      const res = await fetch(
        `/api/calendar/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}`,
      )
      if (res.ok) setEvents(await res.json())
    } finally {
      setLoading(false)
    }
  }, [calendarConnected, currentDate, view])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Nawigacja prev/today/next — krok zależny od widoku.
  function navigate(dir: -1 | 0 | 1) {
    if (dir === 0) {
      setCurrentDate(new Date())
      return
    }
    if (view === 'day') {
      setCurrentDate(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1))
    } else if (view === 'week') {
      setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
    } else {
      setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    }
  }

  function eventsForDay(day: Date) {
    return events
      .filter((e) => {
        const dateStr = e.start?.dateTime || e.start?.date
        if (!dateStr) return false
        return isSameDay(new Date(dateStr), day)
      })
      .sort((a, b) => {
        const ta = a.start?.dateTime || a.start?.date || ''
        const tb = b.start?.dateTime || b.start?.date || ''
        return ta.localeCompare(tb)
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

  // W widoku dziennym panel boczny pokazuje wydarzenia bieżącego dnia.
  const panelDay = view === 'day' ? currentDate : selectedDay
  const panelDayEvents = panelDay ? eventsForDay(panelDay) : []

  // Tytuł nagłówka zależny od widoku.
  const title =
    view === 'day'
      ? format(currentDate, 'd MMMM yyyy', { locale: pl })
      : view === 'week'
        ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM', { locale: pl })} – ${format(
            endOfWeek(currentDate, { weekStartsOn: 1 }),
            'd MMM yyyy',
            { locale: pl },
          )}`
        : format(currentDate, 'LLLL yyyy', { locale: pl })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Calendar */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="font-semibold text-gray-900 capitalize">{title}</h2>
          <div className="flex items-center gap-2">
            {/* Przełącznik widoków */}
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
              {(['day', 'week', 'month'] as CalView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    view === v
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
            {/* Nawigacja */}
            <div className="flex gap-1">
              <button
                onClick={() => navigate(-1)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label="Poprzedni"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => navigate(0)}
                className="px-2 py-1 text-xs rounded-lg hover:bg-gray-100 text-gray-600"
              >
                Dziś
              </button>
              <button
                onClick={() => navigate(1)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label="Następny"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {view === 'month' && (
          <MonthGrid
            currentDate={currentDate}
            eventsForDay={eventsForDay}
            selectedDay={selectedDay}
            onSelectDay={(d) => setSelectedDay(selectedDay && isSameDay(d, selectedDay) ? null : d)}
          />
        )}
        {view === 'week' && (
          <WeekGrid
            currentDate={currentDate}
            eventsForDay={eventsForDay}
            selectedDay={selectedDay}
            onSelectDay={(d) => setSelectedDay(selectedDay && isSameDay(d, selectedDay) ? null : d)}
          />
        )}
        {view === 'day' && <DayList currentDate={currentDate} events={eventsForDay(currentDate)} />}
      </div>

      {/* Side panel */}
      <div className="space-y-4">
        {calendarConnected && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm">
                {panelDay ? format(panelDay, 'd MMMM', { locale: pl }) : 'Zdarzenia'}
              </h3>
              <button
                onClick={() => setShowNewEvent(!showNewEvent)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Nowe
              </button>
            </div>

            {showNewEvent && (
              <div className="border border-blue-100 rounded-lg p-3 bg-blue-50 space-y-2 mb-3">
                <input
                  value={newEvent.summary}
                  onChange={(e) => setNewEvent({ ...newEvent, summary: e.target.value })}
                  placeholder="Tytuł zdarzenia"
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Opis (opcjonalnie)"
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="datetime-local"
                    value={newEvent.start}
                    onChange={(e) => setNewEvent({ ...newEvent, start: e.target.value })}
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="datetime-local"
                    value={newEvent.end}
                    onChange={(e) => setNewEvent({ ...newEvent, end: e.target.value })}
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={createEvent}
                    disabled={saving || !newEvent.summary || !newEvent.start || !newEvent.end}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? '...' : 'Dodaj'}
                  </button>
                  <button
                    onClick={() => setShowNewEvent(false)}
                    className="text-xs text-gray-500 px-3 py-1.5 rounded hover:bg-gray-100"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-gray-400">Ładowanie...</p>
            ) : panelDayEvents.length > 0 ? (
              <div className="space-y-2">
                {panelDayEvents.map((e) => (
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
                {panelDay ? 'Brak zdarzeń w tym dniu' : 'Wybierz dzień'}
              </p>
            )}
          </div>
        )}

        {!calendarConnected && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-sm text-yellow-800">
            <p className="font-medium mb-2">Nie połączono z Google Calendar</p>
            <p className="text-xs text-yellow-700">
              Aby korzystać z kalendarza, skonfiguruj integrację w Ustawieniach i kliknij „Połącz z Google
              Calendar".
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================================
// Widok miesięczny — siatka 7 × N tygodni
// =====================================================================

function MonthGrid({
  currentDate,
  eventsForDay,
  selectedDay,
  onSelectDay,
}: {
  currentDate: Date
  eventsForDay: (d: Date) => CalendarEvent[]
  selectedDay: Date | null
  onSelectDay: (d: Date) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  return (
    <div className="grid grid-cols-7 gap-px">
      {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((d) => (
        <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">
          {d}
        </div>
      ))}
      {days.map((day) => {
        const dayEvents = eventsForDay(day)
        const isToday = isSameDay(day, new Date())
        const isCurrentMonth = isSameMonth(day, currentDate)
        const isSelected = selectedDay && isSameDay(day, selectedDay)
        return (
          <button
            key={day.toString()}
            onClick={() => onSelectDay(day)}
            className={`min-h-[60px] p-1 rounded-lg text-left transition-colors ${
              !isCurrentMonth ? 'opacity-30' : ''
            } ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
          >
            <span
              className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${
                isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
              }`}
            >
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
  )
}

// =====================================================================
// Widok tygodniowy — 7 kolumn obok siebie, wszystkie wydarzenia dnia
// =====================================================================

function WeekGrid({
  currentDate,
  eventsForDay,
  selectedDay,
  onSelectDay,
}: {
  currentDate: Date
  eventsForDay: (d: Date) => CalendarEvent[]
  selectedDay: Date | null
  onSelectDay: (d: Date) => void
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  return (
    <div className="grid grid-cols-7 gap-px">
      {days.map((day) => {
        const dayEvents = eventsForDay(day)
        const isToday = isSameDay(day, new Date())
        const isSelected = selectedDay && isSameDay(day, selectedDay)
        return (
          <button
            key={day.toString()}
            onClick={() => onSelectDay(day)}
            className={`min-h-[220px] p-1.5 rounded-lg text-left align-top transition-colors ${
              isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] uppercase text-gray-400">
                {format(day, 'EEEEEE', { locale: pl })}
              </span>
              <span
                className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${
                  isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                }`}
              >
                {format(day, 'd')}
              </span>
            </div>
            <div className="space-y-0.5">
              {dayEvents.map((e) => (
                <div
                  key={e.id}
                  className="text-xs bg-blue-100 text-blue-700 rounded px-1 py-0.5 truncate"
                  title={e.summary}
                >
                  {e.start?.dateTime && (
                    <span className="text-blue-500 mr-1">
                      {format(new Date(e.start.dateTime), 'HH:mm')}
                    </span>
                  )}
                  {e.summary}
                </div>
              ))}
              {dayEvents.length === 0 && <span className="text-[10px] text-gray-300">—</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// =====================================================================
// Widok dzienny — pojedyncza kolumna, wydarzenia z godzinami
// =====================================================================

function DayList({ currentDate, events }: { currentDate: Date; events: CalendarEvent[] }) {
  const isToday = isSameDay(currentDate, new Date())
  return (
    <div className="rounded-lg border border-gray-100">
      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900 capitalize">
          {format(currentDate, 'EEEE, d MMMM', { locale: pl })}
        </span>
        {isToday && (
          <span className="text-[10px] font-medium bg-blue-600 text-white px-1.5 py-0.5 rounded">
            dziś
          </span>
        )}
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-8 text-sm text-gray-400 text-center">Brak zdarzeń w tym dniu</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {events.map((e) => (
            <div key={e.id} className="px-4 py-3 flex gap-3">
              <div className="text-xs text-gray-500 tabular-nums whitespace-nowrap w-24 flex-shrink-0">
                {e.start?.dateTime ? (
                  <>
                    {format(new Date(e.start.dateTime), 'HH:mm')}
                    {e.end?.dateTime && (
                      <>
                        <br />
                        <span className="text-gray-400">
                          {format(new Date(e.end.dateTime), 'HH:mm')}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400">cały dzień</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{e.summary}</p>
                {e.description && <p className="text-xs text-gray-600 mt-0.5">{e.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
