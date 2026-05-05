'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Unit } from '@prisma/client'
import { UNIT_TYPE_LABELS, UNIT_STATUS_LABELS, type UnitType, type UnitStatus } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

export function AssignUnitModal({ clientId, availableUnits }: { clientId: string; availableUnits: Unit[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAssign() {
    if (!selectedUnitId) return
    setLoading(true)
    await fetch(`/api/clients/${clientId}/units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId: selectedUnitId }),
    })
    setOpen(false)
    setSelectedUnitId('')
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-sm text-blue-600 hover:text-blue-700 font-medium">
        + Zarezerwuj lokal
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-900 mb-1">Miękka rezerwacja lokalu</h3>
            <p className="text-xs text-gray-500 mb-4">Rezerwacja wygaśnie automatycznie po 7 dniach, o ile nie zostanie podpisana umowa.</p>

            {availableUnits.length === 0 ? (
              <p className="text-gray-400 text-sm">Brak dostępnych lokali</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1 mb-4">
                {availableUnits.map((u) => (
                  <label key={u.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                      selectedUnitId === u.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}>
                    <input type="radio" name="unit" value={u.id}
                      checked={selectedUnitId === u.id}
                      onChange={() => setSelectedUnitId(u.id)}
                      className="text-blue-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{u.number}</p>
                      <p className="text-xs text-gray-500">
                        {UNIT_TYPE_LABELS[u.type as UnitType]} · {formatCurrency(u.priceGross)}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">{UNIT_STATUS_LABELS[u.status as UnitStatus]}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Anuluj
              </button>
              <button onClick={handleAssign} disabled={!selectedUnitId || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? '...' : 'Zarezerwuj'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
