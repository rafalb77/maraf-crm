// =====================================================================
// KSeF API 2.0 — klient (READ-only: pobieranie faktur wystawionych i otrzymanych).
//
// Endpointy API 2.0 (produkcja): https://api.ksef.mf.gov.pl/v2
// Test/Demo: https://api-test.ksef.mf.gov.pl/v2 / https://api-demo.ksef.mf.gov.pl/v2
//
// Auth flow (token KSeF, bez XAdES):
//  1. POST /api/v2/auth/challenge → { challenge, timestamp }
//  2. RSA-encrypt OAEP(SHA-256) `token|timestampUnixMs` z KSeF public key
//     (pobranym z /api/v2/security/public-key-certificates, usage=KsefTokenEncryption)
//  3. POST /api/v2/auth/ksef-token { challenge, contextIdentifier: { type:'Nip', value }, encryptedToken } → { referenceNumber }
//  4. Poll GET /api/v2/auth/{referenceNumber} aż status==Authenticated
//  5. POST /api/v2/auth/token/redeem (Authorization: Bearer <referenceNumber>) → { accessToken, refreshToken }
//  6. Bearer accessToken w kolejnych requestach
//
// Pobieranie faktur:
//  POST /api/v2/invoices/query/metadata
//    body: InvoiceQueryFilters (subjectType: 'Subject1'|'Subject2', dateRange: {dateType:'Issue', from, to})
//    response: { invoices: [{ ksefNumber, invoiceNumber, issueDate, ... }], hasMore, pageOffset }
//  GET /api/v2/invoices/ksef/{ksefNumber} → PLAIN XML (FA(3) lub FA(2))
//
// UWAGA: implementacja "best effort" oparta na publicznej dokumentacji + repo
// lkow/ksef-client-ts. Pierwsze synchronizacje na produkcji mogą wyrzucić
// błędy API (różnice w body/response) — iterujemy po realnych logach KSeF.
// =====================================================================

import { createPublicKey, publicEncrypt, constants as cryptoConstants } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { prisma } from './prisma'
import type { Company } from './types'

export type KsefEnvironment = 'PROD' | 'TEST' | 'DEMO'

const ENDPOINTS: Record<KsefEnvironment, string> = {
  PROD: 'https://api.ksef.mf.gov.pl',
  TEST: 'https://api-test.ksef.mf.gov.pl',
  DEMO: 'https://api-demo.ksef.mf.gov.pl',
}

// ---------- Typy KSeF (oparte na repo lkow/ksef-client-ts/types/invoice.ts) ----------

export type SubjectType = 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized'
export type DateType = 'Issue' | 'Invoicing' | 'PermanentStorage'

export type InvoiceQueryFilters = {
  subjectType: SubjectType
  dateRange: { dateType: DateType; from: string; to?: string | null }
  ksefNumber?: string | null
  invoiceNumber?: string | null
  sellerNip?: string | null
}

export type InvoiceMetadata = {
  ksefNumber: string
  invoiceNumber: string
  issueDate: string
  sellerNip?: string
  sellerName?: string
  buyerNip?: string
  buyerName?: string
  amountGross?: number
  amountNet?: number
  amountVat?: number
  currency?: string
}

// ---------- HTTP helpers ----------

async function postJson<T>(url: string, body: any, bearer?: string): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`POST ${url} → ${r.status}: ${text.slice(0, 500)}`)
  }
  return r.json() as Promise<T>
}

async function getJson<T>(url: string, bearer?: string): Promise<T> {
  const r = await fetch(url, {
    method: 'GET',
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`GET ${url} → ${r.status}: ${text.slice(0, 500)}`)
  }
  return r.json() as Promise<T>
}

async function getText(url: string, bearer?: string): Promise<string> {
  const r = await fetch(url, {
    method: 'GET',
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`GET ${url} → ${r.status}: ${text.slice(0, 500)}`)
  }
  return r.text()
}

// ---------- Klient ----------

export class KsefClient {
  private accessToken: string | null = null

  constructor(
    public readonly nip: string,
    public readonly providedToken: string,
    public readonly environment: KsefEnvironment = 'PROD',
  ) {}

  get baseUrl(): string {
    return ENDPOINTS[this.environment]
  }

  /**
   * Pobiera klucz publiczny KSeF do szyfrowania tokenu (usage=KsefTokenEncryption).
   * Zwraca pierwszy ważny certyfikat.
   */
  private async getKsefPublicKey(): Promise<string> {
    type CertResponse = {
      certificate: string
      publicKeyId: string
      validFrom: string
      validTo: string
      usage: string[]
    }
    const list = await getJson<CertResponse[]>(`${this.baseUrl}/api/v2/security/public-key-certificates`)
    const now = new Date()
    const valid = list.find((c) =>
      c.usage.includes('KsefTokenEncryption') &&
      new Date(c.validFrom) <= now &&
      new Date(c.validTo) >= now
    )
    if (!valid) throw new Error('Brak waznego certyfikatu KSeF do szyfrowania tokenu')
    return valid.certificate
  }

