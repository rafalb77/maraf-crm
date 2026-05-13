import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const images = await prisma.unitImage.findMany({
    where: { unitId: params.id },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ images })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unit = await prisma.unit.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!unit) return NextResponse.json({ error: 'Lokal nie istnieje' }, { status: 404 })

  const formData = await req.formData()
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'Brak plikow' }, { status: 400 })
  }

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Niedozwolony typ pliku: ${file.name} (${file.type}). Akceptowane: JPG, PNG, WebP.` },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Plik za duzy: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.` },
        { status: 400 },
      )
    }
  }

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'units', params.id)
  await mkdir(uploadsDir, { recursive: true })

  const existingCount = await prisma.unitImage.count({ where: { unitId: params.id } })
  const hasPrimary = (await prisma.unitImage.count({ where: { unitId: params.id, isPrimary: true } })) > 0

  const created = []
  let idx = 0
  for (const file of files) {
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const filename = `${Date.now()}-${idx}.${ext}`
    const filepath = path.join(uploadsDir, filename)
    await writeFile(filepath, buffer)

    const url = `/uploads/units/${params.id}/${filename}`
    const isPrimary = !hasPrimary && idx === 0 && existingCount === 0
    const image = await prisma.unitImage.create({
      data: {
        unitId: params.id,
        url,
        position: existingCount + idx,
        isPrimary,
      },
    })
    created.push(image)
    idx++
  }

  return NextResponse.json({ images: created }, { status: 201 })
}
