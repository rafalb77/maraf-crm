import { google } from 'googleapis'
import { prisma } from './prisma'

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback'
  )
}

export function getAuthUrl() {
  const oauth2Client = getOAuthClient()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
  })
}

export async function getCalendarClient() {
  const token = await prisma.calendarToken.findFirst()
  if (!token) return null

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken ?? undefined,
    expiry_date: token.expiresAt ? token.expiresAt.getTime() : undefined,
  })

  oauth2Client.on('tokens', async (tokens) => {
    await prisma.calendarToken.updateMany({
      data: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? token.refreshToken ?? undefined,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    })
  })

  return google.calendar({ version: 'v3', auth: oauth2Client })
}

export async function listEvents(timeMin: Date, timeMax: Date) {
  const calendar = await getCalendarClient()
  if (!calendar) return []

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  return response.data.items || []
}

export async function createEvent(event: {
  summary: string
  description?: string
  start: Date
  end: Date
  attendees?: string[]
}) {
  const calendar = await getCalendarClient()
  if (!calendar) throw new Error('Brak połączenia z Google Calendar')

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start.toISOString(), timeZone: 'Europe/Warsaw' },
      end: { dateTime: event.end.toISOString(), timeZone: 'Europe/Warsaw' },
      attendees: event.attendees?.map((email) => ({ email })),
    },
  })

  return response.data
}
