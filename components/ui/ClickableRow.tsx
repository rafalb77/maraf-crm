'use client'
import { useRouter } from 'next/navigation'

/**
 * Wiersz tabeli który po kliknięciu (gdziekolwiek) przechodzi do `href`.
 * Zagnieżdżone <a>/<button> nadal działają — dodaj im onClick stopPropagation
 * jeśli prowadzą gdzie indziej niż `href`.
 */
export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  return (
    <tr onClick={() => router.push(href)} className={`cursor-pointer ${className ?? ''}`}>
      {children}
    </tr>
  )
}
