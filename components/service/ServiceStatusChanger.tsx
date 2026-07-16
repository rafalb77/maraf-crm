'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SERVICE_STATUS_LABELS, SERVICE_STATUS_COLORS, type ServiceStatus } from '@/lib/types'

const STATUSES: ServiceStatus[] = ['ZGLOSZONO', 'W_TOKU', 'ZAKONCZONE']

export function ServiceStatusChanger({ requestId, currentStatus }: { requestId: string; currentStatus: ServiceStatus }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function changeStatus(status: ServiceStatus) {
    if (status === currentStatus) { setOpen(false); return }
    setLoading(true)
    await fetch(`/api/service/${requestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 border ${SERVICE_STATUS_COLORS[currentStatus]}`}>
        {SERVICE_STATUS_LABELS[currentStatus]}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* left-0 na mobile — right-0 (jak w desktopie) potrafił wypychać panel poza lewą krawędź ekranu,
              gdy przycisk stoi blisko lewego marginesu (np. w stackowanym nagłówku szczegółów zgłoszenia) */}
          <div className="absolute left-0 right-auto sm:left-auto sm:right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => changeStatus(s)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between">
                <span>{SERVICE_STATUS_LABELS[s]}</span>
                {s === currentStatus && <span className="text-blue-500">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
