// Kompresja obrazow po stronie przegladarki (Canvas) — przed uploadem.
// Rendery od architekta potrafia wazyc 10+ MB; tu zmniejszamy je do rozsadnego
// rozmiaru zanim w ogole trafia na serwer (oszczednosc transferu + limitu 5 MB).
//
// UWAGA: uzywa DOM (createImageBitmap, canvas) — importuj tylko w komponentach klienckich.

const DEFAULT_MAX_EDGE = 1920 // dluzsza krawedz po zmniejszeniu
const DEFAULT_QUALITY = 0.85
const SKIP_BELOW_BYTES = 600 * 1024 // pliki ponizej tego rozmiaru zostawiamy bez zmian

/**
 * Zmniejsza i rekompresuje obraz do JPEG. Jesli plik jest juz maly, nie jest
 * obrazem rastrowym, albo kompresja nic nie da — zwraca oryginal bez zmian.
 */
export async function compressImage(
  file: File,
  maxEdge = DEFAULT_MAX_EDGE,
  quality = DEFAULT_QUALITY,
): Promise<File> {
  // tylko rastrowe obrazy; SVG/GIF/inne zostawiamy
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return file
  if (file.size < SKIP_BELOW_BYTES) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file // nie udalo sie zdekodowac — wysylamy oryginal
  }

  let { width, height } = bitmap
  if (width > maxEdge || height > maxEdge) {
    const scale = maxEdge / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob || blob.size >= file.size) return file // kompresja nic nie dala

  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], newName, { type: 'image/jpeg' })
}

/** Kompresuje liste plikow (sekwencyjnie — zeby nie zajechac pamieci przegladarki). */
export async function compressImages(files: File[]): Promise<File[]> {
  const out: File[] = []
  for (const f of files) {
    out.push(await compressImage(f))
  }
  return out
}
