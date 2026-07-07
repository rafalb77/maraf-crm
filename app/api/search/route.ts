import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth-utils'
import {
  CLIENT_STATUS_LABELS,
  UNIT_STATUS_LABELS,
  SERVICE_STATUS_LABELS,
  CASE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  PURCHASE_INVOICE_STATUS_LABELS,
  SALES_INVOICE_STATUS_LABELS,
  VENDOR_CATEGORY_LABELS,
} from '@/lib/types'

/**
 * Globalna wyszukiwarka (⌘K) — przeszukuje główne encje CRM/ERP.
 *
 * - Respektuje permissions usera: przeszukuje TYLKO moduły do których user ma
 *   dostęp (admin ma override). Ten sam model co middleware/Sidebar.
 * - Pola szyfrowane at-rest (pesel, nip, idNumber, adres — patrz lib/crypto.ts)
 *   NIE są przeszukiwane: `contains` po zaszyfrowanym ciągu nic nie znajdzie.
 *   Szukamy po polach jawnych (imię/nazwisko/email/telefon, numery, tytuły).
 * - Każdy moduł zwraca max ITEMS_PER_GROUP trafień; grupy w stałej kolejności.
 */

const ITEMS_PER_GROUP = 6

// Statusy ofert nie mają mapy w lib/types.ts — lokalny słownik na potrzeby badge.
const OFFER_STATUS_LABELS: Record<string, string> = {
  SZKIC: 'Szkic',
  WYSLANA: 'Wysłana',
  ZAAKCEPTOWANA: 'Zaakceptowana',
  ODRZUCONA: 'Odrzucona',
  WYGASLA: 'Wygasła',
}

type SearchResult = {
  id: string
  group: string
  groupLabel: string
  title: string
  subtitle?: string
  badge?: string
  url: string
}

