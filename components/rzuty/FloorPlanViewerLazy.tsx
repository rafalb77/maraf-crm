'use client'
import dynamic from 'next/dynamic'

// react-pdf/pdfjs tylko w przeglądarce (ssr:false): pdfjs-dist 5.x używa
// nowych API (m.in. Promise.withResolvers), których Node w kontenerze
// produkcyjnym może nie mieć — a SSR viewera i tak nic nie wnosi.
export const FloorPlanViewerLazy = dynamic(
  () => import('./FloorPlanViewer').then((m) => m.FloorPlanViewer),
  {
    ssr: false,
    loading: () => <div className="py-24 text-center text-gray-400 text-sm">Wczytywanie rzutów…</div>,
  },
)
