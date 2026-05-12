// PDF generator dla ofert.
// Uzywa puppeteer-core + system Google Chrome stable (Dockerfile instaluje
// z oficjalnego repo Google). PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable.
//
// Patrz docs/changelog.md (2026-05-09 i 2026-05-12) — dlaczego Google Chrome
// a nie Debian chromium (bug crashpad) i dlaczego user nextjs MUSI miec HOME.
//
// W development (lokalnie bez Chrome) — wyrzuca blad ktorego zlapie caller.

import { prisma } from './prisma'
import { getOfferPdfHtml, type OfferForPdf } from './offer-pdf-html'

const DEFAULT_EXECUTABLE_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean) as string[]

async function findExecutablePath(): Promise<string> {
  const fs = await import('fs/promises')
  for (const p of DEFAULT_EXECUTABLE_PATHS) {
    try {
      await fs.access(p)
      return p
    } catch {
      // continue
    }
  }
  throw new Error(
    'Nie znaleziono Chromium. Ustaw PUPPETEER_EXECUTABLE_PATH lub zainstaluj chromium (apt-get install chromium).',
  )
}

export async function generateOfferPdf(offerId: string): Promise<Buffer> {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      client: true,
      items: { orderBy: { position: 'asc' } },
    },
  })
  if (!offer) throw new Error('Nie znaleziono oferty')

  const settings = await prisma.settings.findMany({
    where: { key: { in: ['companyName', 'investmentName', 'emailSignature', 'bankAccount'] } },
  })
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  const html = await getOfferPdfHtml(offer as unknown as OfferForPdf, settingsMap)

  // Dynamiczny import puppeteer — zeby nie ladowac na boot (kosztowny)
  const puppeteer = (await import('puppeteer-core')).default
  const executablePath = await findExecutablePath()

  const browser = await puppeteer.launch({
    executablePath,
    args: [
      // Wymagane w Docker (nie ma sandbox/uid 0)
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // Brak /dev/shm w Docker default
      '--disable-dev-shm-usage',
      // Brak GPU w server runtime
      '--disable-gpu',
      // Crashpad WYMAGA tych dwoch w Chromium 137+ na Debian:
      // bez nich chrome_crashpad_handler padl z "--database is required"
      '--crash-dumps-dir=/tmp/chrome-crashes',
      '--user-data-dir=/tmp/chrome-user-data',
      // Wylacz crash reporter (i tak nie potrzebny w runtime)
      '--disable-crash-reporter',
      '--disable-breakpad',
      '--disable-features=Crashpad',
      // Mniej pamieci
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    // Legacy headless (--headless flag, NIE --headless=new):
    // 'new' headless w Chrome 137+ wymaga multi-process + crashpad,
    // ktory ma bug "--database is required" w Debian 12.
    // Legacy uses single-process bez crashpad.
    headless: true,
    dumpio: false,
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close().catch(() => {})
  }
}
