import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { previewImport, commitImport } from '@/lib/harmonogram-import'

export const runtime = 'nodejs'

// POST /api/budowa/import?mode=preview|commit — multipart/form-data, pole `file` = xlsx.
// Importuje harmonogram do aktywnej inwestycji. Permission 'budowa' (middleware).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mode = req.nextUrl.searchParams.get('mode') === 'commit' ? 'commit' : 'preview'

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy form-data' }, { status: 400 })
  }
  const file = formData.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Brak pliku w polu „file"' }, { status: 400 })
  }
  const buffer = Buffer.from(await file.arrayBuffer())

  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!investment) {
    return NextResponse.json({ error: 'Brak aktywnej inwestycji' }, { status: 400 })
  }

  try {
    if (mode === 'preview') {
      const preview = await previewImport(investment.id, buffer)
      return NextResponse.json({ mode: 'preview', ...preview })
    }
    const result = await commitImport(investment.id, buffer)
    void audit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'CREATE',
      entity: 'ConstructionTask',
      metadata: { import: result },
    })
    return NextResponse.json({ mode: 'commit', ...result })
  } catch (e: any) {
    return NextResponse.json({ error: 'Błąd importu: ' + (e?.message || String(e)) }, { status: 400 })
  }
}
