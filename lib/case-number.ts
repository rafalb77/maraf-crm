// Generator sygnatury sprawy — wzorzec znaku sprawy à la kancelaria/urząd.
// Format: <PREFIKS>/<ROK>/<NNNN>, np. REK/2026/0042, URZ/2026/0007.
// Prefiks zależy od typu sprawy (CASE_TYPE_PREFIX w lib/types.ts).
//
// Numer kolejny liczony per (prefiks, rok) na podstawie NAJWYŻSZEGO istniejącego
// numeru (nie count) — odporne na usuwanie spraw. Pole Case.number jest @unique;
// przy rzadkim wyścigu (dwie sprawy tworzone równocześnie) POST robi retry na P2002.

import { prisma } from './prisma'
import { CASE_TYPE_PREFIX, type CaseType } from './types'

export async function nextCaseNumber(type: string): Promise<string> {
  const prefix = CASE_TYPE_PREFIX[type as CaseType] ?? 'SPR'
  const year = new Date().getFullYear()
  const pattern = `${prefix}/${year}/`

  // number jest zero-paddowany do 4 cyfr → porządek leksykalny = numeryczny (do 9999/rok).
  const last = await prisma.case.findFirst({
    where: { number: { startsWith: pattern } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })

  let seq = 1
  if (last) {
    const n = parseInt(last.number.slice(pattern.length), 10)
    if (!isNaN(n)) seq = n + 1
  }

  return `${pattern}${String(seq).padStart(4, '0')}`
}
