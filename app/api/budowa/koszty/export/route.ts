import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as XLSX from 'xlsx'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadBudowaCostData, isOverdueUnpaid, remaining, payable } from '@/lib/budowa-alerts'

export const dynamic = 'force-dynamic'

/**
 * GET /api/budowa/koszty/export — zestawienie kosztów budowy do xlsx (moduł Budowa, Etap 3).
 * Filtry z query (stage/vendor/pay/from/to) — takie same jak w tabeli /budowa/koszty.
 * Eksportuje FV przypisane do aktywnej inwestycji. Permission 'budowa' egzekwuje middleware.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const investment = await prisma.investment.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
  if (!investment) return NextResponse.json({ error: 'Brak aktywnej inwestycji' }, { status: 400 })

  const data = await loadBudowaCostData(investment.id)
  if (!data) return NextResponse.json({ error: 'Brak danych' }, { status: 400 })

  const q = req.nextUrl.searchParams
  const fStage = q.get('stage') || ''
  const fVendor = q.get('vendor') || ''
  const fPay = q.get('pay') || 'all'
  const fFrom = q.get('from') || ''
  const fTo = q.get('to') || ''
  const now = new Date()
  const stageName = new Map(data.stages.map((s) => [s.id, s.name]))
  const COMPANY: Record<string, string> = { MARAF: 'Maraf', MARAF_DEVELOPMENT: 'Maraf Development' }

  const rows = data.invoices
    .filter((i) => i.investmentId === investment.id)
    .filter((i) => {
      if (fStage && (fStage === '_none' ? i.constructionStageId : i.constructionStageId !== fStage)) return false
      if (fVendor && i.vendorName !== fVendor) return false
      const rem = remaining(i)
      if (fPay === 'unpaid' && rem <= 0.01) return false
      if (fPay === 'overdue' && !isOverdueUnpaid(i, now)) return false
      if (fPay === 'paid' && rem > 0.01) return false
      const iso = i.issueDate.toISOString().slice(0, 10)
      if (fFrom && iso < fFrom) return false
      if (fTo && iso > fTo) return false
      return true
    })
    .sort((a, b) => a.issueDate.getTime() - b.issueDate.getTime())
    .map((i) => ({
      'Nr FV': i.number,
      Firma: COMPANY[i.company] || i.company,
      Wykonawca: i.vendorName,
      Podwykonawca: i.subVendor || '',
      Etap: i.constructionStageId ? stageName.get(i.constructionStageId) || '' : '',
      Status: i.status,
      'Data wystawienia': i.issueDate.toISOString().slice(0, 10),
      'Termin płatności': i.dueDate ? i.dueDate.toISOString().slice(0, 10) : '',
      'Netto': i.amountNet,
      'Brutto': i.amountGross,
      'Należne (po potrąceniach)': payable(i),
      'Zapłacono': i.sumPaid,
      'Do zapłaty': Math.max(0, remaining(i)),
      'Po terminie': isOverdueUnpaid(i, now) ? 'TAK' : '',
    }))

  const ws = XLSX.utils.json_to_sheet(rows)
  // suma na dole
  const totalRow = rows.length + 2
  XLSX.utils.sheet_add_aoa(
    ws,
    [
      [
        'RAZEM',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        rows.reduce((s, r) => s + (r['Netto'] as number), 0),
        rows.reduce((s, r) => s + (r['Brutto'] as number), 0),
        '',
        '',
        rows.reduce((s, r) => s + (r['Do zapłaty'] as number), 0),
        '',
      ],
    ],
    { origin: `A${totalRow}` },
  )
  ws['!cols'] = [
    { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Koszty budowy')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

  const stamp = now.toISOString().slice(0, 10)
  const fname = `koszty-budowy-${investment.name.replace(/[^\w]+/g, '-')}-${stamp}.xlsx`
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  })
}
