import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildUnitsLinkDiff, commitUnitsLink } from '@/lib/contract-units-link'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

/**
 * POST /api/sales/link-units — multipart: file (xlsx eksportu lokali z kolumną
 * "Umowa"), mode (preview|commit). Tworzy powiązania ContractUnit + ClientUnit
 * dla istniejących lokali/umów/klientów. Gate 'sales' przez middleware.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Niepoprawne dane formularza' }, { status: 400 })
  }

  const file = form.get('file')
  const mode = String(form.get('mode') || 'preview')

  if (!(file instanceof File)) return NextResponse.json({ error: 'Brak pliku' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'Plik jest pusty' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `Plik za duży (limit: ${MAX_FILE_SIZE / 1024 / 1024} MB)` }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    if (mode === 'commit') return NextResponse.json(await commitUnitsLink(buffer))
    return NextResponse.json(await buildUnitsLinkDiff(buffer))
  } catch (e: any) {
    console.error('[sales.link-units] error:', e)
    return NextResponse.json({ error: e?.message || 'Wystąpił błąd przetwarzania pliku' }, { status: 500 })
  }
}
