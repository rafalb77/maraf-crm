'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export type UnitImageItem = {
  id: string
  url: string
  position: number
  isPrimary: boolean
}

export function UnitImageGallery({
  unitId,
  initialImages,
}: {
  unitId: string
  initialImages: UnitImageItem[]
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<UnitImageItem[]>(initialImages)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      Array.from(files).forEach((f) => fd.append('files', f))
      const res = await fetch(`/api/units/${unitId}/images`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Blad uploadu')
      setImages((prev) => [...prev, ...data.images])
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Blad uploadu')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Usunac to zdjecie?')) return
    setBusy(id)
    try {
      const res = await fetch(`/api/units/${unitId}/images/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Blad usuwania')
      setImages((prev) => {
        const next = prev.filter((i) => i.id !== id)
        const removed = prev.find((i) => i.id === id)
        // Jesli usunelismy glowne, podnies pierwszego z pozostalych (zgodnie z backendem)
        if (removed?.isPrimary && next.length > 0) {
          next[0] = { ...next[0], isPrimary: true }
        }
        return next
      })
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Blad usuwania')
    } finally {
      setBusy(null)
    }
  }

  async function handleSetPrimary(id: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/units/${unitId}/images/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      })
      if (!res.ok) throw new Error('Blad zmiany glownego')
      setImages((prev) => prev.map((i) => ({ ...i, isPrimary: i.id === id })))
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Blad')
    } finally {
      setBusy(null)
    }
  }

  function onDragStart(id: string) {
    setDragId(id)
  }

  function onDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault()
    if (!dragId || dragId === overId) return
  }

  async function onDrop(e: React.DragEvent, overId: string) {
    e.preventDefault()
    if (!dragId || dragId === overId) {
      setDragId(null)
      return
    }
    const next = [...images]
    const fromIdx = next.findIndex((i) => i.id === dragId)
    const toIdx = next.findIndex((i) => i.id === overId)
    if (fromIdx < 0 || toIdx < 0) {
      setDragId(null)
      return
    }
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    const reordered = next.map((i, idx) => ({ ...i, position: idx }))
    setImages(reordered)
    setDragId(null)

    try {
      await fetch(`/api/units/${unitId}/images/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: reordered.map((i) => i.id) }),
      })
      router.refresh()
    } catch {
      setError('Blad zmiany kolejnosci')
    }
  }

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => onDragStart(img.id)}
              onDragOver={(e) => onDragOver(e, img.id)}
              onDrop={(e) => onDrop(e, img.id)}
              className={`group relative aspect-square rounded-lg overflow-hidden border ${
                img.isPrimary ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'
              } ${dragId === img.id ? 'opacity-50' : ''} bg-gray-50 cursor-move`}
              title="Przeciagnij aby zmienic kolejnosc"
            >
              <Image src={img.url} alt="" fill className="object-cover pointer-events-none" sizes="200px" />

              {img.isPrimary && (
                <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  Glowne
                </div>
              )}

              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                {!img.isPrimary && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(img.id)}
                    disabled={busy === img.id}
                    className="px-2 py-1 bg-white text-gray-900 text-xs font-medium rounded hover:bg-amber-50 disabled:opacity-50"
                  >
                    Glowne
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(img.id)}
                  disabled={busy === img.id}
                  className="px-2 py-1 bg-white text-red-600 text-xs font-medium rounded hover:bg-red-50 disabled:opacity-50"
                >
                  Usun
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {uploading ? 'Wgrywanie...' : 'Wgraj zdjecia (JPG, PNG, WebP)'}
        </button>
        <p className="text-xs text-gray-400 mt-1">Mozesz wybrac wiele plikow naraz. Max 5 MB per plik. Przeciagaj kafelki aby zmienic kolejnosc.</p>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  )
}
