// Zapis skanów/dokumentów sprawy na dysk + rekord CaseDocument.
// Współdzielone przez endpointy /api/cases/[id]/documents i /api/cases/[id]/entries.
//
// Pliki lądują w /app/public/uploads/cases/<caseId>/<timestamp>-<safeName> i są
// serwowane przez catch-all app/uploads/[...path]/route.ts (standalone nie serwuje
// runtime additions — patrz CLAUDE.md). OCR (faza 3) podpina się przez runOcr().

import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from './prisma'
import { runOcr } from './ocr'

export const CASE_ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])

export const CASE_MAX_BYTES = 25 * 1024 * 1024 // 25 MB / skan

/** Zwraca komunikat błędu (string) gdy plik niedozwolony, albo null gdy OK. */
export function validateCaseFile(file: File): string | null {
  if (file.size === 0) return `Plik ${file.name} jest pusty`
  if (file.size > CASE_MAX_BYTES) {
    return `Plik ${file.name} przekracza limit ${CASE_MAX_BYTES / 1024 / 1024} MB`
  }
  if (file.type && !CASE_ALLOWED_TYPES.has(file.type)) {
    return `Plik ${file.name}: typ ${file.type} nie jest dozwolony (PDF, JPG, PNG)`
  }
  return null
}

export async function saveCaseDocument(opts: {
  caseId: string
  entryId?: string | null
  file: File
  uploadedById?: string | null
}) {
  const { caseId, entryId, file, uploadedById } = opts
  const dir = path.join(process.cwd(), 'public', 'uploads', 'cases', caseId)
  await fs.mkdir(dir, { recursive: true })

  const safeName = file.name.replace(/[^\w.\-]/g, '_').slice(0, 120)
  const filename = `${Date.now()}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(path.join(dir, filename), buffer)

  const doc = await prisma.caseDocument.create({
    data: {
      caseId,
      entryId: entryId || null,
      filename: file.name,
      url: `/uploads/cases/${caseId}/${filename}`,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      uploadedById: uploadedById || null,
      ocrStatus: 'PENDING',
    },
  })

  // OCR w tle (fire-and-forget) — nie blokuje odpowiedzi. Serwer Node (Coolify,
  // nie serverless) kontynuuje promisy po wysłaniu response. Błędy łapie runOcr.
  void runOcr(doc.id)

  return doc
}

/** Best-effort usunięcie pliku z dysku (po skasowaniu rekordu). Nie rzuca. */
export async function deleteCaseFile(url: string): Promise<void> {
  try {
    // url = /uploads/cases/<caseId>/<filename> → public/uploads/...
    const rel = url.replace(/^\/uploads\//, '')
    const full = path.join(process.cwd(), 'public', 'uploads', rel)
    const base = path.resolve(process.cwd(), 'public', 'uploads')
    if (!path.resolve(full).startsWith(base + path.sep)) return // anty path-traversal
    await fs.unlink(full)
  } catch {
    // plik mógł już nie istnieć — ignorujemy
  }
}