  /**
   * RSA-OAEP-SHA256 encrypt `token|timestampUnixMs` z certyfikatem KSeF.
   */
  private encryptTokenForKsef(token: string, timestampMs: number, certBase64: string): string {
    // Cert jest Base64 DER (X.509). Wyciągamy klucz publiczny.
    const pem = `-----BEGIN CERTIFICATE-----\n${certBase64.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`
    const publicKey = createPublicKey(pem)
    const payload = Buffer.from(`${token}|${timestampMs}`, 'utf8')
    const encrypted = publicEncrypt(
      {
        key: publicKey,
        padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      payload,
    )
    return encrypted.toString('base64')
  }

  /**
   * Pełen auth flow: challenge → encrypt → ksef-token → poll → redeem → accessToken.
   */
  async authenticate(): Promise<string> {
    if (this.accessToken) return this.accessToken

    // 1. Challenge
    type Challenge = { challenge: string; timestamp: string }
    const ch = await postJson<Challenge>(`${this.baseUrl}/api/v2/auth/challenge`, {})

    // 2. Encrypt token z KSeF public key
    const certBase64 = await this.getKsefPublicKey()
    const tsMs = new Date(ch.timestamp).getTime()
    const encryptedToken = this.encryptTokenForKsef(this.providedToken, tsMs, certBase64)

    // 3. POST ksef-token
    type AuthInit = { referenceNumber: string; authenticationToken: { token: string; validUntil: string } }
    const init = await postJson<AuthInit>(`${this.baseUrl}/api/v2/auth/ksef-token`, {
      challenge: ch.challenge,
      contextIdentifier: { type: 'Nip', value: this.nip },
      encryptedToken,
    })

    // 4. Poll status
    type AuthStatus = { status: { code: number; description: string }; authenticationStatus?: string }
    const pollUrl = `${this.baseUrl}/api/v2/auth/${init.referenceNumber}`
    let attempts = 0
    while (attempts < 20) {
      const st = await getJson<AuthStatus>(pollUrl, init.authenticationToken.token)
      if (st.status.code === 200 || st.authenticationStatus === 'Authenticated') break
      if (st.status.code >= 400) throw new Error(`Auth status: ${st.status.code} ${st.status.description}`)
      await new Promise((r) => setTimeout(r, 1000))
      attempts++
    }

    // 5. Redeem → accessToken
    type RedeemResponse = { accessToken: { token: string; validUntil: string }; refreshToken: { token: string; validUntil: string } }
    const redeem = await postJson<RedeemResponse>(
      `${this.baseUrl}/api/v2/auth/token/redeem`,
      {},
      init.authenticationToken.token,
    )
    this.accessToken = redeem.accessToken.token
    return this.accessToken
  }

  /**
   * Lista metadanych faktur. Paginacja przez pageOffset+pageSize.
   */
  async queryInvoicesMetadata(filters: InvoiceQueryFilters, pageSize = 100): Promise<InvoiceMetadata[]> {
    const token = await this.authenticate()
    const results: InvoiceMetadata[] = []
    let pageOffset = 0
    let hasMore = true
    while (hasMore && pageOffset < 1000) { // safety cap
      type QueryResponse = { invoices?: InvoiceMetadata[]; hasMore?: boolean; pageOffset?: number }
      const res = await postJson<QueryResponse>(
        `${this.baseUrl}/api/v2/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`,
        filters,
        token,
      )
      const page = res.invoices || []
      results.push(...page)
      hasMore = !!res.hasMore && page.length === pageSize
      pageOffset += pageSize
    }
    return results
  }

  /**
   * Pełny XML faktury po numerze KSeF (PLAIN — nie zaszyfrowany przy pobieraniu).
   */
  async getInvoiceXml(ksefNumber: string): Promise<string> {
    const token = await this.authenticate()
    return getText(`${this.baseUrl}/api/v2/invoices/ksef/${encodeURIComponent(ksefNumber)}`, token)
  }
}

// =====================================================================
// Parser FA(3) — wyciaga pola ktore zapisujemy do PurchaseInvoice/SalesInvoice.
// =====================================================================

export type ParsedKsefInvoice = {
  ksefNumber: string
  invoiceNumber: string
  issueDate: Date
  dueDate: Date | null
  sellerNip: string
  sellerName: string
  buyerNip: string
  buyerName: string
  amountNet: number
  amountVat: number
  amountGross: number
  vatRate: number // sredni stosunek VAT/net (do referencji)
  currency: string
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // ignoruje namespacy tns:/fa:/itp.
  parseTagValue: true,
  trimValues: true,
})

