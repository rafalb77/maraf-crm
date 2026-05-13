'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { INVESTMENT_IMAGE_KIND_LABELS, type InvestmentImageKind } from '@/lib/types'

export type InvestmentImageItem = {
  id: string
  url: string
  position: number
  isPrimary: boolean
  kind: string
}

export function InvestmentImagesSection({
  initialImages,
}: {
  initialImages: InvestmentImageItem[]
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<InvestmentImageItem[]>(initialImages)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [uploadKind, setUploadKind] = useState<InvestmentImageKind>('ZEWNETRZNE')

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      Array.from(files).forEach((f) => fd.append('files', f))
      fd.append('kind', uploadKind)
      const res = await fetch(`/api/investment-images`, { method: 'POST', body: fd })
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
      const res = await fetch(`/api/investment-images/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Blad usuwania')
      setImages((prev) => {
        const next = prev.filter((i) => i.id !== id)
        const removed = prev.find((i) => i.id === id)
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
      const res = await fetch(`/api/investment-images/${id}`, {
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

  async function handleSetKind(id: string, kind: string) {
    setBusy(id)
    setImages((prev) => prev.map((i) => (i.id === id ? { ...i, kind } : i)))
    try {
      const res = await fetch(`/api/investment-images/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      if (!res.ok) throw new Error('Blad zmiany kategorii')
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
      await fetch(`/api/investment-images/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: reordered.map((i) => i.id) }),
      })
      router.refresh()
    } catch {
      setError('Blad zmiany kolejnosci')
    }
  }

  const kindOptions = Object.entries(INVESTMENT_IMAGE_KIND_LABELS) as Array<[InvestmentImageKind, string]>

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Wizualizacje inwestycji</h2>
        <p className="text-sm text-gray-500 mt-1">
          Wspolne dla wszystkich lokali — elewacja, otoczenie, czesci wspolne, wnetrza wspolne (lobby, klatki).
          Wykorzystywane przez generator kreacji reklamowych Meta Ads jako tlo zwlaszcza dla formatow Stories (9:16) i FB Landscape (1.91:1).
        </p>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
          {images.map((img) => (
            <div key={img.id} className="space-y-1.5">
              <div
                draggable
                onDragStart={() => onDragStart(img.id)}
                onDragOver={(e) => onDragOver(e, img.id)}
                onDrop={(e) => onDrop(e, img.id)}
                className={`group relative aspect-square rounded-lg overflow-hidden border ${
                  img.isPrimary ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'
                } ${dragId === img.id ? 'opacity-50' : ''} bg-gray-50 cursor-move`}
                title="Przeciagnij aby zmienic kolejnosc"
              >
                <Image src={img.url} alt="" fill unoptimized className="object-cover pointer-events-none" sizes="200px" />

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

              <select
                value={img.kind || 'INNE'}
                onChange={(e) => handleSetKind(img.id, e.target.value)}
                disabled={busy === img.id}
                className="w-full text-xs px-2 py-1 border border-gray-200 rounded bg-white text-gray-700 hover:border-gray-300 focus:border-blue-400 focus:outline-none disabled:opacity-50"
                aria-label="Kategoria zdjecia"
              >
                {kindOptions.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Kategoria nowych zdjec</label>
          <select
            value={uploadKind}
            onChange={(e) => setUploadKind(e.target.value as InvestmentImageKind)}
            disabled={uploading}
            className="text-sm px-2 py-1.5 border border-gray-300 rounded bg-white text-gray-700 focus:border-blue-400 focus:outline-none disabled:opacity-50"
          >
            {kindOptions.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
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
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Mozesz wybrac wiele plikow naraz. Max 5 MB per plik. Przeciagaj kafelki aby zmienic kolejnosc.
        Kategoria pojedynczego zdjecia mozna zmienic pod kafelkiem.
      </p>

      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
    </div>
  )
}
