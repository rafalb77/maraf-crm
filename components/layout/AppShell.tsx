'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { MobileNavProvider, useMobileNav } from './MobileNavContext'

const LS_COLLAPSED = 'sidebar.collapsed'

/**
 * Powłoka aplikacji.
 * - Desktop (lg+): sidebar `fixed`, zwijany do 80px (stan w localStorage);
 *   margines treści (`lg:ml-[var(--sb-w)]`) idzie w parze z szerokością panelu.
 * - Mobile (<lg): sidebar staje się wysuwanym drawerem (patrz Sidebar +
 *   MobileNavContext), treść zajmuje pełną szerokość (`ml-0`), a hamburger w
 *   TopBar otwiera panel. Backdrop i zamykanie (Escape / nawigacja) tutaj.
 */
export function AppShell({ topBar, children }: { topBar: React.ReactNode; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  // Zwijanie do 80px to funkcja WYŁĄCZNIE desktopowa (lg+). isDesktop domyślnie
  // true (SSR/pierwszy paint = desktop-first); na mobile ustala się po mount.
  const [isDesktop, setIsDesktop] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setCollapsed(window.localStorage.getItem(LS_COLLAPSED) === '1')
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  function toggle() {
    setCollapsed((v) => {
      const next = !v
      try {
        window.localStorage.setItem(LS_COLLAPSED, next ? '1' : '0')
      } catch {}
      return next
    })
  }

  // Poniżej lg drawer jest ZAWSZE rozwinięty (256px, pełne menu) — inaczej
  // zapamiętany stan „zwinięty" z desktopu zablokowałby panel na 80px bez
  // dostępu do przełącznika (ukryty na mobile).
  const effectiveCollapsed = isDesktop && collapsed

  return (
    <MobileNavProvider>
      <Shell topBar={topBar} collapsed={effectiveCollapsed} onToggleCollapse={toggle}>
        {children}
      </Shell>
    </MobileNavProvider>
  )
}

function Shell({
  topBar,
  collapsed,
  onToggleCollapse,
  children,
}: {
  topBar: React.ReactNode
  collapsed: boolean
  onToggleCollapse: () => void
  children: React.ReactNode
}) {
  const { open, setOpen } = useMobileNav()
  const pathname = usePathname()

  // Drawer zamyka się po każdej nawigacji (zmiana pathname) i na Escape.
  useEffect(() => {
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    // h-dvh zamiast h-screen — na mobile 100vh nie uwzględnia paska adresu przeglądarki.
    <div className="flex h-dvh" style={{ backgroundColor: 'var(--background)' }}>
      {/* Backdrop drawera — tylko mobile, klik zamyka */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
      <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      <div
        className="flex-1 flex flex-col overflow-hidden transition-[margin] duration-200 ease-out ml-0 lg:ml-[var(--sb-w)]"
        style={{ ['--sb-w' as string]: collapsed ? '80px' : '256px' } as React.CSSProperties}
      >
        {topBar}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
