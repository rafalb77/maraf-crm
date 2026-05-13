import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { unlink } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'

type Params = { params: { id: string; imageId: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const image = await prisma.unitImage.findUnique({ where: { id: params.imageId } })
  if (!image || image.unitId !== params.id) {
    return NextResponse.json({ error: 'Obraz nie istnieje' }, { status: 404 })
  }

  // Usuwamy plik z dysku (best-effort; jesli go nie ma, ignorujemy)
  if (image.url.startsWith('/uploads/')) {
    const filepath = path.join(process.cwd(), 'public', image.url.replace(/^\//, ''))
    try {
      await unlink(filepath)
    } catch {
      // plik moze juz nie istniec po recznym czyszczeniu — ok
    }
  }

  await prisma.unitImage.delete({ where: { id: params.imageId } })

  // Jesli skasowalismy glowne, podnies pierwszy z pozostalych do isPrimary
  if (image.isPrimary) {
    const next = await prisma.unitImage.findFirst({
      where: { unitId: params.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    })
    if (next) {
      await prisma.unitImage.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const image = await prisma.unitImage.findUnique({ where: { id: params.imageId } })
  if (!image || image.unitId !== params.id) {
    return NextResponse.json({ error: 'Obraz nie istnieje' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { isPrimary, position, kind } = body as {
    isPrimary?: boolean
    position?: number
    kind?: string
  }

  const ALLOWED_KIND = ['RZUT_3D', 'DOLL_HOUSE', 'WNETRZE', 'WIDOK_Z_OKNA', 'INNE']

  if (isPrimary === true) {
    // Zdejmij isPrimary z pozostalych zdjec tego lokalu, ustaw na obecnym
    await prisma.$transaction([
      prisma.unitImage.updateMany({ where: { unitId: params.id, isPrimary: true }, data: { isPrimary: false } }),
      prisma.unitImage.update({ where: { id: params.imageId }, data: { isPrimary: true } }),
    ])
  } else if (typeof position === 'number') {
    await prisma.unitImage.update({ where: { id: params.imageId }, data: { position } })
  } else if (typeof kind === 'string') {
    if (!ALLOWED_KIND.includes(kind)) {
      return NextResponse.json({ error: 'Nieprawidlowa kategoria zdjecia' }, { status: 400 })
    }
    await prisma.unitImage.update({ where: { id: params.imageId }, data: { kind } })
  }

  const updated = await prisma.unitImage.findUnique({ where: { id: params.imageId } })
  return NextResponse.json({ image: updated })
}
