/**
 * Generuje nowy klucz API dla integracji 3D Estate i zapisuje go w Settings.
 * Tylko admin (session NextAuth). Stary klucz nadpisany — 3DE dostanie 401 do czasu
 * otrzymania nowego.
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { prisma } from '@/lib/prisma'
import { generateApiKey } from '@/lib/3destate'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const key = generateApiKey()
  await prisma.settings.upsert({
    where: { key: 'threeDEstateApiKey' },
    update: { value: key },
    create: { key: 'threeDEstateApiKey', value: key },
  })

  return NextResponse.json({ key })
}