function label(map: Record<string, string>, key: string | null | undefined): string | undefined {
  if (!key) return undefined
  return map[key] ?? key
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const permissions = ((session.user as any)?.permissions as string[] | undefined) || []
  const admin = isAdmin(session.user?.email)
  const can = (perm: string) => admin || permissions.includes(perm)

  const like = { contains: q, mode: 'insensitive' as const }
  const tasks: Promise<SearchResult[]>[] = []

  if (can('clients')) {
    tasks.push(
      prisma.client
        .findMany({
          where: {
            OR: [
              { firstName: like },
              { lastName: like },
              { email: like },
              { phone: like },
            ],
          },
          take: ITEMS_PER_GROUP,
          orderBy: { updatedAt: 'desc' },
        })
        .then((rows) =>
          rows.map((c) => ({
            id: c.id,
            group: 'clients',
            groupLabel: 'Klienci',
            title: `${c.firstName} ${c.lastName}`.trim(),
            subtitle: [c.email, c.phone].filter(Boolean).join(' · ') || undefined,
            badge: label(CLIENT_STATUS_LABELS, c.status),
            url: `/clients/${c.id}`,
          })),
        ),
    )
  }

  if (can('units')) {
    tasks.push(
      prisma.unit
        .findMany({
          where: {
            OR: [{ number: like }, { building: like }, { description: like }],
          },
          take: ITEMS_PER_GROUP,
          orderBy: { number: 'asc' },
        })
        .then((rows) =>
          rows.map((u) => ({
            id: u.id,
            group: 'units',
            groupLabel: 'Lokale',
            title: u.number,
            subtitle: [u.building, u.area ? `${u.area} m²` : null].filter(Boolean).join(' · ') || undefined,
            badge: label(UNIT_STATUS_LABELS, u.status),
            url: `/units/${u.id}`,
          })),
        ),
    )
  }

  if (can('oferty')) {
    tasks.push(
      prisma.offer
        .findMany({
          where: { OR: [{ number: like }, { title: like }] },
          take: ITEMS_PER_GROUP,
          orderBy: { updatedAt: 'desc' },
          include: { client: { select: { firstName: true, lastName: true } } },
        })
        .then((rows) =>
          rows.map((o) => ({
            id: o.id,
            group: 'oferty',
            groupLabel: 'Oferty',
            title: o.title || o.number || 'Oferta',
            subtitle: o.client ? `${o.client.firstName} ${o.client.lastName}`.trim() : o.number || undefined,
            badge: label(OFFER_STATUS_LABELS, o.status),
            url: `/oferty/${o.id}`,
          })),
        ),
    )
  }

  if (can('sales')) {
    tasks.push(
      prisma.contract
        .findMany({
          where: { OR: [{ number: like }, { investmentName: like }] },
          take: ITEMS_PER_GROUP,
          orderBy: { updatedAt: 'desc' },
          include: { client: { select: { firstName: true, lastName: true } } },
        })
        .then((rows) =>
          rows.map((c) => ({
            id: c.id,
            group: 'sales',
            groupLabel: 'Sprzedaż',
            title: c.number,
            subtitle: c.client ? `${c.client.firstName} ${c.client.lastName}`.trim() : c.investmentName,
            badge: label(CONTRACT_STATUS_LABELS, c.status),
            url: `/sales/${c.id}`,
          })),
        ),
    )
  }

  if (can('service')) {
    tasks.push(
      prisma.serviceRequest
        .findMany({
          where: { OR: [{ title: like }, { description: like }] },
          take: ITEMS_PER_GROUP,
          orderBy: { updatedAt: 'desc' },
          include: { client: { select: { firstName: true, lastName: true } } },
        })
        .then((rows) =>
          rows.map((s) => ({
            id: s.id,
            group: 'service',
            groupLabel: 'Serwis',
            title: s.title,
            subtitle: s.client ? `${s.client.firstName} ${s.client.lastName}`.trim() : undefined,
            badge: label(SERVICE_STATUS_LABELS, s.status),
            url: `/service/${s.id}`,
          })),
        ),
    )
  }

  if (can('cases')) {
    tasks.push(
      prisma.case
        .findMany({
          where: { OR: [{ number: like }, { title: like }, { counterparty: like }] },
          take: ITEMS_PER_GROUP,
          orderBy: { updatedAt: 'desc' },
        })
        .then((rows) =>
          rows.map((c) => ({
            id: c.id,
            group: 'cases',
            groupLabel: 'Sprawy',
            title: c.number,
            subtitle: c.title,
            badge: label(CASE_STATUS_LABELS, c.status),
            url: `/cases/${c.id}`,
          })),
        ),
    )
  }

  if (can('finanse')) {
    // Kontrahenci (vendorzy) — po nazwie/skrócie/NIP. Link do przefiltrowanej
    // listy faktur danego kontrahenta (/finanse/faktury?vendor=<id>).
    tasks.push(
      prisma.vendor
        .findMany({
          where: { OR: [{ name: like }, { shortCode: like }, { nip: like }] },
          take: ITEMS_PER_GROUP,
          orderBy: { name: 'asc' },
          include: { _count: { select: { invoices: true } } },
        })
        .then((rows) =>
          rows.map((v) => ({
            id: v.id,
            group: 'kontrahenci',
            groupLabel: 'Kontrahenci',
            title: v.name,
            subtitle: [v.nip, v._count.invoices ? `${v._count.invoices} faktur` : null]
              .filter(Boolean)
              .join(' · ') || undefined,
            badge: label(VENDOR_CATEGORY_LABELS as Record<string, string>, v.category),
            url: `/finanse/faktury?vendor=${v.id}`,
          })),
        ),
    )
    tasks.push(
      prisma.purchaseInvoice
        .findMany({
          where: {
            OR: [
              { number: like },
              { description: like },
              { vendor: { name: like } },
              { vendor: { shortCode: like } },
            ],
          },
          take: ITEMS_PER_GROUP,
          orderBy: { issueDate: 'desc' },
          include: { vendor: { select: { name: true } } },
        })
        .then((rows) =>
          rows.map((i) => ({
            id: i.id,
            group: 'finanse-koszty',
            groupLabel: 'Faktury kosztowe',
            title: i.number,
            subtitle: i.vendor?.name || i.description || undefined,
            badge: label(PURCHASE_INVOICE_STATUS_LABELS, i.status),
            url: `/finanse/faktury/${i.id}`,
          })),
        ),
    )
    tasks.push(
      prisma.salesInvoice
        .findMany({
          where: { OR: [{ number: like }, { recipientName: like }, { recipientCompany: like }] },
          take: ITEMS_PER_GROUP,
          orderBy: { issueDate: 'desc' },
        })
        .then((rows) =>
          rows.map((i) => ({
            id: i.id,
            group: 'finanse-przychody',
            groupLabel: 'Faktury przychodowe',
            title: i.number,
            subtitle: i.recipientCompany || i.recipientName || undefined,
            badge: label(SALES_INVOICE_STATUS_LABELS, i.status),
            url: `/finanse/przychody/${i.id}`,
          })),
        ),
    )
  }

  const grouped = await Promise.all(tasks)
  const results = grouped.flat()

  return NextResponse.json({ results })
}
