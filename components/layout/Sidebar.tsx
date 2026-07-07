'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { LogoFullOnDark, LogoIcon } from './Logo'
import { isAdmin } from '@/lib/auth-utils'
import { getRequiredPermission } from '@/lib/permissions'
import { useRipple } from '@/lib/ripple'

type NavItem = { href: string; label: string; icon: React.ReactNode }
type NavSection = { label?: string; items: NavItem[] }
type Workspace = {
  id: string
  label: string
  icon: React.ReactNode
  sections: NavSection[]
}

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
  reservations: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
  cases: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
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
  stats: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  diag: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  // Ikony workspace'ów (do switchera) — większe niż w items
  wsCrm: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  wsOps: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  wsFin: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm7 8h2" />
    </svg>
  ),
  wsMkt: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
}

// Pulpit jest GLOBALNY — zawsze widoczny u góry, poza workspace'ami.
const DASHBOARD_ITEM: NavItem = { href: '/dashboard', label: 'Pulpit', icon: ICONS.dashboard }

// Workspace'y — każdy ma swoje sekcje. Sekcje bez items po filtrowaniu permissji
// są ukrywane, workspace bez żadnej widocznej sekcji znika ze switchera.
// Kolejność tu = kolejność w switcherze.
const WORKSPACES: Workspace[] = [
  {
    id: 'crm',
    label: 'CRM',
    icon: ICONS.wsCrm,
    sections: [
      {
        items: [
          { href: '/clients', label: 'Klienci', icon: ICONS.clients },
          { href: '/units', label: 'Lokale', icon: ICONS.units },
          { href: '/rezerwacje', label: 'Rezerwacje', icon: ICONS.reservations },
          { href: '/oferty', label: 'Oferty', icon: ICONS.offers },
          { href: '/sales', label: 'Sprzedaż', icon: ICONS.sales },
          { href: '/service', label: 'Serwis', icon: ICONS.service },
          { href: '/cases', label: 'Sprawy', icon: ICONS.cases },
          { href: '/mailing', label: 'Mailing', icon: ICONS.mailing },
          { href: '/calendar', label: 'Kalendarz', icon: ICONS.calendar },
          { href: '/statystyki', label: 'Statystyki', icon: ICONS.stats },
        ],
      },
    ],
  },
  {
    id: 'przeroby',
    label: 'Przeroby',
    icon: ICONS.wsOps,
    sections: [
      {
        items: [
          { href: '/przeroby', label: 'Pulpit przerobów', icon: ICONS.przeroby },
          { href: '/przeroby/obmiar', label: 'Obmiar Maraf', icon: ICONS.units },
          { href: '/przeroby/porownanie', label: 'Porównanie obmiarów', icon: ICONS.dashboard },
          { href: '/przeroby/podwykonawcy', label: 'Podwykonawcy', icon: ICONS.contractors },
          { href: '/przeroby/protokoly', label: 'Protokoły', icon: ICONS.sales },
        ],
      },
    ],
  },
  {
    id: 'fin',
    label: 'Finanse',
    icon: ICONS.wsFin,
    sections: [
      {
        items: [
          { href: '/finanse', label: 'Pulpit finansów', icon: ICONS.dashboard },
          { href: '/finanse/kolejka-platnosci', label: 'Kolejka płatności', icon: ICONS.sales },
          { href: '/finanse/faktury', label: 'Faktury kosztowe', icon: ICONS.offers },
          { href: '/finanse/przychody', label: 'Faktury przychodowe', icon: ICONS.offers },
          { href: '/finanse/podatki', label: 'Podatki (CIT/VAT)', icon: ICONS.dashboard },
          { href: '/finanse/kaucje', label: 'Kaucje gwarancyjne', icon: ICONS.units },
          { href: '/finanse/finansowanie', label: 'Finansowanie inwestycji', icon: ICONS.offers },
          { href: '/finanse/kontrahenci', label: 'Kontrahenci', icon: ICONS.contractors },
          { href: '/finanse/ksef', label: 'Konfiguracja KSeF', icon: ICONS.settings },
          { href: '/finanse/import', label: 'Import xlsx', icon: ICONS.mailing },
          { href: '/finanse/statystyki', label: 'Statystyki', icon: ICONS.stats },
        ],
      },
    ],
  },
  {
    id: 'mkt',
    label: 'Marketing',
    icon: ICONS.wsMkt,
    // Brak modułów — workspace ukryty do czasu Meta Ads.
    sections: [],
  },
  // Konfiguracja NIE jest workspace'em w switcherze — link „Ustawienia" jest
  // przypięty na dole sidebara, nad „Wyloguj" (tylko admin).
]

