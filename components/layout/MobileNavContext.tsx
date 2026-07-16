'use client'
import { createContext, useContext, useState } from 'react'

// Stan wysuwanego sidebara na mobile (<lg). Provider siedzi w AppShell,
// konsumują go TopBar (hamburger otwiera) i Sidebar (drawer się wysuwa).
// Na lg+ stan nie ma znaczenia — sidebar jest zawsze widoczny (CSS lg:translate-x-0).
type MobileNavState = { open: boolean; setOpen: (v: boolean) => void }

const MobileNavContext = createContext<MobileNavState>({ open: false, setOpen: () => {} })

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>
}

export function useMobileNav() {
  return useContext(MobileNavContext)
}
