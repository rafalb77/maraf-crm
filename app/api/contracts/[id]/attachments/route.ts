import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { promises as fs } from 'fs'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'

export const runtime = 'nodejs'

/**
 * POST /api/contracts/[id]/attachments
 * Multipart upload skanu/dokumentu do umowy. Plik zapisywany do
 * /app/public/uploads/contracts/<contractId>/<timestamp>-<safeName> a record
 * `ContractAttachment` do bazy.
 *
 * Pliki są serwowane przez `app/uploads/[...path]/route.ts` (Next.js standalone
 * nie serwuje runtime additions w public/ automatycznie — patrz CLAUDE.md).
 *
 * Audyt: CREATE entity=ContractAttachment (zapisuje rozmiar + nazwa do metadata).
 */

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
])

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB / plik

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findUnique({ where: { id: params.id } })
  if (!contract) return NextResponse.json({ error: 'Umowa nie istnieje' }, { status: 404 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Brak pliku w żądaniu' }, { status: 400 })

  // Obsługujemy zarówno pojedynczy plik (field "file") jak i wiele (field "files")
  const files: File[] = []
  const single = formData.get('file')
  if (single && single instanceof File) files.push(single)
  const multi = formData.getAll('files')
  for (const f of multi) if (f instanceof File) files.push(f)
  if (files.length === 0) return NextResponse.json({ error: 'Brak pliku' }, { status: 400 })

  const dir = path.join(process.cwd(), 'public', 'uploads', 'contracts', params.id)
  await fs.mkdir(dir, { recursive: true })

  const meta = extractRequestMeta(req)
  const created: any[] = []

  for (const file of files) {
    if (file.size === 0) continue
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Plik ${file.name} przekracza limit ${MAX_BYTES / 1024 / 1024} MB` },
        { status: 413 },
      )
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Plik ${file.name}: typ ${file.type} nie jest dozwolony (PDF, JPG, PNG, DOCX)` },
        { status: 415 },
      )
    }

    // Sanityzacja nazwy + timestamp prefix dla unikalności
    const safeName = file.name.replace(/[^\w.\-]/g, '_').slice(0, 120)
    const filename = `${Date.now()}-${safeName}`
    const fullPath = path.join(dir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(fullPath, buffer)

    const attachment = await prisma.contractAttachment.create({
      data: {
        contractId: params.id,
        filename: file.name,
        url: `/uploads/contracts/${params.id}/${filename}`,
        size: file.size,
      },
    })

    void audit({
      action: 'CREATE',
      userId: (session.user as any)?.id,
      userEmail: session.user?.email,
      entity: 'ContractAttachment',
      entityId: attachment.id,
      path: req.nextUrl.pathname,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { contractId: params.id, filename: file.name, size: file.size },
    })

    created.push(attachment)
  }

  return NextResponse.json({ attachments: created }, { status: 201 })
}
