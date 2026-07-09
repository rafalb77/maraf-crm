// Zapis zdjęć z budowy na dysk + rekord SitePhoto (moduł Budowa, Etap 1).
// Pliki lądują w /app/public/uploads/budowa/<investmentId>/<timestamp>-<safeName>
// i są serwowane przez catch-all app/uploads/[...path]/route.ts (standalone nie
// serwuje plików dodanych w runtime — patrz CLAUDE.md).
//
// HEIC świadomie ODRZUCAMY: przeglądarki nie dekodują go w canvas (brak kompresji
// client-side), a catch-all nie serwuje .heic. Formularz check-in ma
// accept="image/jpeg,image/png" — iOS Safari sam transkoduje HEIC→JPEG przy wyborze
// z rolki; ta walidacja jest backstopem. Patrz docs/budowa-rozpoczecie.md.

import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from './prisma'

export const SITE_PHOTO_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const SITE_PHOTO_MAX_BYTES = 25 * 1024 * 1024 // 25 MB (po kompresji client-side dużo mniej)

/** Zwraca komunikat błędu (string) gdy plik niedozwolony, albo null gdy OK. */
export function validateSitePhoto(file: File): string | null {
  if (file.size === 0) return `Plik ${file.name} jest pusty`
  if (file.size > SITE_PHOTO_MAX_BYTES) {
    return `Plik ${file.name} przekracza limit ${SITE_PHOTO_MAX_BYTES / 1024 / 1024} MB`
  }
  if (file.type === 'image/heic' || file.type === 'image/heif' || /\.heic$/i.test(file.name)) {
    return `Plik ${file.name}: format HEIC nie jest obsługiwany — w ustawieniach aparatu iPhone wybierz „Najbardziej zgodne" albo wybierz zdjęcie z rolki (Safari sam skonwertuje do JPEG)`
  }
  if (file.type && !SITE_PHOTO_ALLOWED_TYPES.has(file.type)) {
    return `Plik ${file.name}: typ ${file.type} nie jest dozwolony (JPG, PNG, WEBP)`
  }
  return null
}

export async function saveSitePhoto(opts: {
  investmentId: string
  reportId?: string | null
  file: File
  caption?: string | null
  uploadedById?: string | null
}) {
  const { investmentId, reportId, file, caption, uploadedById } = opts
  const dir = path.join(process.cwd(), 'public', 'uploads', 'budowa', investmentId)
  await fs.mkdir(dir, { recursive: true })

  const safeName = file.name.replace(/[^\w.\-]/g, '_').slice(0, 120)
  const filename = `${Date.now()}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(path.join(dir, filename), buffer)

  return prisma.sitePhoto.create({
    data: {
      investmentId,
      reportId: reportId || null,
      url: `/uploads/budowa/${investmentId}/${filename}`,
      caption: caption || null,
      uploadedById: uploadedById || null,
    },
  })
}