// Link Ustawienia (admin-only) — przypięty na dole, poza switcherem workspace'ów.
const SETTINGS_ITEM: NavItem = { href: '/settings', label: 'Ustawienia', icon: ICONS.settings }
// Diagnostyka wydajności — przypięta na dole, dostępna dla każdego zalogowanego.
const DIAG_ITEM: NavItem = { href: '/diagnostyka', label: 'Diagnostyka', icon: ICONS.diag }

const LS_KEY = 'sidebar.workspace'

// Oprawa v2: sidebar jest ciemny w OBU motywach (gradient navy→grafit),
// więc nie czyta zmiennych motywu — ma własną, stałą paletę kremowo-złotą.
const SB = {
  bg: 'linear-gradient(180deg, #1F2D3F 0%, #161E2B 100%)',
  border: 'rgba(242,232,214,.10)',
  text: 'rgba(242,232,214,.72)',
  textStrong: '#F2E8D6',
  muted: 'rgba(242,232,214,.45)',
  hoverBg: 'rgba(242,232,214,.08)',
  activeText: '#E8D0B0',
  activeBg: 'linear-gradient(135deg, rgba(201,163,122,.26), rgba(201,163,122,.10))',
  activeBar: 'inset 3px 0 0 #D4A574',
  gold: '#D4A574',
  switcherBorder: 'rgba(242,232,214,.14)',
  switcherBg: 'rgba(242,232,214,.06)',
  switcherOpenBg: 'rgba(242,232,214,.12)',
  dropdownBg: '#1F2D3F',
}

// Ikona podwójnej strzałki — zwiń (w lewo) / rozwiń (w prawo)
const CollapseIcon = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d={dir === 'left' ? 'M11 19l-7-7 7-7m8 14l-7-7 7-7' : 'M13 5l7 7-7 7M5 5l7 7-7 7'}
    />
  </svg>
)

/** Znajduje workspace zawierający aktualny pathname (po prefiksie URL). */
function workspaceForPath(pathname: string): string | null {
  for (const ws of WORKSPACES) {
    for (const sec of ws.sections) {
      for (const item of sec.items) {
        if (pathname === item.href || pathname.startsWith(item.href + '/')) return ws.id
      }
    }
  }
  return null
}

