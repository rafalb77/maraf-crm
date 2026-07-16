'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Coś poszło nie tak')
      }
      setSubmitted(true)
    } catch (e: any) {
      setError(e.message || 'Coś poszło nie tak')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src="/logo-icon.png"
                alt="MARAF Development"
                width={80}
                height={80}
                priority
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Reset hasła</h1>
            <p className="text-gray-500 text-sm mt-1">
              {submitted
                ? 'Sprawdź skrzynkę e-mail'
                : 'Podaj swój adres e-mail, wyślemy link do zmiany hasła'}
            </p>
          </div>

          {submitted ? (
            <div className="space-y-5">
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-4 rounded-lg flex items-start gap-3">
                <MailCheck className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  Jeśli konto z adresem <strong>{email}</strong> istnieje, otrzymasz wiadomość z linkiem do zmiany hasła. Link będzie aktywny przez 1 godzinę.
                </div>
              </div>
              <Link
                href="/auth/signin"
                className="flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Powrót do logowania
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="twoj@email.pl"
                />
              </div>
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 rounded-lg transition-colors"
              >
                {loading ? 'Wysyłanie...' : 'Wyślij link resetujący'}
              </button>
              <Link
                href="/auth/signin"
                className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-800"
              >
                <ArrowLeft className="w-4 h-4" />
                Powrót do logowania
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
