// MARAF Development logo — uses real PNG assets from public/.
// Two horizontal versions (600×200) swap based on light/dark theme via CSS.
// File naming follows the "background it sits on" convention:
//   logo-icon-dark.png  → dark artwork on LIGHT background (light theme)
//   logo-icon-light.png → light artwork on DARK background (dark theme)

import Image from 'next/image'

export function LogoFull({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} style={{ width: 200, height: 64 }}>
      {/* Light theme variant */}
      <Image
        src="/logo-icon-light.png"
        alt="MARAF Development"
        fill
        priority
        sizes="200px"
        className="object-contain object-left dark:hidden"
      />
      {/* Dark theme variant */}
      <Image
        src="/logo-icon-dark.png"
        alt="MARAF Development"
        fill
        priority
        sizes="200px"
        className="object-contain object-left hidden dark:block"
      />
    </div>
  )
}

export function LogoIcon({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Image
        src="/logo-icon.png"
        alt="MARAF"
        fill
        sizes="64px"
        className="object-contain"
      />
    </div>
  )
}
