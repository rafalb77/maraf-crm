'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function NowyPodwykonawcaPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '', nip: '', regon: '', address: '', city: '', zipCode: '',
    contactName: '', email: '', phone: '', bankAccount: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/przeroby/subcontractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd')
      router.push(`/przeroby/podwykonawcy/${data.id}`)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <div className="mb-2 text-sm">
        <Link href="/przeroby/podwykonawcy" className="text-gray-500 hover:text-gray-700">
          ← Podwykonawcy
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nowy podwykonawca</h1>

      <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <Section title="Dane firmy">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nazwa firmy *" className="md:col-span-2">
              <input value={form.name} onChange={(e) => set('name', e.target.value)} required className={inputCls} />
            </Field>
            <Field label="NIP">
              <input value={form.nip} onChange={(e) => set('nip', e.target.value)} className={inputCls} placeholder="1234567890" />
            </Field>
            <Field label="REGON">
              <input value={form.regon} onChange={(e) => set('regon', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Adres" className="md:col-span-2">
              <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} placeholder="ul. Budowlana 12" />
            </Field>
            <Field label="Miejscowość">
              <input value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Kod pocztowy">
              <input value={form.zipCode} onChange={(e) => set('zipCode', e.target.value)} className={inputCls} placeholder="00-000" />
            </Field>
          </div>
        </Section>

        <Section title="Kontakt">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Osoba kontaktowa">
              <input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Telefon">
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email" className="md:col-span-2">
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
            </Field>
          </div>
        </Section>

        <Section title="Rozliczenia">
          <Field label="Numer konta bankowego">
            <input value={form.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} className={inputCls} placeholder="12 3456 7890 1234 5678 9012 3456" />
          </Field>
          <Field label="Notatki" className="mt-4">
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={inputCls + ' resize-none'} />
          </Field>
        </Section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz podwykonawcę'}
          </button>
          <Link
            href="/przeroby/podwykonawcy"
            className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Anuluj
          </Link>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
