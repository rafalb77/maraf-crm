import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listEvents, createEvent } from '@/lib/google-calendar'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const timeMin = searchParams.get('timeMin')
  const timeMax = searchParams.get('timeMax')

  const start = timeMin ? new Date(timeMin) : new Date()
  const end = timeMax ? new Date(timeMax) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  try {
    const events = await listEvents(start, end)
    return NextResponse.json(events)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  try {
    const event = await createEvent({
      summary: body.summary,
      description: body.description,
      start: new Date(body.start),
      end: new Date(body.end),
      attendees: body.attendees,
    })
    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Błąd Google Calendar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
