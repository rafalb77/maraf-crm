import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

// Identyfikator wdrozenia — do wykrywania nowej wersji po deployu (komponent
// VersionWatcher). Priorytet: .next/BUILD_ID (unikalny per build), fallback:
// czas startu procesu (nowy kontener po kazdym deployu = nowa wartosc).
const BOOT = Date.now().toString(36)
function readVersion(): string {
  try {
    return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim() || BOOT
  } catch {
    return BOOT
  }
}
const VERSION = readVersion()

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ v: VERSION }, { headers: { 'cache-control': 'no-store' } })
}
