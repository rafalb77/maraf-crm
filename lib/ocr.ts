// OCR skanów spraw — natywny Tesseract + poppler (pdftoppm), wywoływane przez
// child_process. Binaria instalowane w Dockerfile (tesseract-ocr, tesseract-ocr-pol,
// poppler-utils). Lokalnie (Windows) binaria zwykle nie istnieją → runOcr łapie błąd
// i ustawia ocrStatus=FAILED; OCR testujemy na produkcji po rebuildzie.
//
// Strategia:
//  - obraz (JPG/PNG/WEBP) → tesseract <plik> stdout -l pol
//  - PDF cyfrowy (z warstwą tekstu) → pdf-parse (szybkie, dokładne)
//  - PDF skanowany (bez tekstu) → pdftoppm → PNG per strona → tesseract
//
// Wynik zapisywany do CaseDocument.ocrText (przeszukiwany przez /api/cases?q=).

import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { prisma } from './prisma'

const exec = promisify(execFile)

const OCR_LANG = process.env.OCR_LANG || 'pol'
const MAX_PAGES = 15 // limit stron dla skanowanych PDF (czas OCR)
const EXEC_TIMEOUT = 120_000 // 2 min / proces
const MAX_OCR_CHARS = 100_000 // limit zapisu do bazy

function publicPathFromUrl(url: string): string {
  const rel = url.replace(/^\/uploads\//, '')
  return path.join(process.cwd(), 'public', 'uploads', rel)
}

async function ocrImage(file: string): Promise<string> {
  const { stdout } = await exec('tesseract', [file, 'stdout', '-l', OCR_LANG], {
    timeout: EXEC_TIMEOUT,
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout || ''
}

async function ocrPdf(file: string): Promise<string> {
  // 1) Warstwa tekstowa (cyfrowy PDF) — szybka ścieżka.
  try {
    // pdf-parse nie ma typów dla subpath; importujemy lib bezpośrednio (omija debug-mode index.js).
    // @ts-ignore
    const mod: any = await import('pdf-parse/lib/pdf-parse.js')
    const pdfParse = (mod.default || mod) as (b: Buffer) => Promise<{ text: string }>
    const buf = await fs.readFile(file)
    const parsed = await pdfParse(buf)
    const text = (parsed.text || '').trim()
    if (text.length >= 40) return text
  } catch {
    /* brak warstwy tekstu / błąd parsera — przechodzimy do rasteryzacji */
  }

  // 2) Skan — rasteryzacja pdftoppm → OCR per strona.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'caseocr-'))
  try {
    const prefix = path.join(tmp, 'page')
    await exec('pdftoppm', ['-png', '-r', '200', file, prefix], { timeout: EXEC_TIMEOUT })
    const pngs = (await fs.readdir(tmp)).filter((f) => f.endsWith('.png')).sort().slice(0, MAX_PAGES)
    const texts: string[] = []
    for (const p of pngs) texts.push(await ocrImage(path.join(tmp, p)))
    return texts.join('\n\n')
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Uruchamia OCR dla dokumentu i zapisuje wynik. Bezpieczne fire-and-forget
 * (łapie wszystkie błędy, nie rzuca). Aktualizuje ocrStatus: DONE | FAILED | SKIPPED.
 */
export async function runOcr(docId: string): Promise<void> {
  const doc = await prisma.caseDocument.findUnique({ where: { id: docId } })
  if (!doc) return

  try {
    const file = publicPathFromUrl(doc.url)
    let text = ''

    if (doc.mimeType === 'application/pdf') {
      text = await ocrPdf(file)
    } else if (doc.mimeType.startsWith('image/')) {
      text = await ocrImage(file)
    } else {
      await prisma.caseDocument.update({ where: { id: docId }, data: { ocrStatus: 'SKIPPED' } })
      return
    }

    text = text.replace(/[ \t]+\n/g, '\n').trim().slice(0, MAX_OCR_CHARS)
    await prisma.caseDocument.update({
      where: { id: docId },
      data: { ocrText: text || null, ocrStatus: text ? 'DONE' : 'FAILED' },
    })
  } catch (e: any) {
    console.error('[ocr] runOcr nieudany dla', docId, e?.message || e)
    await prisma.caseDocument
      .update({ where: { id: docId }, data: { ocrStatus: 'FAILED' } })
      .catch(() => {})
  }
}
