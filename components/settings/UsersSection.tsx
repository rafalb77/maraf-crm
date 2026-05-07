'use client'
import { useState, useEffect } from 'react'
import { UserPlus, Mail, Trash2, RotateCcw, X, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'

type User = {
  id: string
  email: string
  name: string | null
  createdAt: string
  pendingActivation: boolean
}

type SessionInfo = { id?: string; email?: string }

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function UsersSection({ currentUserEmail }: { currentUserEmail: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // id usera w trakcie operacji
  const [info, setInfo] = useState<{ type: 'ok' | 'err'; msg: string; link?: string } | null>(null)

  // Add form
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      setUsers(data.users || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    setAdding(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, name: newName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd dodawania użytkownika')

      setShowAdd(false)
      setNewEmail('')
      setNewName('')
      await load()

      if (data?.mail?.sent) {
        setInfo({ type: 'ok', msg: `Użytkownik dodany. Wysłano link aktywacyjny na ${data.user.email}.` })
      } else {
        setInfo({
          type: 'err',
          msg:
            'Użytkownik dodany, ale nie udało się wysłać maila. ' +
            (data?.mail?.error || 'Sprawdź konfigurację SMTP.') +
            ' Skopiuj link aktywacyjny ręcznie:',
          link: data?.mail?.activationUrl,
        })
      }
    } catch (e: any) {
      setAddError(e.message || 'Błąd')
    } finally {
      setAdding(false)
    }
  }

  async function del(user: User) {
    if (!confirm(`Usunąć użytkownika ${user.email}? Tej operacji nie można cofnąć.`)) return
    setBusy(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Błąd usuwania')
      await load()
      setInfo({ type: 'ok', msg: `Użytkownik ${user.email} został usunięty.` })
    } catch (e: any) {
      setInfo({ type: 'err', msg: e.message })
    } finally {
      setBusy(null)
    }
  }

  async function sendReset(user: User) {
    setBusy(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}/send-reset`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd')
      if (data.ok) {
        setInfo({ type: 'ok', msg: `Wysłano link resetujący na ${user.email}.` })
      } else {
        setInfo({
          type: 'err',
          msg: `Nie udało się wysłać maila do ${user.email}. ${data.error || ''} Skopiuj link ręcznie:`,
          link: data.resetUrl,
        })
      }
      await load()
    } catch (e: any) {
      setInfo({ type: 'err', msg: e.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Użytkownicy</h2>
          <p className="text-sm text-gray-500 mt-1">
            Konta z dostępem do systemu. Każdy zalogowany ma pełne uprawnienia.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Dodaj użytkownika
        </button>
      </div>

      {/* Info banner */}
      {info && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${
            info.type === 'ok'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}
        >
          {info.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div>{info.msg}</div>
            {info.link && (
              <code className="block mt-2 p-2 bg-white border border-amber-200 rounded text-xs break-all text-gray-700">
                {info.link}
              </code>
            )}
          </div>
          <button
            onClick={() => setInfo(null)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500 py-4">Ładowanie...</div>
      ) : users.length === 0 ? (
        <div className="text-sm text-gray-500 py-4">Brak użytkowników.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-3 py-2 font-medium">Imię</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Dodany</th>
                <th className="px-3 py-2 font-medium text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const isMe = u.email === currentUserEmail
                return (
                  <tr key={u.id}>
                    <td className="px-3 py-3 text-gray-900 whitespace-nowrap">{u.name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-3 text-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="break-all">{u.email}</span>
                        {isMe && (
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">to Ty</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {u.pendingActivation ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 text-xs font-medium rounded whitespace-nowrap">
                          <Clock className="w-3 h-3" />
                          Czeka na aktywację
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-800 text-xs font-medium rounded whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3" />
                          Aktywne
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString('pl-PL')}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => sendReset(u)}
                          disabled={busy === u.id}
                          className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 p-1.5 rounded inline-flex items-center disabled:opacity-50"
                          title="Wyślij ponownie link do resetu hasła"
                          aria-label="Reset hasła"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {!isMe && (
                          <button
                            onClick={() => del(u)}
                            disabled={busy === u.id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1.5 rounded inline-flex items-center disabled:opacity-50"
                            title="Usuń użytkownika"
                            aria-label="Usuń"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Add user */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !adding && setShowAdd(false)}>
          <div
            className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">Dodaj nowego użytkownika</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Wyślemy mailem link aktywacyjny — odbiorca sam ustawi hasło.
                </p>
              </div>
              <button
                onClick={() => !adding && setShowAdd(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={adding}
                aria-label="Zamknij"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={add} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Imię</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={inputCls}
                  placeholder="np. Marta"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="np. biuro@maraf.pl"
                />
              </div>

              {addError && (
                <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
                  {addError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !adding && setShowAdd(false)}
                  disabled={adding}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  {adding ? 'Wysyłanie...' : 'Dodaj i wyślij link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
