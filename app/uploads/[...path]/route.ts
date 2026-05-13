import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Serwowanie plików z `/app/public/uploads/<...>` przez API route.
 *
 * **Dlaczego nie statyczny `public/uploads/`?**
 *   Next.js w trybie `output: 'standalone'` (next.config.js) "trace'uje" listę
 *   plików w `public/` w **buildtime** i tylko te serwuje przez wbudowany handler.
 *   Pliki dodane w runtime — przez Coolify persistent volume (`/app/public/uploads`)
 *   albo przez nasz importer (`scripts/import-floorplans.js`) — **nie są widoczne**
 *   dla standalone servera → zwraca 404.
 *
 * Ten endpoint czyta plik bezpośrednio z fs (cwd-relative `public/uploads/`).
 * URL `/uploads/floorplans/B1.1.M1-...pdf` → odczyt `/app/public/uploads/floorplans/B1.1.M1-...pdf`.
 *
 * Middleware matcher wyklucza URL-e z kropką w nazwie (`.*\.`), więc gate'u permission
 * przez middleware tu nie ma — sami sprawdzamy session.
 *
 * Bezpieczeństwo:
 *  - wymaga zalogowanego usera (401 jeśli nie)
 *  - sanityzacja segmentów (`..`, `\0`, `/` w jednym segmencie blokowane)
 *  - dodatkowo `path.resolve` + check że pozostajemy w `UPLOADS_DIR`
 */

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.dxf': 'application/dxf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const segments = (params.path || []).map((s) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  })

  if (
    segments.length === 0 ||
    segments.some((s) => s.includes('..') || s.includes('\0') || s.includes('/') || s.includes('\\'))
  ) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const fullPath = path.join(UPLOADS_DIR, ...segments)
  const resolved = path.resolve(fullPath)
  const baseResolved = path.resolve(UPLOADS_DIR)
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    const stat = await fs.stat(resolved)
    if (!stat.isFile()) {
      return new NextResponse('Not Found', { status: 404 })
    }
    const buf = await fs.readFile(resolved)
    const ext = path.extname(resolved).toLowerCase()
    const contentType = MIME[ext] || 'application/octet-stream'
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err: any) {
    if (err && err.code === 'ENOENT') {
      return new NextResponse('Not Found', { status: 404 })
    }
    console.error('upload serve error:', err)
    return new NextResponse('Internal Error', { status: 500 })
  }
}
