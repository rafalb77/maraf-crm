'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { compressImage } from '@/lib/compress-image'

/**
 * Archiwum skanów sprawy — lista wszystkich CaseDocument + upload + usuwanie.
 * Skany wgrane tutaj nie są podpięte do żadnego wpisu korespondencji (entryId=null);
 * skany dołączone przy wpisie są widoczne na osi czasu oraz tu (pełne archiwum).
 */

type CaseDoc = {
  id: string
  filename: string
  url: string
  size: number | null
  mimeType: string
  ocrStatus: string
  uploadedAt: string | Date
}

function fmtSize(b: number | null): string {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function ocrBadge(status: string) {
  if (status === 'DONE') return <span className="text-[10px] text-green-600" title="Skan rozpoznany (OCR) — przeszukiwalny">🔍 OCR</span>
  if (status === 'PENDING') return <span className="text-[10px] text-gray-400" title="OCR w kolejce">⏳</span>
  if (status === 'FAILED') return <span className="text-[10px] text-red-400" title="OCR nieudany">⚠</span>
  return null
}

export function CaseDocuments({
  caseId,
  initialDocuments,
}: {
  caseId: string
  initialDocuments: CaseDoc[]
}) {
  const router = useRouter()
  const [docs, setDocs] = useState<CaseDoc[]>(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file)
        fd.append('files', compressed)
      }
      const res = await fetch(`/api/cases/${caseId}/documents`, { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Błąd uploadu (${res.status})`)
      }
      const { documents: created } = await res.json()
      setDocs((prev) => [...created, ...prev])
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Błąd uploadu')
    } finally {
      setUploading(false)
    }
  }

  async function retryOcr(docId: string) {
    setError(null)
    try {
      const res = await fetch(`/api/cases/${caseId}/documents/${docId}/ocr`, { method: 'POST' })
      if (!res.ok) throw new Error('Nie udało się uruchomić OCR')
      setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, ocrStatus: 'PENDING' } : d)))
      // OCR leci w tle — odśwież po chwili, żeby zobaczyć wynik
      setTimeout(() => router.refresh(), 4000)
    } catch (e: any) {
      setError(e?.message || 'Błąd OCR')
    }
  }

  async function remove(docId: string, filename: string) {
    if (!confirm(`Usunąć skan "${filename}"?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/cases/${caseId}/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Błąd usuwania (${res.status})`)
      }
      setDocs((prev) => prev.filter((d) => d.id !== docId))
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Błąd usuwania')
    }
  }

  return (
    <div className="space-y-3">
      {docs.length === 0 ? (
        <p className="text-gray-400 text-sm">Brak skanów</p>
      ) : (
        <ul className="space-y-1">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 group">
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 truncate flex-1"
                title={d.filename}
              >
                📄 {d.filename}
              </a>
              {ocrBadge(d.ocrStatus)}
              {d.ocrStatus === 'FAILED' && (
                <button
                  type="button"
                  onClick={() => retryOcr(d.id)}
                  className="text-[10px] text-amber-600 hover:text-amber-800"
                  title="Ponów OCR"
                >
                  ↻ OCR
                </button>
              )}
              {d.size != null && (
                <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{fmtSize(d.size)}</span>
              )}
              <button
                type="button"
                onClick={() => remove(d.id, d.filename)}
                className="text-xs text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Usuń skan"
              >
                Usuń
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-3 border-t border-gray-100">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
          onChange={(e) => upload(e.target.files)}
          disabled={uploading}
          className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer disabled:opacity-50"
        />
        <p className="text-[11px] text-gray-400 mt-1">PDF / JPG / PNG, do 25 MB każdy. Można wgrać wiele naraz.</p>
        {uploading && <p className="text-xs text-blue-600 mt-2">Wgrywam…</p>}
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
    </div>
  )
}
