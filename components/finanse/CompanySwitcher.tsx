'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { COMPANY_LABELS, type Company } from '@/lib/types'

export function CompanySwitcher({ active }: { active: Company }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function select(company: Company) {
    if (company === active) return
    setLoading(company)
    try {
      await fetch('/api/finanse/company', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company }),
      })
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Firma:</span>
      <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
        {(Object.keys(COMPANY_LABELS) as Company[]).map((c) => (
          <button
            key={c}
            onClick={() => select(c)}
            disabled={loading !== null}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              active === c
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            } ${loading === c ? 'opacity-60' : ''}`}
          >
            {loading === c ? '...' : COMPANY_LABELS[c]}
          </button>
        ))}
      </div>
    </div>
  )
}
