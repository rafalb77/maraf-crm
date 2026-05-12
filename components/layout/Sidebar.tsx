'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { LogoFull } from './Logo'
import { isAdmin, isContractor } from '@/lib/auth-utils'

type NavItem = { href: string; label: string; icon: React.ReactNode }
type NavSection = { label?: string; items: NavItem[] }

const ICONS = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  clients: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  units: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  sales: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  offers: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  service: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  ),
  calendar: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  mailing: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  przeroby: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  contractors: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h-3m-11 0h3m0 0v-3.5a1.5 1.5 0 013 0V21m-3 0h3M9 7h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
}

const sections: NavSection[] = [
  {
    items: [{ href: '/dashboard', label: 'Pulpit', icon: ICONS.dashboard }],
  },
  {
    label: 'CRM',
    items: [
      { href: '/clients', label: 'Klienci', icon: ICONS.clients },
      { href: '/units', label: 'Lokale', icon: ICONS.units },
      { href: '/oferty', label: 'Oferty', icon: ICONS.offers },
      { href: '/sales', label: 'Sprzedaż', icon: ICONS.sales },
      { href: '/service', label: 'Serwis', icon: ICONS.service },
      { href: '/mailing', label: 'Mailing', icon: ICONS.mailing },
      { href: '/calendar', label: 'Kalendarz', icon: ICONS.calendar },
    ],
  },
  {
    label: 'Przeroby',
    items: [
      { href: '/przeroby', label: 'Pulpit przerobów', icon: ICONS.przeroby },
      { href: '/przeroby/obmiar', label: 'Obmiar Maraf', icon: ICONS.units },
      { href: '/przeroby/porownanie', label: 'Porównanie obmiarów', icon: ICONS.dashboard },
      { href: '/przeroby/podwykonawcy', label: 'Podwykonawcy', icon: ICONS.contractors },
      { href: '/przeroby/protokoly', label: 'Protokoły', icon: ICONS.sales },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const userIsAdmin = isAdmin(session?.user?.email)
  const userIsContractor = isContractor(session?.user?.email)

  // Contractor (np. Konrad-kierownik) widzi tylko sekcje Przeroby.
  // Middleware blokuje inne strony server-side; tu odfiltrowujemy nav.
  const visibleSections = userIsContractor
    ? sections.filter((s) => s.label === 'Przeroby')
    : sections

  const itemBase = 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150'

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full w-64 flex flex-col z-30 border-r"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <LogoFull />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {visibleSections.map((section, idx) => (
          <div key={idx} className={idx > 0 ? 'mt-5' : ''}>
            {section.label && (
              <div
                className="px-3 mb-2 text-[10px] font-semibold tracking-wider uppercase"
                style={{ color: 'var(--text-muted)' }}
              >
                {section.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      className={itemBase}
                      style={
                        active
                          ? {
                              background: 'linear-gradient(135deg, rgba(201,163,122,0.18), rgba(201,163,122,0.08))',
                              color: 'var(--accent)',
                              boxShadow: 'inset 3px 0 0 var(--accent)',
                            }
                          : { color: 'var(--text-secondary)' }
                      }
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = 'var(--surface-hover)'
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom: settings (tylko admin) + logout */}
      <div className="px-3 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
        {userIsAdmin && (
          <Link
            href="/settings"
            prefetch={false}
            className={itemBase + ' mb-1'}
            style={
              isActive('/settings')
                ? {
                    background: 'linear-gradient(135deg, rgba(201,163,122,0.18), rgba(201,163,122,0.08))',
                    color: 'var(--accent)',
                    boxShadow: 'inset 3px 0 0 var(--accent)',
                  }
                : { color: 'var(--text-secondary)' }
            }
            onMouseEnter={(e) => {
              if (!isActive('/settings')) e.currentTarget.style.backgroundColor = 'var(--surface-hover)'
            }}
            onMouseLeave={(e) => {
              if (!isActive('/settings')) e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {ICONS.settings}
            Ustawienia
          </Link>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          className={itemBase + ' w-full'}
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          {ICONS.logout}
          Wyloguj
        </button>
      </div>
    </aside>
  )
}
