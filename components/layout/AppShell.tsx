'use client'
import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'

// Szerokości panelu bocznego — muszą być zsynchronizowane z marginesem treści.
const W_EXPANDED = 256 // w-64
const W_COLLAPSED = 72
const LS_COLLAPSED = 'sidebar.collapsed'

/**
 * Powłoka aplikacji: trzyma stan zwinięcia sidebara (localStorage) i utrzymuje
 * margines treści w zgodzie z szerokością panelu. Sidebar jest `fixed`, więc
 * treść musi mieć odpowiadający margines lewy.
 */
export function AppShell({ topBar, children }: { topBar: React.ReactNode; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setCollapsed(window.localStorage.getItem(LS_COLLAPSED) === '1')
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

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
      <div
        className="flex-1 flex flex-col overflow-hidden transition-[margin] duration-200 ease-out"
        style={{ marginLeft: collapsed ? W_COLLAPSED : W_EXPANDED }}
      >
        {topBar}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
