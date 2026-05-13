import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  PREDEFINED_TOPIC_IDS,
  MAX_CUSTOM_INTERESTS,
  MAX_CUSTOM_INTEREST_LENGTH,
} from '@/lib/news-feed'

export const runtime = 'nodejs'

/**
 * GET /api/users/me
 * Zwraca dane profilowe zalogowanego użytkownika (bez password / tokenów).
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      preferredName: true,
      interests: true,
      customInterests: true,
      permissions: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ user })
}

/**
 * PATCH /api/users/me
 *
 * Body: { preferredName?, interests?, customInterests? }
 *
 * Whitelist pól — user może edytować TYLKO swoje preferencje, nie permissions/email/etc.
 * Walidacja:
 *  - preferredName: max 50 znaków (lub null/'' żeby wyczyścić)
 *  - interests: tylko ID z PREDEFINED_TOPIC_IDS, dedup
 *  - customInterests: trim + strip kontrolnych chars, max MAX_CUSTOM_INTERESTS, każdy max MAX_CUSTOM_INTEREST_LENGTH
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const data: {
    preferredName?: string | null
    interests?: string[]
    customInterests?: string[]
  } = {}

  if ('preferredName' in body) {
    const raw = body.preferredName
    if (raw === null || raw === '') {
      data.preferredName = null
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim().slice(0, 50)
      data.preferredName = trimmed || null
    } else {
      return NextResponse.json({ error: 'preferredName must be string or null' }, { status: 400 })
    }
  }

  if ('interests' in body) {
    if (!Array.isArray(body.interests)) {
      return NextResponse.json({ error: 'interests must be array' }, { status: 400 })
    }
    const allowed = new Set<string>(PREDEFINED_TOPIC_IDS)
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const v of body.interests) {
      if (typeof v !== 'string') continue
      if (!allowed.has(v)) continue
      if (seen.has(v)) continue
      seen.add(v)
      cleaned.push(v)
    }
    data.interests = cleaned
  }

  if ('customInterests' in body) {
    if (!Array.isArray(body.customInterests)) {
      return NextResponse.json({ error: 'customInterests must be array' }, { status: 400 })
    }
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const raw of body.customInterests) {
      if (typeof raw !== 'string') continue
      const clean = raw.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, MAX_CUSTOM_INTEREST_LENGTH)
      if (!clean) continue
      const key = clean.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      cleaned.push(clean)
      if (cleaned.length >= MAX_CUSTOM_INTERESTS) break
    }
    data.customInterests = cleaned
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      preferredName: true,
      interests: true,
      customInterests: true,
    },
  })

  return NextResponse.json({ user })
}
