'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ChevronDown, UserRound } from 'lucide-react'

export type OwnerOption = { id: string; name: string | null; preferredName: string | null; email: string }

function label(u: OwnerOption): string {
  return u.preferredName || u.name || u.email
}

/**
 * Inline zmiana opiekuna klienta (handlowca) na karcie klienta.
 * PUT /api/clients/[id] { ownerId } — pusty = odpięcie. Wzorzec z
 * ClientStatusChanger. Opiekun zasila kierowanie zadań rezerwacyjnych
 * (Task.assigneeId) do konkretnej osoby.
 */
export function ClientOwnerChanger({
  clientId,
  ownerId,
  users,
}: {
  clientId: string
  ownerId: string | null
  users: OwnerOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const current = users.find((u) => u.id === ownerId) || null

  async function change(newOwnerId: string | null) {
    if (newOwnerId === ownerId) { setOpen(false); return }
    setLoading(true)
    await fetch(`/api/clients/${clientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: newOwnerId }),
    })
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-sm text-gray-900 hover:text-blue-600 transition-colors"
      >
        <UserRound className="w-3.5 h-3.5 text-gray-400" />
        {current ? label(current) : <span className="text-gray-400">Nieprzypisany</span>}
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 min-w-[180px] max-h-64 overflow-y-auto">
            <button
              onClick={() => change(null)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${!ownerId ? 'font-semibold' : 'text-gray-500'}`}
            >
              <span>Nieprzypisany</span>
              {!ownerId && <span className="text-blue-500">✓</span>}
            </button>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => change(u.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${u.id === ownerId ? 'font-semibold' : ''}`}
              >
                <span>{label(u)}</span>
                {u.id === ownerId && <span className="text-blue-500">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
