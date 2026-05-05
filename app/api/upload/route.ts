import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const unitId = formData.get('unitId') as string

  if (!file || !unitId) {
    return NextResponse.json({ error: 'Missing file or unitId' }, { status: 400 })
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Niedozwolony typ pliku' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'floorplans')
  await mkdir(uploadsDir, { recursive: true })

  const ext = file.name.split('.').pop()
  const filename = `${unitId}-${Date.now()}.${ext}`
  const filepath = path.join(uploadsDir, filename)
  await writeFile(filepath, buffer)

  const url = `/uploads/floorplans/${filename}`
  await prisma.unit.update({ where: { id: unitId }, data: { floorPlanUrl: url } })

  return NextResponse.json({ url }, { status: 201 })
}
