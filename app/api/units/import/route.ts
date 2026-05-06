import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildDiff, commitImport } from '@/lib/units-import'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

/**
 * POST /api/units/import
 * Multipart form-data:
 *   - file: plik xlsx
 *   - mode: 'preview' | 'commit'
 *   - syncStatusAndClients: 'true' | 'false'
 *
 * preview: czyta plik, porównuje z bazą, zwraca diff. Nic nie zapisuje.
 * commit: czyta plik PONOWNIE, robi diff i zapisuje w transakcji.
 *   (Czytamy ponownie, nie ufamy że klient prześle to samo co w preview.)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Niepoprawne dane formularza' }, { status: 400 })
  }

  const file = form.get('file')
  const mode = String(form.get('mode') || 'preview')
  const syncStatusAndClients = String(form.get('syncStatusAndClients') || 'false') === 'true'

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Brak pliku' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Plik jest pusty' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Plik za duży (limit: ${MAX_FILE_SIZE / 1024 / 1024} MB)` },
      { status: 400 },
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const opts = { syncStatusAndClients }

  try {
    if (mode === 'commit') {
      const result = await commitImport(buffer, opts)
      return NextResponse.json(result)
    }
    const result = await buildDiff(buffer, opts)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[units.import] error:', e)
    return NextResponse.json(
      { error: e?.message || 'Wystąpił błąd przetwarzania pliku' },
      { status: 500 },
    )
  }
}
