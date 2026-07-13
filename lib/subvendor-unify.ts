// Ujednolicanie etykiet podwykonawcow (subVendor) do oficjalnych nazw
// kontrahentow — wspolna logika dla skryptu CLI i przycisku w UI.
//
// Problem: import z Excela zostawil robocze etykiety ("AL-BUD"), a kontrahenci
// po scaleniu nosza oficjalne nazwy z KSeF ("AL-BUD ALINA GRANENKO"). Liczniki,
// karty i filtry dopasowuja po IDENTYCZNEJ nazwie — ta funkcja masowo zmienia
// etykiety na nazwy vendorow (po znormalizowanym prefiksie).

import { prisma } from './prisma'

// Parasole/grupy z Excela — etykiety NIE powinny byc mapowane na te wpisy.
const PROTECTED = new Set(['STAFFA', 'INNE', 'MURARZ', 'STALE'])

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]/g, '')

export type UnifyRename = { from: string; to: string; count: number }
export type UnifyPlan = {
  renames: UnifyRename[]
  ambiguous: { label: string; count: number; names: string[] }[]
  unmatched: { label: string; count: number; why: string }[]
  alreadyOk: number
}

/** Wylicza plan ujednolicenia (bez zapisu). */
export async function planSubvendorUnify(): Promise<UnifyPlan> {
  const [labelsRaw, vendors] = await Promise.all([
    prisma.purchaseInvoice.groupBy({ by: ['subVendor'], where: { subVendor: { not: null } }, _count: true }),
    prisma.vendor.findMany({ select: { id: true, name: true } }),
  ])
  const candidates = vendors.filter((v) => !PROTECTED.has(norm(v.name)))

  const renames: UnifyRename[] = []
  const ambiguous: UnifyPlan['ambiguous'] = []
  const unmatched: UnifyPlan['unmatched'] = []
  let alreadyOk = 0

  for (const row of labelsRaw) {
    const label = (row.subVendor || '').trim()
    if (!label) continue
    const nl = norm(label)
    if (nl.length < 3) { unmatched.push({ label, count: row._count, why: 'za krótka etykieta' }); continue }

    let matches = candidates.filter((v) => {
      const nv = norm(v.name)
      return nv === nl || nv.startsWith(nl) || nl.startsWith(nv)
    })
    if (matches.length === 0) { unmatched.push({ label, count: row._count, why: 'brak kontrahenta' }); continue }
    if (matches.length > 1) {
      const exact = matches.filter((v) => norm(v.name) === nl)
      if (exact.length !== 1) { ambiguous.push({ label, count: row._count, names: matches.map((m) => m.name) }); continue }
      matches = exact
    }
    const target = matches[0]
    if (target.name === label) { alreadyOk++; continue }
    renames.push({ from: label, to: target.name, count: row._count })
  }
  renames.sort((a, b) => b.count - a.count)
  return { renames, ambiguous, unmatched, alreadyOk }
}

/** Wykonuje przekazane zmiany etykiet. Zwraca liczbe zmienionych FV. */
export async function applySubvendorUnify(renames: UnifyRename[]): Promise<number> {
  let changed = 0
  for (const r of renames) {
    const res = await prisma.purchaseInvoice.updateMany({ where: { subVendor: r.from }, data: { subVendor: r.to } })
    changed += res.count
  }
  return changed
}
