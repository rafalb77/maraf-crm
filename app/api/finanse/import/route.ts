import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildDiff, commitImport } from '@/lib/finanse-import'

export const runtime = 'nodejs'

// POST /api/finanse/import?mode=preview|commit
// multipart/form-data: field `file` = xlsx
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mode = req.nextUrl.searchParams.get('mode') === 'commit' ? 'commit' : 'preview'

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Nieprawidlowy form-data' }, { status: 400 })
  }
  const file = formData.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Brak pliku w polu "file"' }, { status: 400 })
  }
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    if (mode === 'preview') {
      const diff = await buildDiff(buffer)
      // Skrocony output zeby nie wysylac mega-JSON-a do przegladarki
      return NextResponse.json({
        mode: 'preview',
        perSheetCounts: diff.perSheetCounts,
        newVendors: diff.newVendors,
        existingVendorsCount: diff.existingVendors.length,
        newInvoicesCount: diff.newInvoices.length,
        duplicatesCount: diff.duplicateInvoices.length,
        skippedCount: diff.skipped.length,
        skipped: diff.skipped.slice(0, 50),
        // sample 10 first invoices
        sampleNewInvoices: diff.newInvoices.slice(0, 10).map((i) => ({
          sheet: i.sheetName,
          row: i.rowIndex,
          vendor: i.vendorName,
          subVendor: i.subVendor,
          number: i.number,
          issueDate: i.issueDate,
          dueDate: i.dueDate,
          amountGross: i.amountGross,
          status: i.status,
          paymentsCount: i.payments.length,
        })),
        totalRowsScanned: diff.totalRowsScanned,
      })
    }

    const result = await commitImport(buffer, session.user.id || undefined)
    return NextResponse.json({ mode: 'commit', ...result })
  } catch (e: any) {
    return NextResponse.json({
      error: 'Blad importu: ' + (e?.message || String(e)),
    }, { status: 500 })
  }
}
