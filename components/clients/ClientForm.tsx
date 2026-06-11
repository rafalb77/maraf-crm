'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Client } from '@prisma/client'

const STATUSES = [
  { value: 'ZAPYTANIE', label: 'Zapytanie' },
  { value: 'OFERTA', label: 'Oferta' },
  { value: 'REZERWACJA', label: 'Rezerwacja' },
  { value: 'UMOWA', label: 'Umowa' },
  { value: 'ODBIOR', label: 'Odbiór' },
]

export function ClientForm({ client }: { client?: Client }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // ?returnTo=/sales/new — gdy klient utworzony z poziomu formularza umowy:
  // po zapisie wracamy do tego URL z `?clientId=<nowyId>` żeby formularz
  // od razu go preselectował (sales/new.tsx odczytuje clientId z URL).
  const returnTo = searchParams?.get('returnTo')
  const [form, setForm] = useState({
    firstName: client?.firstName || '',
    lastName: client?.lastName || '',
    email: client?.email || '',
    phone: client?.phone || '',
    phone2: client?.phone2 || '',
    pesel: client?.pesel || '',
    nip: client?.nip || '',
    idNumber: client?.idNumber || '',
    fatherName: client?.fatherName || '',
    motherName: client?.motherName || '',
    address: client?.address || '',
    city: client?.city || '',
    zipCode: client?.zipCode || '',
    status: client?.status || 'ZAPYTANIE',
    source: client?.source || '',
    notes: client?.notes || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const url = client ? `/api/clients/${client.id}` : '/api/clients'
    const method = client ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      const data = await res.json()
      if (!client && returnTo) {
        // Tylko przy CREATE (nie PUT) + jeśli był returnTo — wracamy z clientId
        const sep = returnTo.includes('?') ? '&' : '?'
        router.push(`${returnTo}${sep}clientId=${data.id}`)
      } else {
        router.push(`/clients/${data.id}`)
      }
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error || 'Błąd zapisu')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} autoComplete="off" className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Dane podstawowe</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Imię *" required>
            <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required autoComplete="off" className={inputCls} placeholder="Jan" />
          </FormField>
          <FormField label="Nazwisko *" required>
            <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required autoComplete="off" className={inputCls} placeholder="Kowalski" />
          </FormField>
          <FormField label="Status">
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls + ' bg-white'}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </FormField>
          <FormField label="Źródło pozyskania">
            <input value={form.source} onChange={(e) => set('source', e.target.value)} autoComplete="off" className={inputCls} placeholder="np. polecenie, portal" />
          </FormField>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Kontakt</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Telefon">
            <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="off" className={inputCls} placeholder="+48 600 000 000" />
          </FormField>
          <FormField label="Telefon 2">
            <input type="tel" value={form.phone2} onChange={(e) => set('phone2', e.target.value)} autoComplete="off" className={inputCls} />
          </FormField>
          <FormField label="Email" cls="col-span-2">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" className={inputCls} placeholder="jan@kowalski.pl" />
          </FormField>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Dane do umowy</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="PESEL">
            <input value={form.pesel} onChange={(e) => set('pesel', e.target.value)} autoComplete="off" className={inputCls} maxLength={11} />
          </FormField>
          <FormField label="NIP (firmy)">
            <input value={form.nip} onChange={(e) => set('nip', e.target.value)} autoComplete="off" className={inputCls} maxLength={10} />
          </FormField>
          <FormField label="Nr dowodu / paszportu">
            <input value={form.idNumber} onChange={(e) => set('idNumber', e.target.value)} autoComplete="off" className={inputCls} placeholder="ABC 123456" />
          </FormField>
          <FormField label="Imię ojca">
            <input value={form.fatherName} onChange={(e) => set('fatherName', e.target.value)} autoComplete="off" className={inputCls} />
          </FormField>
          <FormField label="Imię matki">
            <input value={form.motherName} onChange={(e) => set('motherName', e.target.value)} autoComplete="off" className={inputCls} />
          </FormField>
          <FormField label="Adres" cls="col-span-2">
            <input value={form.address} onChange={(e) => set('address', e.target.value)} autoComplete="off" className={inputCls} placeholder="ul. Przykładowa 1/2" />
          </FormField>
          <FormField label="Kod pocztowy">
            <input value={form.zipCode} onChange={(e) => set('zipCode', e.target.value)} autoComplete="off" className={inputCls} placeholder="00-000" maxLength={6} />
          </FormField>
          <FormField label="Miasto">
            <input value={form.city} onChange={(e) => set('city', e.target.value)} autoComplete="off" className={inputCls} placeholder="Warszawa" />
          </FormField>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Notatki</h3>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} autoComplete="off"
          rows={4} className={inputCls + ' resize-none'} placeholder="Dodatkowe informacje..." />
      </section>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
          {loading ? 'Zapisywanie...' : client ? 'Zapisz zmiany' : 'Dodaj klienta'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          Anuluj
        </button>
      </div>
    </form>
  )
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function FormField({ label, children, required, cls }: {
  label: string; children: React.ReactNode; required?: boolean; cls?: string
}) {
  return (
    <div className={cls}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  )
}
