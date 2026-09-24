import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as XLSX from 'xlsx'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit, extractRequestMeta } from '@/lib/audit-log'
import {
  buildBuyerRows,
  buildContractRows,
  contractGross,
  isSignedDeveloperContractInPeriod,
  type ExportContract,
} from '@/lib/sales-export'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sales/export?from=YYYY-MM-DD&to=YYYY-MM-DD[&pesel=1][&address=1]
 * Zestawienie sprzedaży dla banku (XLSX): podpisane umowy DEWELOPERSKIE wg daty
 * podpisania etapu deweloperskiego w okresie, z nabywcami, lokalami, ceną,
 * subrachunkiem OMRP i stanem harmonogramu. Arkusz 2: jeden wiersz na nabywcę.
 * Permission 'sales' egzekwuje middleware (/api/sales). Eksport danych osobowych
 * → wpis AuditLog EXPORT.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams
  const fromRaw = q.get('from') || ''
  const toRaw = q.get('to') || ''
  const withPesel = q.get('pesel') === '1'
  const withAddress = q.get('address') === '1'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    return NextResponse.json({ error: 'Podaj okres: from i to w formacie YYYY-MM-DD' }, { status: 400 })
  }
  // Granice dnia w czasie polskim (daty podpisania zapisane jako północ UTC lub czas lokalny).
  const from = new Date(`${fromRaw}T00:00:00+02:00`)
  const to = new Date(`${toRaw}T23:59:59.999+02:00`)
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: 'Nieprawidłowy okres' }, { status: 400 })
  }

  // Kandydaci: etap deweloperski podpisany (wiersz ContractStage) albo legacy
  // (type=DEWELOPERSKA + status PODPISANA). Dokładny filtr okresu w JS.
  const contracts = await prisma.contract.findMany({
    where: {
      status: { notIn: ['ROZWIAZANA', 'ANULOWANA'] },
      OR: [
        { stages: { some: { stage: 'DEWELOPERSKA', status: 'PODPISANA' } } },
        { type: 'DEWELOPERSKA', status: 'PODPISANA' },
      ],
    },
    include: {
      client: { select: { firstName: true, lastName: true, pesel: true, address: true, zipCode: true, city: true } },
      contractClients: {
        select: {
          position: true,
          client: { select: { firstName: true, lastName: true, pesel: true, address: true, zipCode: true, city: true } },
        },
      },
      stages: { select: { stage: true, status: true, number: true, signedAt: true } },
      contractUnits: {
        select: {
          priceGross: true,
          priceNet: true,
          unit: { select: { number: true, type: true, area: true, escrowSubaccount: true, priceGross: true, priceNet: true } },
        },
      },
      payments: { select: { status: true, plannedAmount: true, paidAmount: true } },
    },
  })

  const selected = (contracts as unknown as ExportContract[]).filter((c) => isSignedDeveloperContractInPeriod(c, from, to))
  const opts = { withPesel, withAddress }
  const rows = buildContractRows(selected, opts)
  const buyerRows = buildBuyerRows(selected, opts)

  const generated = new Date()
  const stampPl = generated.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', hour12: false })
  const periodPl = `${fromRaw.split('-').reverse().join('.')} – ${toRaw.split('-').reverse().join('.')}`
  const title = `Zestawienie sprzedaży — podpisane umowy deweloperskie, okres ${periodPl} (wygenerowano ${stampPl})`

  const wb = XLSX.utils.book_new()

  // Arkusz 1: umowy (tytuł + pusta linia + tabela + suma).
  const ws = XLSX.utils.aoa_to_sheet([[title], []])
  XLSX.utils.sheet_add_json(ws, rows, { origin: 'A3' })
  if (rows.length > 0) {
    const headers = Object.keys(rows[0])
    const totalRow = 3 + rows.length + 1
    const sumOf = (key: string) => rows.reduce((s, r) => s + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0)
    const totals = headers.map((h) => {
      if (h === 'Lp.') return 'RAZEM'
      if (h === 'Nr umowy') return `${rows.length} umów`
      if (h === 'Pow. lokalu [m²]' || h === 'Cena brutto [zł]' || h === 'Harmonogram [zł]' || h === 'Wpłacono [zł]') return Math.round(sumOf(h) * 100) / 100
      if (h === 'Cena netto [zł]') return rows.every((r) => typeof r[h] === 'number') ? Math.round(sumOf(h) * 100) / 100 : ''
      return ''
    })
    XLSX.utils.sheet_add_aoa(ws, [totals], { origin: `A${totalRow}` })
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, Math.min(48, Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length)) + 2)) }))
  } else {
    XLSX.utils.sheet_add_aoa(ws, [['Brak podpisanych umów deweloperskich w tym okresie.']], { origin: 'A3' })
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Umowy deweloperskie')

  // Arkusz 2: nabywcy.
  const ws2 = XLSX.utils.aoa_to_sheet([[`Nabywcy — ${title}`], []])
  if (buyerRows.length > 0) {
    XLSX.utils.sheet_add_json(ws2, buyerRows, { origin: 'A3' })
    const headers2 = Object.keys(buyerRows[0])
    ws2['!cols'] = headers2.map((h) => ({ wch: Math.max(12, Math.min(48, Math.max(h.length, ...buyerRows.map((r) => String(r[h] ?? '').length)) + 2)) }))
  } else {
    XLSX.utils.sheet_add_aoa(ws2, [['Brak nabywców w tym okresie.']], { origin: 'A3' })
  }
  XLSX.utils.book_append_sheet(wb, ws2, 'Nabywcy')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

  // RODO: eksport danych osobowych nabywców (z PESEL-em lub bez) zostaje w audycie.
  const meta = extractRequestMeta(req)
  void audit({
    action: 'EXPORT',
    userId: (session.user as any)?.id,
    userEmail: session.user?.email,
    entity: 'Contract',
    path: req.nextUrl.pathname,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: {
      report: 'zestawienie-sprzedazy-bank',
      from: fromRaw,
      to: toRaw,
      contracts: selected.length,
      buyers: buyerRows.length,
      grossTotal: Math.round(selected.reduce((s, c) => s + contractGross(c), 0) * 100) / 100,
      withPesel,
      withAddress,
    },
  })

  const fname = `zestawienie-sprzedazy-bank-${fromRaw}_${toRaw}.xlsx`
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    },
  })
}
