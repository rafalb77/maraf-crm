// PDF generator dla ofert.
// Uzywa puppeteer-core + system Chromium (Dockerfile instaluje chromium
// przez apt). PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium ustawione w env.
//
// W development (lokalnie bez Chromium) — wyrzuca blad ktorego zlapie caller.

import { prisma } from './prisma'
import { getOfferPdfHtml, type OfferForPdf } from './offer-pdf-html'

const DEFAULT_EXECUTABLE_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
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
      // Wylacz crash reporter — w Chromium 137+ chrome_crashpad_handler
      // wymaga --database arg, ktorego nie dostarcza. Padalo "--database is required".
      '--disable-crash-reporter',
      '--disable-breakpad',
      // Mniej pamieci
      '--disable-extensions',
      '--disable-features=site-per-process',
    ],
    headless: true,
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
