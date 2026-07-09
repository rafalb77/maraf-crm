// Glowne foldery faktur — pochodzace z zakladek Excela Marty (PŁATNOŚCI 2026.xlsx).
// Filtruja faktury kosztowe wg vendora.
//
// Dopasowanie TOLERANCYJNE (2026-07): po scaleniu duplikatow kontrahenci nosza
// oficjalne nazwy z KSeF (np. "BAUTER SERWIS Sp. z o.o.", "Promatbud Sp. z o.o.",
// "P4 sp. z o. o." = Play) — foldery matchuja po znormalizowanym prefiksie,
// zeby zakladki przetrwaly zmiany nazw. Normalizacja: upper + tylko [A-Z0-9].

import { prisma } from './prisma'

export const FOLDERS = ['STAFFA', 'PROMATBUD', 'BAUTER', 'STALE', 'INNE'] as const
export type Folder = (typeof FOLDERS)[number]

export const FOLDER_LABELS: Record<Folder, string> = {
  STAFFA: 'Staffa',
  PROMATBUD: 'Promatbud',
  BAUTER: 'Bauter',
  STALE: 'Stałe',
  INNE: 'Inne',
}

/** Normalizacja nazwy do porownan: upper + bez znakow niealfanumerycznych.
 *  "JAWN-E Kancelaria" -> "JAWNEKANCELARIA", "P4 sp. z o. o." -> "P4SPZOO". */
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]/g, '')

// Sekcje z zakladki STAŁE — dopasowanie po PREFIKSIE znormalizowanej nazwy.
// Obejmuje krotkie nazwy z Excela i oficjalne z KSeF (po scaleniu):
//  PLAY -> "P4 sp. z o. o.", Jawne -> "JAWN-E Kancelaria...",
//  Develogic -> "Develogic spolka z o.o.", Toya -> "Toya Spolka z o.o.",
//  RAFAŁ -> "RB Project Rafał Boruch".
const STALE_PREFIXES = [
  'EURON', 'PLAY', 'P4', 'TOYA', 'POLISA', 'JAWN', 'DEVELOGIC', 'RBPROJECT',
]
// Nazwy dopasowywane TYLKO doslownie (prefiks bylby zbyt lapczywy —
// np. "Bogdan Boruch" to osobny kontrahent, nie sekcja STALE "Bogdan").
const STALE_EXACT = new Set(['MD', 'BOGDAN', 'MARTA', 'RAFAŁ', 'RAFAL'])

/** Mapowanie nazwy vendora na folder. null = brak przypisania (Pozostali). */
export function folderForVendorName(name: string): Folder | null {
  const n = norm(name)
  if (n === 'STAFFA') return 'STAFFA'
  if (n === 'INNE') return 'INNE'
  if (n.startsWith('PROMATBUD')) return 'PROMATBUD'
  if (n.startsWith('BAUTER')) return 'BAUTER'
  if (STALE_EXACT.has(n)) return 'STALE'
  if (STALE_PREFIXES.some((p) => n.startsWith(p))) return 'STALE'
  return null
}

/** Lista ID vendorów należących do folderu — używane w where filtra faktur. */
export async function vendorIdsForFolder(folder: Folder): Promise<string[]> {
  const all = await prisma.vendor.findMany({ select: { id: true, name: true } })
  return all.filter((v) => folderForVendorName(v.name) === folder).map((v) => v.id)
}

/** ID vendorów BEZ przypisania do folderu — sekcja "Pozostali". */
export async function vendorIdsWithoutFolder(): Promise<string[]> {
  const all = await prisma.vendor.findMany({ select: { id: true, name: true } })
  return all.filter((v) => folderForVendorName(v.name) === null).map((v) => v.id)
}
