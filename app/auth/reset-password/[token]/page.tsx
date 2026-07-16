'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const params = useParams<{ token: string }>()
  const token = params?.token as string

  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)

  // Sprawdź ważność tokenu przy załadowaniu
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
        if (cancelled) return
        setTokenValid(res.ok)
      } catch {
        if (!cancelled) setTokenValid(false)
      }
    }
    if (token) check()
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków')
      return
    }
    if (password !== password2) {
      setError('Hasła nie są identyczne')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Coś poszło nie tak')
      }
      setSuccess(true)
      setTimeout(() => router.push('/auth/signin'), 2500)
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
            <h1 className="text-2xl font-bold text-gray-900">Ustaw nowe hasło</h1>
          </div>

          {tokenValid === null && (
            <div className="text-center text-sm text-gray-500">Sprawdzanie linku…</div>
          )}

          {tokenValid === false && (
            <div className="space-y-5">
              <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-4 rounded-lg">
                Link wygasł lub jest nieprawidłowy. Wygeneruj nowy link do resetu hasła.
              </div>
              <Link
                href="/auth/forgot-password"
                className="block text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors"
              >
                Wygeneruj nowy link
              </Link>
              <Link
                href="/auth/signin"
                className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-800"
              >
                <ArrowLeft className="w-4 h-4" />
                Powrót do logowania
              </Link>
            </div>
          )}

          {tokenValid === true && success && (
            <div className="space-y-5">
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-4 rounded-lg flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  Hasło zostało zmienione. Za chwilę przekierujemy Cię do logowania…
                </div>
              </div>
            </div>
          )}

          {tokenValid === true && !success && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nowe hasło</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoFocus
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Minimum 8 znaków"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-1"
                    aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Powtórz hasło</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Powtórz nowe hasło"
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
                {loading ? 'Zapisywanie...' : 'Zapisz nowe hasło'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
