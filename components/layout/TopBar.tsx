'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { User, LogOut, ChevronDown } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { Avatar } from '@/components/profil/Avatar'
import { useRipple } from '@/lib/ripple'

export function TopBar({
  userName,
  userEmail,
}: {
  userName?: string | null
  userEmail?: string | null
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const ripple = useRipple()

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <header
      className="sticky top-0 z-20 h-16 flex items-center justify-end gap-3 px-6 border-b"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--background) 70%, transparent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'color-mix(in srgb, var(--border) 55%, transparent)',
      }}
    >
      <ThemeToggle />

      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onPointerDown={ripple}
          className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {/* Złota obwódka avatara (oprawa v2) */}
          <span
            className="flex rounded-full flex-shrink-0"
            style={{ boxShadow: '0 0 0 2px var(--surface), 0 0 0 4px var(--accent-soft)' }}
          >
            <Avatar email={userEmail} name={userName} size={28} />
          </span>
          <span
            className="hidden sm:block text-sm max-w-[160px] truncate"
            style={{ color: 'var(--text-secondary)' }}
          >
            {userName || userEmail || 'Konto'}
          </span>
          <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-xl border shadow-lg overflow-hidden"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
          >
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {userName || 'Konto'}
              </p>
              {userEmail && (
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {userEmail}
                </p>
              )}
            </div>
            <Link
              href="/profil"
              prefetch={false}
              onClick={() => setOpen(false)}
              onPointerDown={ripple}
              role="menuitem"
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              style={{ color: 'var(--text-primary)' }}
            >
              <User className="w-4 h-4" />
              Mój profil
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                signOut({ callbackUrl: '/auth/signin' })
              }}
              onPointerDown={ripple}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              style={{ color: 'var(--text-primary)' }}
            >
              <LogOut className="w-4 h-4" />
              Wyloguj
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
