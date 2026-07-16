'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function NowyZakresPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/przeroby/scopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd')
      router.push(`/przeroby/obmiar/${data.slug}`)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <div className="mb-2 text-sm">
        <Link href="/przeroby/obmiar" className="text-gray-500 hover:text-gray-700">
          ← Obmiary
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nowy zakres robót</h1>

      <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa zakresu</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputCls}
            placeholder="np. Prace murarskie, Tynki wewnętrzne, Instalacje sanitarne"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Opis (opcjonalnie)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputCls + ' resize-none'}
            placeholder="Krótki opis zakresu prac..."
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {saving ? 'Zapisywanie...' : 'Utwórz zakres'}
          </button>
          <Link
            href="/przeroby/obmiar"
            className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Anuluj
          </Link>
        </div>

        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          Po utworzeniu zakresu możesz zaimportować pozycje z Excela:
          <br />
          <code className="bg-gray-100 px-1.5 py-0.5 rounded mt-1 inline-block">
            node scripts/import-obmiar.js [slug] [ścieżka.xlsx]
          </code>
        </p>
      </form>
    </div>
  )
}
