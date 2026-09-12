import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { resolveDispatchToken } from '@/lib/odbiory/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

/**
 * GET /api/public/odbiory/w/[token]/photo/[photoId] — zdjęcie usterki z pakietu wykonawcy.
 * Catch-all /uploads wymaga sesji, więc wykonawca dostaje zdjęcia tylko przez token
 * i tylko dla usterek ze swojego pakietu.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string; photoId: string } }) {
  const dispatch = await resolveDispatchToken(params.token)
  if (!dispatch) return new NextResponse('Not found', { status: 404 })
  const photo = await prisma.defectPhoto.findUnique({ where: { id: params.photoId }, select: { url: true, defectId: true } })
  if (!photo || !dispatch.items.some((i) => i.defect.id === photo.defectId)) return new NextResponse('Not found', { status: 404 })
  if (!photo.url.startsWith('/uploads/odbiory/')) return new NextResponse('Not found', { status: 404 })
  const rel = photo.url.replace(/^\/uploads\//, '')
  if (rel.includes('..') || rel.includes('\0')) return new NextResponse('Not found', { status: 404 })
  const root = path.resolve(process.cwd(), 'public', 'uploads')
  const abs = path.resolve(root, rel)
  if (!abs.startsWith(root)) return new NextResponse('Not found', { status: 404 })
  try {
    const buf = await fs.readFile(abs)
    const ext = path.extname(abs).toLowerCase()
    return new NextResponse(buf, {
      status: 200,
      headers: { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'private, max-age=3600' },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
