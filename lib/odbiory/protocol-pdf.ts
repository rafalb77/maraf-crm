// PDF protokołu odbioru — ten sam HTML co widok do druku (protocol-html.ts), renderowany
// przez puppeteer-core + Google Chrome (konfiguracja jak w lib/pdf-generator.ts — tam
// komentarze, dlaczego legacy headless i flagi crashpad). Obrazy (rzut, podpisy, zdjęcia)
// są osadzone jako base64, bo Chrome w kontenerze nie ma sesji CRM.

import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { PROTOCOL_CSS, buildProtocolHtml, protocolFilename, type ProtocolData } from './protocol-html'

const EXECUTABLE_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  // Windows (dev)
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean) as string[]

async function findExecutablePath(): Promise<string> {
  for (const p of EXECUTABLE_PATHS) {
    try {
      await fs.access(p)
      return p
    } catch {}
  }
  throw new Error('Nie znaleziono przeglądarki Chrome do wygenerowania PDF (PUPPETEER_EXECUTABLE_PATH)')
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = (await import('puppeteer-core')).default
  const executablePath = await findExecutablePath()
  // Linux/Docker (produkcja): flagi sandbox + crashpad i legacy headless — identycznie jak
  // lib/pdf-generator.ts (oferty). Windows/macOS (dev): te flagi psują start Chrome, więc minimalne.
  const isLinux = process.platform === 'linux'
  const browser = await puppeteer.launch({
    executablePath,
    args: isLinux
      ? [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--crash-dumps-dir=/tmp/chrome-crashes',
          '--user-data-dir=/tmp/chrome-user-data',
          '--disable-crash-reporter',
          '--disable-breakpad',
          '--disable-features=Crashpad',
          '--disable-extensions',
          '--no-first-run',
          '--no-default-browser-check',
        ]
      : ['--no-sandbox', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check'],
    headless: isLinux ? true : 'new',
    dumpio: false,
    timeout: 45000,
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 })
    // Rzut PW (WebP ~5500 px) Chrome zapisałby w PDF bezstratnie (~13 MB) — za dużo na mail.
    // Przerysowujemy go w przeglądarce do JPEG max 2600 px (w PDF zostaje jako JPEG, ~0,5 MB);
    // podpisy (PNG) i zdjęcia (JPEG) zostają bez zmian.
    await page.evaluate(async () => {
      const MAX = 2600
      const images = Array.from(document.querySelectorAll('image')) as SVGImageElement[]
      for (const el of images) {
        const href = el.getAttribute('href') || el.getAttribute('xlink:href') || ''
        if (!href.startsWith('data:image/webp')) continue
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('img'))
          img.src = href
        })
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const jpeg = canvas.toDataURL('image/jpeg', 0.82)
        el.setAttribute('href', jpeg)
        el.setAttribute('xlink:href', jpeg)
      }
    })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: 120000 })
    return Buffer.from(pdf)
  } finally {
    await browser.close().catch(() => {})
  }
}

export async function generateProtocolPdf(inspectionId: string, opts: { withPhotos?: boolean; mono?: boolean } = {}): Promise<{ pdf: Buffer; data: ProtocolData; filename: string }> {
  const built = await buildProtocolHtml(inspectionId, { ...opts, assets: 'embed' })
  if (!built) throw new Error('Odbiór nie istnieje')
  const doc = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${built.data.r.number}</title><style>body{margin:0;background:#fff}${PROTOCOL_CSS}</style></head><body>${built.html}</body></html>`
  const pdf = await htmlToPdf(doc)
  return { pdf, data: built.data, filename: protocolFilename(built.data.r.number, built.data.r.scopeName) }
}

/** Zapisuje PDF w uploads/odbiory/<id>/ i ustawia Inspection.protocolUrl (ostatnia wersja). */
export async function storeProtocolPdf(inspectionId: string, pdf: Buffer, filename: string): Promise<string> {
  const dir = path.join(process.cwd(), 'public', 'uploads', 'odbiory', inspectionId)
  await fs.mkdir(dir, { recursive: true })
  const stored = `${Date.now()}-${filename}`
  await fs.writeFile(path.join(dir, stored), pdf)
  const url = `/uploads/odbiory/${inspectionId}/${stored}`
  await prisma.inspection.update({ where: { id: inspectionId }, data: { protocolUrl: url } })
  return url
}
