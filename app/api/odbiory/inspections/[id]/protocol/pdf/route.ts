import { NextRequest } from 'next/server'
import { audit } from '@/lib/audit-log'
import { generateProtocolPdf } from '@/lib/odbiory/protocol-pdf'
import { jsonError, requireUser } from '@/lib/odbiory/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** GET /api/odbiory/inspections/[id]/protocol/pdf?zdjecia=1&kolor=0 — PDF protokołu do pobrania. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  const withPhotos = req.nextUrl.searchParams.get('zdjecia') === '1'
  const mono = req.nextUrl.searchParams.get('kolor') === '0'
  try {
    const { pdf, filename } = await generateProtocolPdf(params.id, { withPhotos, mono })
    void audit({ userId: user.id, userEmail: user.email, action: 'EXPORT', entity: 'Inspection', entityId: params.id, metadata: { protocolPdf: true, withPhotos } })
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (e: any) {
    console.error('[odbiory] protocol pdf', e)
    return jsonError(e?.message || 'Nie udało się wygenerować PDF', 500)
  }
}
