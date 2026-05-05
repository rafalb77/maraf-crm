'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function FloorPlanUpload({ unitId }: { unitId: string }) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('unitId', unitId)

    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error || 'Błąd uploadu')
    }
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div>
      <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        {uploading ? 'Wgrywanie...' : 'Wgraj rzut (JPG, PNG, PDF)'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleFile}
          disabled={uploading}
        />
      </label>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}
