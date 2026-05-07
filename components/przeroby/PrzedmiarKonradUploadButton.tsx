'use client'
import { useState } from 'react'
import { Upload } from 'lucide-react'
import { PrzedmiarKonradUploader } from './PrzedmiarKonradUploader'

export function PrzedmiarKonradUploadButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
      >
        <Upload className="w-4 h-4" />
        Wgraj przedmiar Konrada
      </button>
      {open && <PrzedmiarKonradUploader onClose={() => setOpen(false)} />}
    </>
  )
}