/** Bezpieczne wyciaganie pola z mozliwie zagniezdzonej struktury. */
function pick(obj: any, ...paths: string[][]): any {
  for (const path of paths) {
    let cur = obj
    let ok = true
    for (const k of path) {
      if (cur && typeof cur === 'object' && k in cur) cur = cur[k]
      else { ok = false; break }
    }
    if (ok && cur !== undefined && cur !== null && cur !== '') return cur
  }
  return null
}

function toNumber(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  const n = parseFloat(String(v).replace(',', '.'))
  return isFinite(n) ? n : 0
}

function toDate(v: any): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

/**
 * Parsuje XML FA(3) (lub FA(2)) → struktura. ksefNumber dostajemy z zewnatrz
 * (z metadanych — nie ma go w XML faktury).
 */
export function parseKsefInvoiceXml(xml: string, ksefNumber: string): ParsedKsefInvoice {
  const doc = xmlParser.parse(xml)
  const root = doc.Faktura || doc.faktura || doc
  // FA(3): root.Naglowek + root.Podmiot1 (sprzedawca) + root.Podmiot2 (nabywca) + root.Fa (suma)
  // FA(2): podobnie ale rozne nazwy pol
  const naglowek = root.Naglowek || root.naglowek || {}
  const podmiot1 = root.Podmiot1 || root.podmiot1 || {}
  const podmiot2 = root.Podmiot2 || root.podmiot2 || {}
  const fa = root.Fa || root.fa || {}

  const invoiceNumber = String(pick(fa, ['P_2'], ['P2']) || pick(naglowek, ['KodFormularza']) || ksefNumber)
  const issueDate = toDate(pick(fa, ['P_1'], ['P1'])) || new Date()
  const dueDate = toDate(pick(fa, ['Platnosc', 'TerminPlatnosci'], ['TerminPlatnosci']))

  const sellerNip = String(pick(podmiot1, ['DaneIdentyfikacyjne', 'NIP']) || pick(podmiot1, ['NIP']) || '')
  const sellerName = String(pick(podmiot1, ['DaneIdentyfikacyjne', 'Nazwa']) || pick(podmiot1, ['Nazwa']) || '')
  const buyerNip = String(pick(podmiot2, ['DaneIdentyfikacyjne', 'NIP']) || pick(podmiot2, ['NIP']) || '')
  const buyerName = String(pick(podmiot2, ['DaneIdentyfikacyjne', 'Nazwa']) || pick(podmiot2, ['Nazwa']) || '')

  // Sumy FA(3): P_15 = brutto, P_13_1..7 = netto wg stawek, P_14_1..7 = VAT wg stawek
  const amountGross = toNumber(pick(fa, ['P_15']))
  // Suma netto z wszystkich stawek
  const netSum =
    toNumber(pick(fa, ['P_13_1'])) +
    toNumber(pick(fa, ['P_13_2'])) +
    toNumber(pick(fa, ['P_13_3'])) +
    toNumber(pick(fa, ['P_13_4'])) +
    toNumber(pick(fa, ['P_13_5'])) +
    toNumber(pick(fa, ['P_13_6'])) +
    toNumber(pick(fa, ['P_13_7']))
  const vatSum =
    toNumber(pick(fa, ['P_14_1'])) +
    toNumber(pick(fa, ['P_14_2'])) +
    toNumber(pick(fa, ['P_14_3'])) +
    toNumber(pick(fa, ['P_14_4'])) +
    toNumber(pick(fa, ['P_14_5'])) +
    toNumber(pick(fa, ['P_14_6'])) +
    toNumber(pick(fa, ['P_14_7']))
  const amountNet = netSum > 0 ? netSum : amountGross
  const amountVat = vatSum > 0 ? vatSum : Math.max(0, amountGross - amountNet)
  const vatRate = amountNet > 0 ? Math.round((amountVat / amountNet) * 100) / 100 : 0

  const currency = String(pick(fa, ['KodWaluty']) || 'PLN')

  return {
    ksefNumber,
    invoiceNumber,
    issueDate,
    dueDate,
    sellerNip,
    sellerName,
    buyerNip,
    buyerName,
    amountNet,
    amountVat,
    amountGross,
    vatRate,
    currency,
  }
}

// =====================================================================
// Sync per firma — pobiera faktury wystawione i otrzymane od lastSyncAt
// (lub syncFromDate jesli pierwsza synchronizacja), upsertuje do bazy.
// =====================================================================

