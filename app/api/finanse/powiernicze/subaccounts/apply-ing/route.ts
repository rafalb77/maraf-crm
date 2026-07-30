import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveCompany } from '@/lib/finanse-company'
import SUBACCOUNTS_RAW from '@/lib/data/ing-subaccounts-zgierz.json'

export const runtime = 'nodejs'

// Zbiorcze przypisanie rachunkow wirtualnych ING (Zgierz, 59 lokali) do
// Unit.escrowSubaccount — odpowiednik scripts/set-escrow-subaccounts.js
// dostepny z UI (zakladka Subrachunki), bez terminala.
//
// POST { commit?: boolean, overwrite?: boolean, prefix?: string }
//   commit=false (default) → sam podglad, zero zapisow.
// Dopasowanie: koncowa liczba w Unit.number ("A0.001" -> 1). Ta sama koncowka
// w wielu lokalach = niejednoznaczne, pomijane (zawezic prefix lub recznie).

const SUBACCOUNTS: Record<string, string> = SUBACCOUNTS_RAW

function validNrb(nrb: string): boolean {
  if (!/^\d{26}$/.test(nrb)) return false
  const rearranged = nrb.slice(2) + '2521' + nrb.slice(0, 2) // "PL" -> 2521
  let rem = 0
  for (const ch of rearranged) rem = (rem * 10 + (ch.charCodeAt(0) - 48)) % 97
  return rem === 1
}

const fmtNrb = (nrb: string) =>
  `${nrb.slice(0, 2)} ${nrb.slice(2, 6)} ${nrb.slice(6, 10)} ${nrb.slice(10, 14)} ${nrb.slice(14, 18)} ${nrb.slice(18, 22)} ${nrb.slice(22, 26)}`

function unitNo(number: string | null | undefined): number | null {
  const m = String(number || '').match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getActiveCompany() !== 'MARAF_DEVELOPMENT') {
    return NextResponse.json({ error: 'Rozliczenia powiernicze dostępne tylko dla Maraf Development.' }, { status: 400 })
  }

  let body: any = {}
  try { body = await req.json() } catch { /* opcjonalne */ }
  const commit = body.commit === true
  const overwrite = body.overwrite === true
  const prefix = body.prefix ? String(body.prefix).trim() : null

  const bad = Object.values(SUBACCOUNTS).filter((n) => !validNrb(n))
  if (bad.length) return NextResponse.json({ error: 'Lista ING zawiera niepoprawne NRB — zgłoś problem.' }, { status: 500 })

  const units = await prisma.unit.findMany({
    where: prefix ? { number: { startsWith: prefix, mode: 'insensitive' } } : undefined,
    select: {
      id: true, number: true, escrowSubaccount: true,
      contractUnits: {
        select: { contract: { select: { number: true, client: { select: { firstName: true, lastName: true } } } } },
      },
    },
    orderBy: { number: 'asc' },
  })

  const claims = new Map<number, typeof units>()
  for (const u of units) {
    const n = unitNo(u.number)
    if (n == null || !SUBACCOUNTS[n]) continue
    if (!claims.has(n)) claims.set(n, [])
    claims.get(n)!.push(u)
  }

  const ambiguous = [...claims.entries()]
    .filter(([, us]) => us.length > 1)
    .map(([n, us]) => ({ lokal: n, units: us.map((u) => u.number) }))

  const toSet: { lokal: number; unit: string; nrb: string; contract: string | null; overwrites: string | null }[] = []
  const conflicts: { lokal: number; unit: string; existing: string }[] = []
  let same = 0
  const assigned = new Set<number>()

  for (const [n, us] of [...claims.entries()].sort((a, b) => a[0] - b[0])) {
    if (us.length > 1) continue
    const u = us[0]
    assigned.add(n)
    const nrb = fmtNrb(SUBACCOUNTS[n])
    const contracts = u.contractUnits.map((cu) => cu.contract).filter(Boolean)
    const who = contracts.length
      ? contracts.map((c) => `${c!.number}${c!.client ? ` / ${c!.client.firstName} ${c!.client.lastName}` : ''}`).join('; ')
      : null
    const existingNorm = (u.escrowSubaccount || '').replace(/[^0-9A-Za-z]/g, '')
    if (existingNorm === SUBACCOUNTS[n]) { same++; continue }
    if (existingNorm && !overwrite) {
      conflicts.push({ lokal: n, unit: u.number, existing: u.escrowSubaccount! })
      continue
    }
    toSet.push({ lokal: n, unit: u.number, nrb, contract: who, overwrites: existingNorm ? u.escrowSubaccount! : null })
    if (commit) {
      await prisma.unit.update({ where: { id: u.id }, data: { escrowSubaccount: nrb } })
    }
  }

  const notFound = Object.keys(SUBACCOUNTS).map(Number).filter((n) => !assigned.has(n) && !ambiguous.some((a) => a.lokal === n)).sort((a, b) => a - b)

  return NextResponse.json({
    committed: commit,
    total: Object.keys(SUBACCOUNTS).length,
    toSet,
    same,
    conflicts,
    ambiguous,
    notFound,
  })
}
