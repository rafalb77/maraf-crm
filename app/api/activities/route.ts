import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createEvent } from '@/lib/google-calendar'
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@/lib/types'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const activity = await prisma.activity.create({
    data: {
      clientId: body.clientId,
      type: body.type || 'NOTATKA',
      title: body.title,
      content: body.content || null,
      date: body.date ? new Date(body.date) : new Date(),
    },
    include: { client: { select: { firstName: true, lastName: true, phone: true } } },
  })

  // Opcjonalny wpis w Google Calendar (istniejąca integracja OAuth z modułu
  // Kalendarz). Błąd kalendarza NIE wycofuje działania — zwracamy go w polu
  // calendarError, front pokazuje ostrzeżenie.
  let calendarError: string | null = null
  if (body.addToCalendar) {
    try {
      const durationMin = activity.type === 'SPOTKANIE' ? 60 : 30
      const label = ACTIVITY_TYPE_LABELS[activity.type as ActivityType] ?? activity.type
      const clientName = `${activity.client.firstName} ${activity.client.lastName}`
      const base = process.env.NEXTAUTH_URL || req.nextUrl.origin
      const description = [
        activity.content,
        activity.client.phone ? `Tel: ${activity.client.phone}` : null,
        `Karta klienta: ${base}/clients/${activity.clientId}`,
      ]
        .filter(Boolean)
        .join('\n')
      await createEvent({
        summary: `${label}: ${clientName} — ${activity.title}`,
        description,
        start: activity.date,
        end: new Date(activity.date.getTime() + durationMin * 60_000),
      })
    } catch (e) {
      calendarError = e instanceof Error ? e.message : 'Błąd Google Calendar'
    }
  }

  return NextResponse.json({ ...activity, calendarError }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await prisma.activity.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