export async function syncCompanyFromKsef(company: Company): Promise<{ ok: boolean; count: number; error?: string }> {
  const cfg = await prisma.ksefConfig.findUnique({ where: { company } })
  if (!cfg) return { ok: false, count: 0, error: 'Brak konfiguracji KSeF' }
  if (!cfg.enabled) return { ok: false, count: 0, error: 'KSeF wylaczony' }
  if (!cfg.token) return { ok: false, count: 0, error: 'Brak tokenu KSeF' }

  const client = new KsefClient(cfg.nip, cfg.token, cfg.environment as KsefEnvironment)
  const fromDate = cfg.lastSyncAt || cfg.syncFromDate || new Date('2026-01-01')
  const fromIso = fromDate.toISOString().slice(0, 10)
  const toIso = new Date().toISOString().slice(0, 10)

  let totalCount = 0

  try {
    // 1. SALES (Subject1) — faktury wystawione przez nas
    const salesMeta = await client.queryInvoicesMetadata({
      subjectType: 'Subject1',
      dateRange: { dateType: 'Issue', from: fromIso, to: toIso },
    })
    for (const meta of salesMeta) {
      // Skip jesli juz w bazie
      const exists = await prisma.salesInvoice.findUnique({ where: { ksefNumber: meta.ksefNumber }, select: { id: true } })
      if (exists) continue
      const xml = await client.getInvoiceXml(meta.ksefNumber)
      const parsed = parseKsefInvoiceXml(xml, meta.ksefNumber)
      await prisma.salesInvoice.create({
        data: {
          company,
          number: parsed.invoiceNumber,
          recipientName: parsed.buyerName || parsed.buyerNip || 'Nieznany',
          recipientCompany: detectGroupCompany(parsed.buyerNip),
          issueDate: parsed.issueDate,
          dueDate: parsed.dueDate,
          vatRate: parsed.vatRate,
          amountNet: parsed.amountNet,
          amountVat: parsed.amountVat,
          amountGross: parsed.amountGross,
          currency: parsed.currency,
          status: 'WYSTAWIONA',
          ksefNumber: meta.ksefNumber,
          description: `Z KSeF (${meta.ksefNumber})`,
        },
      })
      totalCount++
    }

    // 2. PURCHASES (Subject2) — faktury otrzymane
    const purchaseMeta = await client.queryInvoicesMetadata({
      subjectType: 'Subject2',
      dateRange: { dateType: 'Issue', from: fromIso, to: toIso },
    })
    for (const meta of purchaseMeta) {
      const exists = await prisma.purchaseInvoice.findUnique({ where: { ksefNumber: meta.ksefNumber }, select: { id: true } })
      if (exists) continue
      const xml = await client.getInvoiceXml(meta.ksefNumber)
      const parsed = parseKsefInvoiceXml(xml, meta.ksefNumber)
      // Vendor matching po NIP lub utworz
      const vendorName = parsed.sellerName || parsed.sellerNip || 'Nieznany'
      let vendor = await prisma.vendor.findFirst({ where: { OR: [{ nip: parsed.sellerNip }, { name: vendorName }] } })
      if (!vendor) {
        vendor = await prisma.vendor.create({
          data: { name: vendorName, nip: parsed.sellerNip || null, category: 'DOSTAWCA', notes: 'Auto-utworzony z KSeF' },
        })
      }
      // Sprawdz dup (vendor, number)
      const dup = await prisma.purchaseInvoice.findUnique({
        where: { vendorId_number: { vendorId: vendor.id, number: parsed.invoiceNumber } },
        select: { id: true },
      })
      if (dup) {
        // Update tylko ksefNumber jesli brak (faktura wpisana wczesniej recznie)
        await prisma.purchaseInvoice.update({ where: { id: dup.id }, data: { ksefNumber: meta.ksefNumber } })
        continue
      }
      await prisma.purchaseInvoice.create({
        data: {
          company,
          vendorId: vendor.id,
          number: parsed.invoiceNumber,
          issueDate: parsed.issueDate,
          dueDate: parsed.dueDate,
          vatRate: parsed.vatRate,
          amountNet: parsed.amountNet,
          amountVat: parsed.amountVat,
          amountGross: parsed.amountGross,
          currency: parsed.currency,
          status: 'ZATWIERDZONA',
          ksefNumber: meta.ksefNumber,
          description: `Z KSeF (${meta.ksefNumber})`,
        },
      })
      totalCount++
    }

    return { ok: true, count: totalCount }
  } catch (e: any) {
    return { ok: false, count: totalCount, error: e.message || String(e) }
  }
}

/**
 * Wykrywa czy NIP nalezy do firmy grupy (Maraf/MD) — dla auto cross-company
 * przy fakturach przychodowych pobranych z KSeF.
 */
function detectGroupCompany(nip: string): string | null {
  if (!nip) return null
  const n = nip.replace(/[-\s]/g, '')
  if (n === '7322069952') return 'MARAF'
  if (n === '7322202144') return 'MARAF_DEVELOPMENT'
  return null
}
