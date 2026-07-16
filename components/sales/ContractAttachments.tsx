'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Lista załączników umowy + upload nowych + usuwanie.
 *
 * Pliki idą przez `POST /api/contracts/<id>/attachments` (multipart),
 * usuwanie przez `DELETE /api/contracts/<id>/attachments/<attachmentId>`.
 * Serwowane przez catch-all `app/uploads/[...path]/route.ts` (Next.js
 * standalone nie serwuje runtime additions w public/ automatycznie).
 *
 * Limit per plik 20 MB, dozwolone: PDF / JPG / PNG / WEBP / DOCX.
 */

type Attachment = {
  id: string
  filename: string
  url: string
  size: number | null
  createdAt: string | Date
}

function fmtSize(b: number | null): string {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function ContractAttachments({
  contractId,
  initialAttachments,
}: {
  contractId: string
  initialAttachments: Attachment[]
}) {
  const router = useRouter()
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      for (const file of Array.from(files)) {
        formData.append('files', file)
      }
      const res = await fetch(`/api/contracts/${contractId}/attachments`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Błąd uploadu (${res.status})`)
      }
      const { attachments: created } = await res.json()
      setAttachments((prev) => [...prev, ...created])
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Błąd uploadu')
    } finally {
      setUploading(false)
    }
  }

  async function remove(attachmentId: string, filename: string) {
    if (!confirm(`Usunąć załącznik "${filename}"?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Błąd usuwania (${res.status})`)
      }
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Błąd usuwania')
    }
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 ? (
        <p className="text-gray-400 text-sm">Brak załączników</p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 group">
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 truncate flex-1"
                title={a.filename}
              >
                📄 {a.filename}
              </a>
              {a.size != null && (
                <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                  {fmtSize(a.size)}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(a.id, a.filename)}
                className="text-xs text-red-500 hover:text-red-700 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                title="Usuń załącznik"
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
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.docx,.doc,application/pdf,image/*"
          onChange={(e) => upload(e.target.files)}
          disabled={uploading}
          className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer disabled:opacity-50"
        />
        <p className="text-[11px] text-gray-400 mt-1">
          PDF / JPG / PNG / DOCX, do 20 MB każdy. Można wgrać wiele plików naraz.
        </p>
        {uploading && <p className="text-xs text-blue-600 mt-2">Wgrywam…</p>}
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
    </div>
  )
}
