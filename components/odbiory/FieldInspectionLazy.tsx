'use client'
import dynamic from 'next/dynamic'

// Widok terenowy używa IndexedDB, kamery i Web Speech API — tylko w przeglądarce (bez SSR).
export const FieldInspectionLazy = dynamic(() => import('./FieldInspection').then((m) => m.FieldInspection), {
  ssr: false,
  loading: () => <div className="flex h-[100dvh] items-center justify-center text-gray-600">Wczytuję widok terenowy…</div>,
})
