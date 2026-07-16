'use client'

// Lazy-loader Gantta: SVAR dotyka window/document, więc bez SSR; bundle (~130 kB gz)
// ładuje się tylko na /budowa/harmonogram w widoku Gantt.
import dynamic from 'next/dynamic'

export const GanttLazy = dynamic(
  () => import('./GanttView').then((m) => m.GanttView),
  {
    ssr: false,
    loading: () => (
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-10 text-center text-gray-400">
        Ładowanie wykresu Gantta…
      </div>
    ),
  },
)
