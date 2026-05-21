import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildClientDiff, commitClientImport } from '@/lib/clients-import'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

/**
 * POST /api/clients/import — multipart form-data: file (xlsx), mode (preview|commit).
 * Gate permission 'clients' przez middleware. preview = diff bez zapisu;
 * commit = ponowny parse + zapis nowych klientów w transakcji (PESEL i reszta
 * danych wrażliwych szyfrowane automatycznie przez prisma extension).
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

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    if (mode === 'commit') {
      return NextResponse.json(await commitClientImport(buffer))
    }
    return NextResponse.json(await buildClientDiff(buffer))
  } catch (e: any) {
    console.error('[clients.import] error:', e)
    return NextResponse.json(
      { error: e?.message || 'Wystąpił błąd przetwarzania pliku' },
      { status: 500 },
    )
  }
}
