// Moduł Odbiory — logika serwerowa (Prisma, fs, sesja). Używana przez trasy API.
import crypto from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { staircaseOf } from '@/lib/floorplan'
import { defectCode, investmentCode, scopeLabel } from './codes'
import { DEFECT_STATUSES, DEFECT_PRIORITIES, DISPATCH_TOKEN_DAYS, type DefectAction, type DefectStatus } from './constants'
import { hitTestUnit } from './geometry'
import { ensureSheet, getSheetMarkers } from './sheets'
import type { DefectUpsertBody, Snapshot, SnapshotDefect } from './types'

export type SessionUser = { id: string; email: string; name: string }

export async function requireUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return {
    id: session.user.id || '',
    email: session.user.email || '',
    name: session.user.name || session.user.email || 'użytkownik',
  }
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

export function jsonError(message: string, status = 400) {
  return json({ error: message }, status)
}

export async function nextInspectionNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `ODB/${year}/`
  const last = await prisma.inspection.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const n = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(4, '0')}`
}

const defectInclude = { photos: { orderBy: { createdAt: 'asc' as const } } }
type DefectWithPhotos = Prisma.DefectGetPayload<{ include: typeof defectInclude }>

export function toSnapshotDefect(d: DefectWithPhotos): SnapshotDefect {
  return {
    id: d.id,
    inspectionId: d.inspectionId,
    sheetId: d.sheetId,
    seq: d.seq,
    code: d.code,
    x: d.x,
    y: d.y,
    unitId: d.unitId,
    unitNumber: d.unitNumber,
    room: d.room,
    typeId: d.typeId,
    trade: d.trade,
    title: d.title,
    description: d.description,
    priority: d.priority,
    status: d.status,
    subcontractorId: d.subcontractorId,
    dueAt: d.dueAt ? d.dueAt.toISOString() : null,
    sourceText: d.sourceText,
    aiSuggested: d.aiSuggested,
    reportedById: d.reportedById,
    reportedByName: d.reportedByName,
    reportedAt: d.reportedAt.toISOString(),
    fixReportedAt: d.fixReportedAt ? d.fixReportedAt.toISOString() : null,
    fixNote: d.fixNote,
    acceptedAt: d.acceptedAt ? d.acceptedAt.toISOString() : null,
    rejectedCount: d.rejectedCount,
    disputeNote: d.disputeNote,
    updatedAt: d.updatedAt.toISOString(),
    photos: d.photos.map((p) => ({
      id: p.id,
      url: p.url,
      phase: p.phase,
      byContractor: p.byContractor,
      createdAt: p.createdAt.toISOString(),
    })),
  }
}

export async function loadDefect(id: string) {
  return prisma.defect.findUnique({ where: { id }, include: defectInclude })
}

/** Pełny pakiet danych widoku terenowego (zapisywany po stronie klienta do IndexedDB). */
export async function buildSnapshot(inspectionId: string, user: SessionUser): Promise<Snapshot | null> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: { sheet: true, investment: { select: { id: true, name: true } } },
  })
  if (!inspection || !inspection.sheet) return null
  const [defects, defectTypes, subcontractors, markers] = await Promise.all([
    prisma.defect.findMany({
      where: { sheetId: inspection.sheet.id },
      include: defectInclude,
      orderBy: { seq: 'asc' },
    }),
    prisma.defectType.findMany({
      where: { active: true },
      orderBy: [{ usageCount: 'desc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.subcontractor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, contactName: true },
    }),
    getSheetMarkers(inspection.sheet.markersKey),
  ])
  return {
    inspection: {
      id: inspection.id,
      number: inspection.number,
      kind: inspection.kind,
      scopeName: inspection.scopeName,
      stage: inspection.stage,
      status: inspection.status,
      result: inspection.result,
      building: inspection.building,
      staircase: inspection.staircase,
      floor: inspection.floor,
      subcontractorId: inspection.subcontractorId,
      inspectorId: inspection.inspectorId,
      inspectorName: inspection.inspectorName,
      startedAt: inspection.startedAt.toISOString(),
      finishedAt: inspection.finishedAt ? inspection.finishedAt.toISOString() : null,
      fixDueAt: inspection.fixDueAt ? inspection.fixDueAt.toISOString() : null,
      notes: inspection.notes,
    },
    sheet: {
      id: inspection.sheet.id,
      name: inspection.sheet.name,
      kind: inspection.sheet.kind,
      building: inspection.sheet.building,
      floor: inspection.sheet.floor,
      markersKey: inspection.sheet.markersKey,
      imageUrl: inspection.sheet.imageUrl,
      width: inspection.sheet.width,
      height: inspection.sheet.height,
      markers,
    },
    defects: defects.map(toSnapshotDefect),
    defectTypes: defectTypes.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      trade: t.trade,
      defaultSubcontractorId: t.defaultSubcontractorId,
      defaultDays: t.defaultDays,
      defaultPriority: t.defaultPriority,
      usageCount: t.usageCount,
    })),
    subcontractors,
    investment: {
      id: inspection.investment.id,
      name: inspection.investment.name,
      code: investmentCode(inspection.investment),
    },
    user: { id: user.id, name: user.name },
    fetchedAt: new Date().toISOString(),
  }
}

export async function createInspection(opts: {
  investmentId: string
  kind: string
  stage: string | null
  subcontractorId: string | null
  building: string | null
  staircase: string | null
  markersKey: string
  scheduledAt: Date | null
  notes: string | null
  user: SessionUser
}) {
  const sheet = await ensureSheet(opts.investmentId, opts.markersKey, opts.building)
  const scopeName = scopeLabel({
    stage: opts.stage,
    building: opts.building,
    staircase: opts.staircase,
    floor: sheet.floor,
    markersKey: sheet.markersKey,
  })
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await nextInspectionNumber()
    try {
      return await prisma.inspection.create({
        data: {
          number,
          investmentId: opts.investmentId,
          kind: opts.kind,
          scopeName,
          stage: opts.stage,
          subcontractorId: opts.subcontractorId,
          sheetId: sheet.id,
          building: sheet.building,
          staircase: opts.staircase,
          floor: sheet.floor,
          scheduledAt: opts.scheduledAt,
          inspectorId: opts.user.id || null,
          inspectorName: opts.user.name,
          notes: opts.notes,
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) continue
      throw e
    }
  }
  throw new Error('Nie udało się nadać numeru odbioru')
}

function cleanStr(v: unknown, max = 500): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

function parseDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Upsert usterki po id. Nowa usterka dostaje seq = propozycja klienta (jeśli wolna)
 * albo kolejny wolny numer na arkuszu. Zwraca rekord + flagę przenumerowania.
 */
export async function upsertDefect(id: string, body: DefectUpsertBody, user: SessionUser) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new HttpError('Nieprawidłowy identyfikator usterki', 400)
  const inspection = await prisma.inspection.findUnique({
    where: { id: body.inspectionId },
    include: { sheet: true, investment: { select: { id: true, name: true } } },
  })
  if (!inspection || !inspection.sheet) throw new HttpError('Odbiór nie istnieje', 404)
  if (inspection.status !== 'W_TOKU') throw new HttpError('Odbiór jest zakończony — usterki są zablokowane', 400)

  const x = Number(body.x)
  const y = Number(body.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new HttpError('Brak współrzędnych pinezki', 400)

  const existing = await prisma.defect.findUnique({ where: { id }, include: defectInclude })
  if (existing && existing.inspectionId !== inspection.id) throw new HttpError('Usterka należy do innego odbioru', 400)

  // lokal pod pinezką — klient mógł policzyć offline; serwer uzupełnia gdy brak
  let unitId = body.unitId === undefined ? existing?.unitId ?? null : body.unitId
  let unitNumber = body.unitNumber === undefined ? existing?.unitNumber ?? null : body.unitNumber
  let staircase: string | null = inspection.staircase
  if (!unitNumber) {
    const markers = await getSheetMarkers(inspection.sheet.markersKey)
    const hit = hitTestUnit(x, y, markers)
    if (hit) {
      unitNumber = hit.number
      unitId = hit.unitId
      if (hit.staircase) staircase = hit.staircase
    }
  } else if (unitId) {
    const u = await prisma.unit.findUnique({ where: { id: unitId }, select: { building: true } })
    const st = u ? staircaseOf(u.building) : null
    if (st) staircase = st
  }

  const priority = body.priority && (DEFECT_PRIORITIES as readonly string[]).includes(body.priority) ? body.priority : existing?.priority ?? 'NORMALNY'
  const typeId = body.typeId === undefined ? existing?.typeId ?? null : body.typeId
  const type = typeId ? await prisma.defectType.findUnique({ where: { id: typeId } }) : null
  const title = cleanStr(body.title, 200) || existing?.title || type?.name || 'Usterka'
  const trade = cleanStr(body.trade, 40) || type?.trade || existing?.trade || null

  const data = {
    x,
    y,
    unitId,
    unitNumber,
    room: body.room === undefined ? existing?.room ?? null : cleanStr(body.room, 80),
    typeId: type ? type.id : null,
    trade,
    title,
    description: body.description === undefined ? existing?.description ?? null : cleanStr(body.description, 2000),
    priority,
    // brak jawnego wykonawcy/terminu → domyślne z typu ze słownika (serwer = jedno źródło prawdy, także dla API)
    subcontractorId:
      body.subcontractorId === undefined
        ? existing?.subcontractorId ?? type?.defaultSubcontractorId ?? null
        : body.subcontractorId || null,
    dueAt:
      body.dueAt === undefined
        ? existing?.dueAt ?? (type?.defaultDays != null ? new Date(Date.now() + type.defaultDays * 86400000) : null)
        : parseDate(body.dueAt),
    sourceText: body.sourceText === undefined ? existing?.sourceText ?? null : cleanStr(body.sourceText, 2000),
    aiSuggested: body.aiSuggested ?? existing?.aiSuggested ?? false,
  }

  if (existing) {
    const updated = await prisma.defect.update({ where: { id }, data, include: defectInclude })
    await prisma.defectEvent.create({
      data: { defectId: id, event: 'ZMIENIONA', actorType: 'USER', actorName: user.name },
    })
    return { defect: toSnapshotDefect(updated), renumbered: false }
  }

  const invCode = investmentCode(inspection.investment)
  const proposed = Number.isInteger(body.seq) && (body.seq as number) > 0 ? (body.seq as number) : null
  const reportedAt = parseDate(body.reportedAt) || new Date()
  for (let attempt = 0; attempt < 5; attempt++) {
    const agg = await prisma.defect.aggregate({ where: { sheetId: inspection.sheet.id }, _max: { seq: true } })
    const nextFree = (agg._max.seq ?? 0) + 1
    let seq = nextFree
    if (proposed && attempt === 0) {
      const taken = await prisma.defect.findUnique({ where: { sheetId_seq: { sheetId: inspection.sheet.id, seq: proposed } } })
      if (!taken) seq = proposed
    }
    const code = defectCode({ investmentCode: invCode, building: inspection.sheet.building ?? inspection.building, staircase, floor: inspection.sheet.floor, seq })
    try {
      const created = await prisma.defect.create({
        data: {
          id,
          investmentId: inspection.investmentId,
          inspectionId: inspection.id,
          sheetId: inspection.sheet.id,
          seq,
          code,
          reportedById: user.id || null,
          reportedByName: user.name,
          reportedAt,
          ...data,
        },
        include: defectInclude,
      })
      await prisma.defectEvent.create({
        data: { defectId: id, event: 'UTWORZONA', details: `${code} · ${title}`, actorType: 'USER', actorName: user.name },
      })
      if (type) await prisma.defectType.update({ where: { id: type.id }, data: { usageCount: { increment: 1 } } })
      return { defect: toSnapshotDefect(created), renumbered: proposed !== null && seq !== proposed }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue
      throw e
    }
  }
  throw new HttpError('Nie udało się nadać numeru usterki', 500)
}

export class HttpError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const ACTION_TRANSITIONS: Record<DefectAction, { from: DefectStatus[]; to: DefectStatus; event: string }> = {
  ODEBRANO: { from: ['POPRAWIONA', 'DO_POPRAWY', 'SPORNA'], to: 'ODEBRANA', event: 'ODEBRANA' },
  NIE_ODEBRANO: { from: ['POPRAWIONA', 'SPORNA'], to: 'DO_POPRAWY', event: 'NIE_ODEBRANA' },
  ANULUJ: { from: ['DO_POPRAWY', 'POPRAWIONA', 'SPORNA'], to: 'ANULOWANA', event: 'ANULOWANA' },
  SPORNA: { from: ['DO_POPRAWY', 'POPRAWIONA'], to: 'SPORNA', event: 'SPORNA' },
  PRZYWROC: { from: ['ANULOWANA', 'ODEBRANA', 'SPORNA'], to: 'DO_POPRAWY', event: 'PRZYWROCONA' },
  POPRAWIONA: { from: ['DO_POPRAWY', 'SPORNA'], to: 'POPRAWIONA', event: 'POPRAWIONA' },
}

/** Akcja inspektora. Tylko zalogowany użytkownik zamyka usterkę (ODEBRANO). */
export async function applyDefectAction(id: string, action: DefectAction, note: string | null, user: SessionUser) {
  const t = ACTION_TRANSITIONS[action]
  if (!t) throw new HttpError('Nieznana akcja', 400)
  const defect = await prisma.defect.findUnique({ where: { id }, include: defectInclude })
  if (!defect) throw new HttpError('Usterka nie istnieje', 404)
  if (!t.from.includes(defect.status as DefectStatus)) {
    throw new HttpError(`Akcja niedozwolona dla statusu „${defect.status}"`, 400)
  }
  if (action === 'NIE_ODEBRANO' && !note) throw new HttpError('Napisz, dlaczego usterka nie została odebrana', 400)
  const now = new Date()
  const updated = await prisma.defect.update({
    where: { id },
    data: {
      status: t.to,
      acceptedAt: action === 'ODEBRANO' ? now : action === 'PRZYWROC' ? null : undefined,
      acceptedById: action === 'ODEBRANO' ? user.id || null : action === 'PRZYWROC' ? null : undefined,
      rejectedCount: action === 'NIE_ODEBRANO' ? { increment: 1 } : undefined,
      disputeNote: action === 'SPORNA' ? note : undefined,
      fixReportedAt: action === 'POPRAWIONA' ? now : action === 'NIE_ODEBRANO' ? null : undefined,
      fixNote: action === 'POPRAWIONA' ? note : undefined,
    },
    include: defectInclude,
  })
  await prisma.defectEvent.create({
    data: { defectId: id, event: t.event, details: note, actorType: 'USER', actorName: user.name },
  })
  return toSnapshotDefect(updated)
}

