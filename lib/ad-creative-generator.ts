// Generator PNG kreacji reklamowych Meta Ads.
// Puppeteer-core + system Google Chrome (ten sam setup co lib/pdf-generator.ts).
// Renderuje HTML z lib/ad-creative-html.ts i robi screenshot w wymiarach formatu.
//
// Patrz docs/changelog.md — dlaczego Google Chrome a nie Debian chromium
// i dlaczego legacy headless.

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
    'Nie znaleziono Chromium. Ustaw PUPPETEER_EXECUTABLE_PATH lub zainstaluj Google Chrome.',
  )
}

const LAUNCH_ARGS = [
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

/**
 * Renderuje HTML i zwraca PNG o dokladnych wymiarach width×height.
 * deviceScaleFactor=1 → 1 px CSS = 1 px obrazu (kreacje maja juz docelowe wymiary Meta).
 */
export async function generateAdCreativePng(
  html: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const puppeteer = (await import('puppeteer-core')).default
  const executablePath = await findExecutablePath()

  const browser = await puppeteer.launch({
    executablePath,
    args: LAUNCH_ARGS,
    headless: true,
    dumpio: false,
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 })
    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    })
    return Buffer.from(png)
  } finally {
    await browser.close().catch(() => {})
  }
}
