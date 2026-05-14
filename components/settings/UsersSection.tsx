'use client'
import { useState, useEffect } from 'react'
import { UserPlus, Mail, Trash2, RotateCcw, X, CheckCircle2, AlertTriangle, Clock, Shield } from 'lucide-react'
import { ALL_PERMISSIONS, PERMISSION_LABELS, type Permission } from '@/lib/permissions'
import { isAdmin } from '@/lib/auth-utils'

type User = {
  id: string
  email: string
  name: string | null
  createdAt: string
  pendingActivation: boolean
  permissions: string[]
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

  async function savePermissions(user: User, perms: string[]) {
    setBusy(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: perms }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Błąd zapisu uprawnień')
      setUsers((arr) => arr.map((u) => (u.id === user.id ? { ...u, permissions: data.permissions || perms } : u)))
      setInfo({
        type: 'ok',
        msg: `Uprawnienia ${user.email} zaktualizowane. User musi wylogować się i zalogować ponownie, żeby zmiany weszły w życie.`,
      })
    } catch (e: any) {
      setInfo({ type: 'err', msg: e.message })
    } finally {
      setBusy(null)
    }
  }

  async function sendReset(user: User, kind: 'activation' | 'reset') {
    setBusy(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}/send-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd')
      const what = kind === 'activation' ? 'link aktywacyjny' : 'link resetu hasła'
      if (data.ok) {
        setInfo({ type: 'ok', msg: `Wysłano ${what} na ${user.email} (ważny 1 godzinę).` })
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
          <h2 className="font-semibold text-gray-900">Użytkownicy i uprawnienia</h2>
          <p className="text-sm text-gray-500 mt-1">
            Konta z dostępem do systemu. Klikaj checkboxy żeby nadać/odebrać dostęp do sekcji. Po zmianie user musi się wylogować i zalogować ponownie.
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
        <div className="space-y-3">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isMe={u.email === currentUserEmail}
              busy={busy === u.id}
              onDelete={() => del(u)}
              onReset={(kind) => sendReset(u, kind)}
              onPermissionsChange={(perms) => savePermissions(u, perms)}
            />
          ))}
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

function UserRow({
  user,
  isMe,
  busy,
  onDelete,
  onReset,
  onPermissionsChange,
}: {
  user: User
  isMe: boolean
  busy: boolean
  onDelete: () => void
  onReset: (kind: 'activation' | 'reset') => void
  onPermissionsChange: (perms: string[]) => void
}) {
  // Admin (z env) ma override — w UI checkboxy disabled + komunikat
  const userIsAdmin = isAdmin(user.email)
  // Lokalny state checkboxów — pozwala kliknąć kilka naraz przed save
  const [localPerms, setLocalPerms] = useState<string[]>(user.permissions || [])
  const [dirty, setDirty] = useState(false)

  // Sync gdy parent zaaktualizuje user (np. po fetch)
  useEffect(() => {
    setLocalPerms(user.permissions || [])
    setDirty(false)
  }, [user.permissions])

  function toggle(perm: string) {
    setLocalPerms((arr) => {
      const next = arr.includes(perm) ? arr.filter((p) => p !== perm) : [...arr, perm]
      setDirty(true)
      return next
    })
  }

  function selectAll() {
    setLocalPerms([...ALL_PERMISSIONS])
    setDirty(true)
  }
  function clearAll() {
    setLocalPerms([])
    setDirty(true)
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{user.name || user.email}</span>
            {isMe && (
              <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">to Ty</span>
            )}
            {userIsAdmin && (
              <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Administrator
              </span>
            )}
            {user.pendingActivation ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-medium rounded">
                <Clock className="w-3 h-3" />
                Czeka na aktywację
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-800 text-[10px] font-medium rounded">
                <CheckCircle2 className="w-3 h-3" />
                Aktywne
              </span>
            )}
          </div>
          {user.name && <p className="text-xs text-gray-500 mt-0.5 break-all">{user.email}</p>}
          <p className="text-[10px] text-gray-400 mt-0.5">Dodany {new Date(user.createdAt).toLocaleDateString('pl-PL')}</p>
        </div>
        <div className="inline-flex items-center gap-1">
          {user.pendingActivation ? (
            <button
              onClick={() => onReset('activation')}
              disabled={busy}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1.5 rounded inline-flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
              title="Wyślij ponownie link aktywacyjny — poprzedni mógł wygasnąć (ważny 1 godzinę)"
            >
              <Mail className="w-4 h-4" />
              {busy ? 'Wysyłanie…' : 'Wyślij ponownie zaproszenie'}
            </button>
          ) : (
            <button
              onClick={() => onReset('reset')}
              disabled={busy}
              className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 p-1.5 rounded inline-flex items-center disabled:opacity-50"
              title="Wyślij link do resetu hasła"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {!isMe && (
            <button
              onClick={onDelete}
              disabled={busy}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1.5 rounded inline-flex items-center disabled:opacity-50"
              title="Usuń użytkownika"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {userIsAdmin ? (
        <p className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded px-2 py-1.5">
          Administrator ma dostęp do wszystkich sekcji (override przez NEXT_PUBLIC_ADMIN_EMAIL).
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ALL_PERMISSIONS.map((perm) => {
              const checked = localPerms.includes(perm)
              return (
                <label
                  key={perm}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 border rounded text-xs cursor-pointer select-none transition-colors ${
                    checked
                      ? 'bg-blue-50 border-blue-300 text-blue-800'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(perm)}
                    className="w-3 h-3"
                  />
                  {PERMISSION_LABELS[perm as Permission]}
                </label>
              )
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] text-gray-500 hover:text-gray-700 underline"
            >
              Zaznacz wszystkie
            </button>
            <span className="text-gray-300">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-gray-500 hover:text-gray-700 underline"
            >
              Odznacz wszystkie
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => onPermissionsChange(localPerms)}
                disabled={busy}
                className="ml-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs font-medium px-3 py-1 rounded"
              >
                {busy ? 'Zapisuję...' : '💾 Zapisz uprawnienia'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