export const PHOTO_ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const PHOTO_MAX_BYTES = 25 * 1024 * 1024

export function validatePhoto(file: File): string | null {
  if (file.size === 0) return 'Pusty plik'
  if (file.size > PHOTO_MAX_BYTES) return 'Zdjęcie przekracza 25 MB'
  if (file.type === 'image/heic' || file.type === 'image/heif' || /\.heic$/i.test(file.name)) {
    return 'Format HEIC nie jest obsługiwany — w ustawieniach aparatu iPhone wybierz „Najbardziej zgodne"'
  }
  if (file.type && !PHOTO_ALLOWED.has(file.type)) return `Typ ${file.type} nie jest dozwolony (JPG, PNG, WEBP)`
  return null
}

/** Zapis zdjęcia usterki. photoId (od klienta) daje idempotentny upload przy ponowieniach. */
export async function saveDefectPhoto(opts: {
  defectId: string
  inspectionId: string
  file: File
  phase: 'PRZED' | 'PO'
  photoId?: string | null
  byUserId?: string | null
  byContractor?: boolean
  actorName: string
}) {
  if (opts.photoId) {
    const dup = await prisma.defectPhoto.findUnique({ where: { id: opts.photoId } })
    if (dup) return dup
  }
  const dir = path.join(process.cwd(), 'public', 'uploads', 'odbiory', opts.inspectionId)
  await fs.mkdir(dir, { recursive: true })
  const ext = opts.file.type === 'image/png' ? '.png' : opts.file.type === 'image/webp' ? '.webp' : '.jpg'
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`
  const buffer = Buffer.from(await opts.file.arrayBuffer())
  await fs.writeFile(path.join(dir, filename), buffer)
  const photo = await prisma.defectPhoto.create({
    data: {
      id: opts.photoId && /^[A-Za-z0-9_-]{6,64}$/.test(opts.photoId) ? opts.photoId : undefined,
      defectId: opts.defectId,
      url: `/uploads/odbiory/${opts.inspectionId}/${filename}`,
      phase: opts.phase,
      byUserId: opts.byUserId || null,
      byContractor: opts.byContractor || false,
    },
  })
  await prisma.defectEvent.create({
    data: {
      defectId: opts.defectId,
      event: 'ZDJECIE',
      details: opts.phase === 'PO' ? 'zdjęcie po naprawie' : 'zdjęcie usterki',
      actorType: opts.byContractor ? 'CONTRACTOR' : 'USER',
      actorName: opts.actorName,
    },
  })
  return photo
}

// ---------------------------------------------------------------------------
// Pakiet wykonawcy (Dispatch) — prywatny link po tokenie
// ---------------------------------------------------------------------------

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function newToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

export async function createDispatch(opts: { inspectionId: string; subcontractorId: string; user: SessionUser }) {
  const inspection = await prisma.inspection.findUnique({ where: { id: opts.inspectionId } })
  if (!inspection) throw new HttpError('Odbiór nie istnieje', 404)
  const sub = await prisma.subcontractor.findUnique({ where: { id: opts.subcontractorId } })
  if (!sub) throw new HttpError('Wykonawca nie istnieje', 404)
  const defects = await prisma.defect.findMany({
    where: { inspectionId: inspection.id, subcontractorId: sub.id, status: { in: ['DO_POPRAWY', 'SPORNA'] } },
    orderBy: { seq: 'asc' },
  })
  if (defects.length === 0) throw new HttpError('Ten wykonawca nie ma otwartych usterek w tym odbiorze', 400)

  // poprzednie otwarte pakiety tego wykonawcy w tym odbiorze zamykamy (jeden aktualny link)
  await prisma.dispatch.updateMany({
    where: { inspectionId: inspection.id, subcontractorId: sub.id, status: { in: ['UTWORZONY', 'WYSLANY', 'ZGLOSZONY'] } },
    data: { status: 'ZAMKNIETY' },
  })

  const token = newToken()
  const dispatch = await prisma.dispatch.create({
    data: {
      investmentId: inspection.investmentId,
      inspectionId: inspection.id,
      subcontractorId: sub.id,
      tokenHash: hashToken(token),
      tokenExpiresAt: new Date(Date.now() + DISPATCH_TOKEN_DAYS * 24 * 3600 * 1000),
      createdById: opts.user.id || null,
      items: { create: defects.map((d) => ({ defectId: d.id })) },
    },
  })
  await prisma.defectEvent.createMany({
    data: defects.map((d) => ({
      defectId: d.id,
      event: 'PRZEKAZANA',
      details: `pakiet dla ${sub.name}`,
      actorType: 'USER',
      actorName: opts.user.name,
    })),
  })
  return { dispatch, token, defects, subcontractor: sub, inspection }
}

export async function resolveDispatchToken(token: string) {
  if (!token || token.length < 16 || token.length > 128) return null
  const dispatch = await prisma.dispatch.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      subcontractor: { select: { id: true, name: true, contactName: true } },
      investment: { select: { id: true, name: true } },
      inspection: { select: { id: true, number: true, scopeName: true, sheetId: true, inspectorId: true, inspectorName: true, fixDueAt: true } },
      items: { include: { defect: { include: defectInclude } } },
    },
  })
  if (!dispatch) return null
  if (dispatch.tokenExpiresAt.getTime() < Date.now()) return null
  if (dispatch.status === 'ZAMKNIETY') return null
  return dispatch
}

export function isValidStatus(s: string): s is DefectStatus {
  return (DEFECT_STATUSES as readonly string[]).includes(s)
}
