import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit-log'
import { saveSitePhoto, validateSitePhoto } from '@/lib/budowa-uploads'

export const runtime = 'nodejs'

/**
 * POST /api/budowa/checkin/photos — JEDNO zdjęcie per request (FormData: reportId, file,
 * caption?). Celowo pojedynczo: przy słabym zasięgu na budowie każde zdjęcie ma własny
 * retry, a padnięty upload nie unieważnia raportu ani pozostałych zdjęć.
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
    return NextResponse.json({ error: 'Nieprawidłowe dane' }, { status: 400 })
  }

  const reportId = String(form.get('reportId') || '')
  const file = form.get('file')
  if (!reportId || !(file instanceof File)) {
    return NextResponse.json({ error: 'Brak zdjęcia lub raportu' }, { status: 400 })
  }

  const report = await prisma.siteReport.findUnique({
    where: { id: reportId },
    select: { id: true, investmentId: true },
  })
  if (!report) {
    return NextResponse.json({ error: 'Raport nie istnieje' }, { status: 404 })
  }

  const validationError = validateSitePhoto(file)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const caption = String(form.get('caption') || '').slice(0, 300) || null
  const photo = await saveSitePhoto({
    investmentId: report.investmentId,
    reportId: report.id,
    file,
    caption,
    uploadedById: session.user.id || null,
  })

  void audit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: 'CREATE',
    entity: 'SitePhoto',
    entityId: photo.id,
  })

  return NextResponse.json({ id: photo.id, url: photo.url }, { status: 201 })
}
