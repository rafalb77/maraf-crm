'use client'
import { ThemeToggle } from './ThemeToggle'

export function TopBar({ userName }: { userName?: string | null }) {
  return (
    <header
      className="sticky top-0 z-20 h-14 flex items-center justify-end gap-3 px-6 border-b backdrop-blur"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--background) 85%, transparent)',
        borderColor: 'var(--border)',
      }}
    >
      {userName && (
        <div className="hidden sm:flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{
              background: 'linear-gradient(135deg, #E8D0B0, #C9A37A, #8B6F47)',
              color: '#1F2D3F',
            }}
          >
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <span>{userName}</span>
        </div>
      )}
      <ThemeToggle />
    </header>
  )
}
