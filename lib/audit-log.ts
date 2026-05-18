/**
 * Audit log helper — zapisuje wpis do tabeli `AuditLog`.
 *
 * Strategia:
 *  - Fire-and-forget — nie czekamy na zapis (`void` nie błokuje response).
 *  - Błąd zapisu logowany w console (nie rzucamy — żeby audit nie psuł UX).
 *  - Per-request użycie w endpointach: po success operacji wywołuje `audit({...})`.
 *
 * Akcje (string enum) — kanonika nazw poniżej w `AuditAction`. Trzymamy się ich
 * w UI filtrach. Dodać nową = dopisać do typu + użyć.
 *
 * Patrz: `prisma/schema.prisma` model `AuditLog` (komentarz nad).
 */
import { prisma } from './prisma'
import type { NextRequest } from 'next/server'

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAIL'
  | 'LOGOUT'
  | 'VIEW_CLIENT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXPORT'
  | 'PERMISSION_CHANGE'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET'

export type AuditArgs = {
  userId?: string | null
  userEmail?: string | null
  action: AuditAction
  entity?: string | null
  entityId?: string | null
  path?: string | null
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Asynchroniczny zapis. NIE awaituj jeśli zależy ci na szybkim response —
 * audit log nie powinien blokować ścieżki user-facing.
 */
export async function audit(args: AuditArgs): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: args.userId ?? null,
        userEmail: args.userEmail ?? null,
        action: args.action,
        entity: args.entity ?? null,
        entityId: args.entityId ?? null,
        path: args.path ?? null,
        ip: args.ip ?? null,
        userAgent: args.userAgent ? args.userAgent.slice(0, 500) : null,
        metadata: args.metadata ? JSON.stringify(args.metadata).slice(0, 4000) : null,
      },
    })
  } catch (err: any) {
    // Audit log NIE może rozwalać operacji biznesowych. Logujemy do konsoli.
    console.error('[audit-log] zapis nieudany:', err?.message || err)
  }
}

/**
 * Wyciąga IP + user-agent z NextRequest dla wygodnego logowania.
 */
export function extractRequestMeta(req: NextRequest): { ip: string; userAgent: string } {
  const xff = req.headers.get('x-forwarded-for')
  const xri = req.headers.get('x-real-ip')
  const ip = xff?.split(',')[0].trim() || xri || 'unknown'
  const userAgent = req.headers.get('user-agent') || 'unknown'
  return { ip, userAgent }
}
