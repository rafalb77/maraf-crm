'use client'
import { useState, useMemo } from 'react'
import { X, Loader2, Check } from 'lucide-react'
import { Avatar } from './Avatar'

// MUSI być w sync z lib/news-feed.ts (PREDEFINED_TOPIC_IDS + TOPIC_META).
// Trzymane w komponencie bo dotyczy UI; jeśli zmienisz w jednym miejscu, zmień w drugim.
const PREDEFINED_TOPICS: { id: string; label: string; emoji: string }[] = [
  { id: 'tech', label: 'Nowe technologie', emoji: '🚀' },
  { id: 'world', label: 'Ze świata', emoji: '🌍' },
  { id: 'business', label: 'Biznes & finanse', emoji: '💼' },
  { id: 'motivation', label: 'Motywacja & samorozwój', emoji: '💪' },
  { id: 'biohacking', label: 'Biohacking', emoji: '🧬' },
  { id: 'architecture', label: 'Architektura', emoji: '🏛️' },
  { id: 'real-estate', label: 'Rynek nieruchomości', emoji: '🏘️' },
]

const MAX_CUSTOM = 5
const MAX_CUSTOM_LEN = 50

export type ProfileUser = {
  id: string
  email: string
  name: string | null
  preferredName: string | null
  interests: string[]
  customInterests: string[]
}

export function ProfileForm({ initial }: { initial: ProfileUser }) {
  const [preferredName, setPreferredName] = useState(initial.preferredName || '')
  const [interests, setInterests] = useState<string[]>(initial.interests)
  const [customInterests, setCustomInterests] = useState<string[]>(initial.customInterests)
  const [newCustom, setNewCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dirty = useMemo(() => {
    if ((preferredName || null) !== (initial.preferredName || null)) return true
    if (interests.length !== initial.interests.length) return true
    if (interests.some((v, i) => v !== initial.interests[i])) return true
    if (customInterests.length !== initial.customInterests.length) return true
    if (customInterests.some((v, i) => v !== initial.customInterests[i])) return true
    return false
  }, [preferredName, interests, customInterests, initial])

  function toggleInterest(id: string) {
    setInterests((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  function addCustom() {
    const v = newCustom.trim().slice(0, MAX_CUSTOM_LEN)
    if (!v) return
    if (customInterests.length >= MAX_CUSTOM) return
    if (customInterests.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setNewCustom('')
      return
    }
    setCustomInterests((cur) => [...cur, v])
    setNewCustom('')
  }

  function removeCustom(idx: number) {
    setCustomInterests((cur) => cur.filter((_, i) => i !== idx))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredName: preferredName.trim() || null,
          interests,
          customInterests,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Błąd zapisu')
      } else {
        setSavedAt(Date.now())
        setTimeout(() => setSavedAt(null), 2500)
        // Update "initial" snapshot so "dirty" znowu == false
        initial.preferredName = data.user.preferredName
        initial.interests = data.user.interests
        initial.customInterests = data.user.customInterests
      }
    } catch (e: any) {
      setError(e?.message || 'Błąd sieci')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header z avatarem */}
      <div className="flex items-center gap-4">
        <Avatar
          email={initial.email}
          name={initial.name}
          preferredName={preferredName || initial.preferredName}
          size={64}
        />
        <div>
          <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {preferredName.trim() || initial.name || initial.email}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {initial.email}
          </p>
        </div>
      </div>

      {/* Sekcja: Powitanie */}
      <Section title="Powitanie w dashboardzie" hint="Jak system ma się do Ciebie zwracać w nagłówku na Pulpicie.">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Preferowane imię
          </span>
          <input
            type="text"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            maxLength={50}
            placeholder={initial.name?.split(/\s+/)[0] || initial.email.split('@')[0]}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
          <span className="block mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Puste = pierwsze słowo z pełnego imienia, a jeśli brak — część e-maila przed @.
          </span>
        </label>
      </Section>

      {/* Sekcja: Predefined interests */}
      <Section
        title="Tematy newsów na Pulpicie"
        hint="System każdego dnia pokaże 1 news dnia, deterministycznie wybrany z Twoich zainteresowań. Bez zaznaczenia: domyślnie świat, biznes, architektura, rynek nieruchomości."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PREDEFINED_TOPICS.map((t) => {
            const checked = interests.includes(t.id)
            return (
              <label
                key={t.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors"
                style={{
                  background: checked ? 'rgba(201,163,122,0.12)' : 'var(--surface)',
                  borderColor: checked ? 'var(--accent)' : 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleInterest(t.id)}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
                <span className="text-base">{t.emoji}</span>
                <span className="text-sm">{t.label}</span>
              </label>
            )
          })}
        </div>
      </Section>

      {/* Sekcja: Custom interests */}
      <Section
        title="Twoje własne tematy"
        hint={`Newsy wyszukiwane przez Google News dla podanego hasła. Maks. ${MAX_CUSTOM} pozycji, każda do ${MAX_CUSTOM_LEN} znaków.`}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          {customInterests.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full text-sm border"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              {v}
              <button
                type="button"
                onClick={() => removeCustom(i)}
                className="rounded-full p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={`Usuń ${v}`}
              >
                <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              </button>
            </span>
          ))}
          {customInterests.length === 0 && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Brak własnych tematów.
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newCustom}
            onChange={(e) => setNewCustom(e.target.value.slice(0, MAX_CUSTOM_LEN))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
            placeholder='np. "sztuczna inteligencja", "giełda warszawska"'
            disabled={customInterests.length >= MAX_CUSTOM}
            className="flex-1 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 disabled:opacity-50"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!newCustom.trim() || customInterests.length >= MAX_CUSTOM}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{
              background: 'var(--accent)',
              color: '#1F2D3F',
            }}
          >
            Dodaj
          </button>
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {customInterests.length}/{MAX_CUSTOM}
        </p>
      </Section>

      {/* Save bar */}
      <div className="flex items-center gap-3 sticky bottom-0 -mx-8 px-8 py-4 border-t backdrop-blur"
           style={{
             background: 'color-mix(in srgb, var(--background) 90%, transparent)',
             borderColor: 'var(--border)',
           }}>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{
            background: 'var(--accent)',
            color: '#1F2D3F',
          }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Zapisz zmiany
        </button>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#2D7D46' }}>
            <Check className="w-4 h-4" />
            Zapisano
          </span>
        )}
        {error && (
          <span className="text-sm" style={{ color: '#B91C1C' }}>
            {error}
          </span>
        )}
        {!dirty && !savedAt && !error && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Brak zmian
          </span>
        )}
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      {hint && (
        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
      {children}
    </section>
  )
}