export function Sidebar({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean
  onToggleCollapse?: () => void
} = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const userIsAdmin = isAdmin(session?.user?.email)
  const userPermissions = (session?.user as any)?.permissions as string[] | undefined
  // sessionNotReady = nie mamy potwierdzonych danych sesji. Obejmuje WSZYSTKIE
  // stany inne niż 'authenticated': 'loading' (świeży refresh), 'unauthenticated'
  // (cookie wygasł / fetch sesji padł / wolny network). W każdym z nich nie znamy
  // permissions usera — pokazujemy wszystko niż pusty sidebar; gdy user kliknie
  // niedostępną pozycję, middleware go przekieruje. Po loaded sesji filtrujemy
  // normalnie.
  const sessionNotReady = status !== 'authenticated'

  // Workspace ulubiony (zapamiętany w localStorage) — używany gdy pathname nie pasuje
  // do żadnego workspace'a (np. /dashboard, /profil).
  const [storedWs, setStoredWs] = useState<string>('crm')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const v = window.localStorage.getItem(LS_KEY)
    if (v) setStoredWs(v)
  }, [])

  // Active workspace: pathname > localStorage > default 'crm'
  const detectedWs = workspaceForPath(pathname)
  const activeWsId = detectedWs ?? storedWs

  // Permissions: filtr per-section per-workspace. Workspace bez żadnej widocznej
  // sekcji (po filtrowaniu) jest ukrywany ze switchera.
  function filterByPermissions(ws: Workspace): Workspace {
    if (userIsAdmin) return ws
    const sections = ws.sections
      .map((s) => ({
        ...s,
        items: s.items.filter((item) => {
          const required = getRequiredPermission(item.href)
          if (required === null) return true
          if (required === 'admin') return false
          return (userPermissions || []).includes(required)
        }),
      }))
      .filter((s) => s.items.length > 0)
    return { ...ws, sections }
  }

  // Gdy sesja niepotwierdzona (loading / unauthenticated / fetch padł) POKAZUJEMY
  // wszystkie workspace'y żeby uniknąć pustego sidebara. Po authenticated —
  // filtrujemy normalnie. Inaczej user ma flashe pustego menu albo zostaje z nim
  // na stałe gdy session fetch nie wraca.
  const visibleWorkspaces = sessionNotReady
    ? WORKSPACES.filter((ws) => ws.sections.length > 0)
    : WORKSPACES.map(filterByPermissions).filter((ws) => ws.sections.length > 0)
  const activeWs =
    visibleWorkspaces.find((w) => w.id === activeWsId) ?? visibleWorkspaces[0] ?? null

  // Pulpit — widoczny dla każdego z permission 'dashboard' (lub admin).
  // W loading state pokazujemy zawsze, żeby user nie miał pustego sidebara
  // gdy useSession() jeszcze nie zwróciło danych.
  const dashboardRequired = getRequiredPermission(DASHBOARD_ITEM.href)
  const showDashboard =
    sessionNotReady ||
    userIsAdmin ||
    dashboardRequired === null ||
    (dashboardRequired !== 'admin' && (userPermissions || []).includes(dashboardRequired))

  const ripple = useRipple()
  const itemBase =
    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150'

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col z-30 transition-[width] duration-200 ease-out"
      style={{ background: SB.bg, borderRight: '1px solid rgba(242,232,214,.08)', width: collapsed ? 80 : 256 }}
    >
      {/* Logo — klik prowadzi na stronę główną (Pulpit). 64px — spójnie z TopBarem. */}
      <div
        className={`h-16 flex-shrink-0 flex items-center border-b overflow-hidden ${collapsed ? 'justify-center px-0' : 'px-5'}`}
        style={{ borderColor: SB.border }}
      >
        <Link href="/dashboard" prefetch={false} aria-label="Strona główna" className="inline-block">
          {collapsed ? <LogoIcon className="w-9 h-9" /> : <LogoFullOnDark />}
        </Link>
      </div>

      {/* Workspace switcher — pełny gdy rozwinięty; zwinięty: sam ikonowy przycisk (rozwija panel) */}
      {visibleWorkspaces.length > 1 && activeWs && (
        <div className="px-3 pt-3">
          {collapsed ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={activeWs.label}
              className="w-full flex items-center justify-center py-2 rounded-lg border transition-colors"
              style={{ backgroundColor: SB.switcherBg, borderColor: SB.switcherBorder, color: SB.gold }}
            >
              {activeWs.icon}
            </button>
          ) : (
            <WorkspaceSwitcher
              workspaces={visibleWorkspaces}
              active={activeWs}
              onSelect={(wsId) => {
                const ws = visibleWorkspaces.find((w) => w.id === wsId)
                if (!ws) return
                window.localStorage.setItem(LS_KEY, wsId)
                setStoredWs(wsId)
                const firstItem = ws.sections[0]?.items[0]
                if (firstItem) router.push(firstItem.href)
              }}
            />
          )}
        </div>
      )}

      {/* Nav: Pulpit + sekcje aktualnego workspace'a */}
      <nav className="sidebar-nav flex-1 px-3 py-4 overflow-y-auto">
        {showDashboard && (
          <ul className="space-y-0.5 mb-4">
            <NavLink item={DASHBOARD_ITEM} active={isActive(DASHBOARD_ITEM.href)} itemBase={itemBase} collapsed={collapsed} />
          </ul>
        )}
        {activeWs?.sections.map((section, idx) => (
          <div key={idx} className={idx > 0 ? 'mt-5' : ''}>
            {section.label && !collapsed && (
              <div
                className="px-3 mb-2 text-[10px] font-semibold tracking-wider uppercase"
                style={{ color: SB.muted }}
              >
                {section.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} itemBase={itemBase} collapsed={collapsed} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Diagnostyka + Konfiguracja + Logout — przypięte na dole. Ustawienia tylko dla admina. */}
      <div className="px-3 py-4 border-t space-y-0.5" style={{ borderColor: SB.border }}>
        <ul className="space-y-0.5">
          <NavLink item={DIAG_ITEM} active={isActive(DIAG_ITEM.href)} itemBase={itemBase} collapsed={collapsed} />
        </ul>
        {(userIsAdmin || sessionNotReady) && (
          <ul className="space-y-0.5">
            <NavLink item={SETTINGS_ITEM} active={isActive(SETTINGS_ITEM.href)} itemBase={itemBase} collapsed={collapsed} />
          </ul>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          onPointerDown={ripple}
          title={collapsed ? 'Wyloguj' : undefined}
          className={itemBase + ' w-full' + (collapsed ? ' justify-center' : '')}
          style={{ color: SB.text }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = SB.hoverBg
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {ICONS.logout}
          {!collapsed && 'Wyloguj'}
        </button>

        {/* Zwiń / rozwiń panel */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Rozwiń panel' : 'Zwiń panel'}
            aria-label={collapsed ? 'Rozwiń panel' : 'Zwiń panel'}
            className={itemBase + ' w-full' + (collapsed ? ' justify-center' : '')}
            style={{ color: SB.muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = SB.hoverBg
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <CollapseIcon dir={collapsed ? 'right' : 'left'} />
            {!collapsed && 'Zwiń panel'}
          </button>
        )}
      </div>
    </aside>
  )
}

// =====================================================================
// NavLink — pojedyncza pozycja menu (Link z aktywnym podświetleniem)
// =====================================================================

function NavLink({
  item,
  active,
  itemBase,
  collapsed = false,
}: {
  item: NavItem
  active: boolean
  itemBase: string
  collapsed?: boolean
}) {
  const ripple = useRipple()
  return (
    <li>
      <Link
        href={item.href}
        prefetch={false}
        onPointerDown={ripple}
        title={collapsed ? item.label : undefined}
        className={itemBase + (collapsed ? ' justify-center' : '')}
        style={
          active
            ? {
                background: SB.activeBg,
                color: SB.activeText,
                boxShadow: SB.activeBar,
              }
            : { color: SB.text }
        }
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.backgroundColor = SB.hoverBg
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        {item.icon}
        {!collapsed && item.label}
      </Link>
    </li>
  )
}

// =====================================================================
// WorkspaceSwitcher — dropdown z listą workspace'ów
// =====================================================================

function WorkspaceSwitcher({
  workspaces,
  active,
  onSelect,
}: {
  workspaces: Workspace[]
  active: Workspace
  onSelect: (wsId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const ripple = useRipple()

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onPointerDown={ripple}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
        style={{
          backgroundColor: open ? SB.switcherOpenBg : SB.switcherBg,
          borderColor: SB.switcherBorder,
          color: SB.textStrong,
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.backgroundColor = SB.switcherOpenBg
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.backgroundColor = SB.switcherBg
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span style={{ color: SB.gold }}>{active.icon}</span>
          <span className="truncate">{active.label}</span>
        </span>
        <span
          className="transition-transform"
          style={{
            color: SB.muted,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          {ICONS.chevronDown}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-1 rounded-lg border shadow-lg z-40 overflow-hidden"
          style={{
            backgroundColor: SB.dropdownBg,
            borderColor: SB.switcherBorder,
          }}
        >
          {workspaces.map((ws) => {
            const isActive = ws.id === active.id
            return (
              <button
                key={ws.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setOpen(false)
                  if (!isActive) onSelect(ws.id)
                }}
                onPointerDown={ripple}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                style={{
                  backgroundColor: isActive ? SB.hoverBg : 'transparent',
                  color: isActive ? SB.activeText : SB.text,
                  fontWeight: isActive ? 600 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = SB.hoverBg
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {ws.icon}
                <span className="truncate">{ws.label}</span>
                {isActive && (
                  <span
                    className="ml-auto text-[10px] uppercase tracking-wider"
                    style={{ color: SB.muted }}
                  >
                    aktywne
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
