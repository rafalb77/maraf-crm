import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildPreview, commitImport } from '@/lib/przedmiar-konrad-import'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

/**
 * POST /api/przeroby/przedmiary/upload
 * Multipart form-data:
 *   - file: plik xlsx (Przedmiar Konrada — arkusz "Ściany i słupy żelb.")
 *   - mode: 'preview' | 'commit'
 *
 * preview: czyta plik, porównuje z bazą (FloorSummary konstrukcja-zelbetowa),
 *          zwraca diff per kondygnacja. Nic nie zapisuje.
 * commit:  czyta plik PONOWNIE i robi import w transakcji Prisma.
 *          Idempotent — zastępuje istniejące FloorSummary tej kondygnacji.
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

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  try {
    if (mode === 'commit') {
      const userEmail = (session.user as any)?.email || null
      const result = await commitImport(buffer, userEmail)
      return NextResponse.json(result)
    }
    const result = await buildPreview(buffer)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[przedmiary.upload] error:', e)
    return NextResponse.json(
      { error: e?.message || 'Wystąpił błąd przetwarzania pliku' },
      { status: 500 },
    )
  }
}
