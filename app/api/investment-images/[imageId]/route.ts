import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/auth-utils'
import { unlink } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'

const ALLOWED_KIND = ['ZEWNETRZNE', 'WEWNETRZNE', 'OTOCZENIE', 'INNE']

export async function DELETE(_req: NextRequest, { params }: { params: { imageId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.email)) {
    return NextResponse.json({ error: 'Tylko admin' }, { status: 403 })
  }

  const image = await prisma.investmentImage.findUnique({ where: { id: params.imageId } })
  if (!image) {
    return NextResponse.json({ error: 'Obraz nie istnieje' }, { status: 404 })
  }

  if (image.url.startsWith('/uploads/')) {
    const filepath = path.join(process.cwd(), 'public', image.url.replace(/^\//, ''))
    try {
      await unlink(filepath)
    } catch {
      // plik moze juz nie istniec — ok
    }
  }

  await prisma.investmentImage.delete({ where: { id: params.imageId } })

  if (image.isPrimary) {
    const next = await prisma.investmentImage.findFirst({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    })
    if (next) {
      await prisma.investmentImage.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { imageId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.email)) {
    return NextResponse.json({ error: 'Tylko admin' }, { status: 403 })
  }

  const image = await prisma.investmentImage.findUnique({ where: { id: params.imageId } })
  if (!image) {
    return NextResponse.json({ error: 'Obraz nie istnieje' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { isPrimary, position, kind } = body as {
    isPrimary?: boolean
    position?: number
    kind?: string
  }

  if (isPrimary === true) {
    await prisma.$transaction([
      prisma.investmentImage.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } }),
      prisma.investmentImage.update({ where: { id: params.imageId }, data: { isPrimary: true } }),
    ])
  } else if (typeof position === 'number') {
    await prisma.investmentImage.update({ where: { id: params.imageId }, data: { position } })
  } else if (typeof kind === 'string') {
    if (!ALLOWED_KIND.includes(kind)) {
      return NextResponse.json({ error: 'Nieprawidlowa kategoria' }, { status: 400 })
    }
    await prisma.investmentImage.update({ where: { id: params.imageId }, data: { kind } })
  }

  const updated = await prisma.investmentImage.findUnique({ where: { id: params.imageId } })
  return NextResponse.json({ image: updated })
}
