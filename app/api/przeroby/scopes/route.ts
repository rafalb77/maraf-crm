import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, description } = await req.json()
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Nazwa wymagana' }, { status: 400 })
  }

  const baseSlug = slugify(name)
  let slug = baseSlug
  let i = 2
  while (await prisma.workScope.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${i++}`
  }

  const last = await prisma.workScope.findFirst({ orderBy: { order: 'desc' } })
  const order = (last?.order || 0) + 10

  const scope = await prisma.workScope.create({
    data: { name: name.trim(), slug, description: description || null, order },
  })

  return NextResponse.json(scope)
}
