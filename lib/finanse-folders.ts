// Glowne foldery faktur — pochodzace z zakladek Excela Marty (PŁATNOŚCI 2026.xlsx).
// Filtruja faktury kosztowe wg vendora. Stała mapowanie nazwa-vendora -> folder
// (bo Vendor.mainFolder nie jest polem w bazie — uproszczona wersja).

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

// Sekcje z zakladki STAŁE w Excelu Marty (kontrahenci stałych kosztów).
// Niektóre nazwy z różnymi wielkościami liter — wszystkie wariacje.
const STALE_VENDOR_NAMES = new Set([
  'EURON', 'Euron',
  'PLAY', 'Play',
  'TOYA', 'Toya',
  'POLISA', 'Polisa',
  'Jawne', 'JAWNE',
  'DEVELOGIC', 'Develogic',
  'MD',
  'Bogdan', 'BOGDAN',
  'MARTA', 'Marta',
  'RAFAŁ', 'Rafał', 'RAFAL', 'Rafal',
])

/** Mapowanie nazwy vendora na folder. null = brak przypisania (Pozostali). */
export function folderForVendorName(name: string): Folder | null {
  if (name === 'STAFFA') return 'STAFFA'
  if (name === 'PROMATBUD') return 'PROMATBUD'
  if (name === 'BAUTER') return 'BAUTER'
  if (name === 'INNE') return 'INNE'
  if (STALE_VENDOR_NAMES.has(name)) return 'STALE'
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
