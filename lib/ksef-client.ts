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
import { KSEF_DEFAULTS } from './ksef-defaults'
import type { Company, KsefInvoiceData, KsefParty, KsefLine, KsefPayment } from './types'

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

// ---------- Rate limiting (KSeF: limit 16 zadan/min per podatnik) ----------

const KSEF_MAX_PER_MIN = 15 // margines pod limit 16/min
const reqWindow = new Map<string, number[]>() // klucz = NIP → timestampy ostatnich zadan
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Throttling przesuwnym oknem 60s per NIP — czeka az zwolni sie slot. */
async function rateLimit(key: string): Promise<void> {
  for (;;) {
    const now = Date.now()
    const arr = (reqWindow.get(key) || []).filter((t) => now - t < 60_000)
    if (arr.length < KSEF_MAX_PER_MIN) {
      arr.push(now)
      reqWindow.set(key, arr)
      return
    }
    reqWindow.set(key, arr)
    await sleep(Math.max(60_000 - (now - arr[0]) + 250, 250))
  }
}

/** Czas oczekiwania po 429 — z naglowka Retry-After lub komunikatu KSeF („po N sekundach"). */
function parseRetryAfterMs(header: string | null, body: string): number {
  if (header) {
    const s = parseInt(header, 10)
    if (isFinite(s)) return Math.min(Math.max(s, 1) * 1000, 120_000)
  }
  const m = body.match(/po\s+(\d+)\s+sekund/i)
  if (m) return Math.min((parseInt(m[1], 10) + 1) * 1000, 120_000)
  return 45_000
}

/** fetch z throttlingiem (per NIP) i retry na 429 (backoff wg KSeF). */
async function ksefFetch(key: string, url: string, init: RequestInit): Promise<Response> {
  const MAX_429_RETRIES = 6
  for (let attempt = 0; ; attempt++) {
    await rateLimit(key)
    const r = await fetch(url, init)
    if (r.status === 429 && attempt < MAX_429_RETRIES) {
      const body = await r.text().catch(() => '')
      await sleep(parseRetryAfterMs(r.headers.get('retry-after'), body))
      continue
    }
    return r
  }
}

// ---------- HTTP helpers (key = NIP do throttlingu) ----------

async function postJson<T>(key: string, url: string, body: any, bearer?: string): Promise<T> {
  const r = await ksefFetch(key, url, {
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

async function getJson<T>(key: string, url: string, bearer?: string): Promise<T> {
  const r = await ksefFetch(key, url, {
    method: 'GET',
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`GET ${url} → ${r.status}: ${text.slice(0, 500)}`)
  }
  return r.json() as Promise<T>
}

async function getText(key: string, url: string, bearer?: string): Promise<string> {
  const r = await ksefFetch(key, url, {
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
    const list = await getJson<CertResponse[]>(this.nip, `${this.baseUrl}/api/v2/security/public-key-certificates`)
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
    const ch = await postJson<Challenge>(this.nip, `${this.baseUrl}/api/v2/auth/challenge`, {})

    // 2. Encrypt token z KSeF public key
    const certBase64 = await this.getKsefPublicKey()
    const tsMs = new Date(ch.timestamp).getTime()
    const encryptedToken = this.encryptTokenForKsef(this.providedToken, tsMs, certBase64)

    // 3. POST ksef-token
    type AuthInit = { referenceNumber: string; authenticationToken: { token: string; validUntil: string } }
    const init = await postJson<AuthInit>(this.nip, `${this.baseUrl}/api/v2/auth/ksef-token`, {
      challenge: ch.challenge,
      contextIdentifier: { type: 'Nip', value: this.nip },
      encryptedToken,
    })

    // 4. Poll status
    type AuthStatus = { status: { code: number; description: string }; authenticationStatus?: string }
    const pollUrl = `${this.baseUrl}/api/v2/auth/${init.referenceNumber}`
    let attempts = 0
    while (attempts < 20) {
      const st = await getJson<AuthStatus>(this.nip, pollUrl, init.authenticationToken.token)
      if (st.status.code === 200 || st.authenticationStatus === 'Authenticated') break
      if (st.status.code >= 400) throw new Error(`Auth status: ${st.status.code} ${st.status.description}`)
      await new Promise((r) => setTimeout(r, 1000))
      attempts++
    }

    // 5. Redeem → accessToken
    type RedeemResponse = { accessToken: { token: string; validUntil: string }; refreshToken: { token: string; validUntil: string } }
    const redeem = await postJson<RedeemResponse>(
      this.nip,
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
        this.nip,
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
    return getText(this.nip, `${this.baseUrl}/api/v2/invoices/ksef/${encodeURIComponent(ksefNumber)}`, token)
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
  // Status platnosci odczytany z FA (blok Platnosc):
  //  paid       — Zaplacono=1 (cala faktura oplacona w chwili wystawienia)
  //  paidDate   — DataZaplaty
  //  paidAmount — suma platnosci czesciowych (gdy paid=false a sa czesciowe)
  paid: boolean
  paidDate: Date | null
  paidAmount: number
  // Pelny snapshot do zapisu w *.ksefData (Json) — wyswietlany w szczegolach.
  data: KsefInvoiceData
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

/** Normalizuje pole ktore w XML moze byc pojedynczym obiektem lub tablica. */
function toArray<T = any>(v: any): T[] {
  if (v === null || v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

function str(v: any): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** Czysci obiekt do zapisu w polu Json (Prisma nie przyjmuje `undefined`). */
function asJson(v: any): any {
  return JSON.parse(JSON.stringify(v ?? null))
}

/**
 * Sklada adres podmiotu FA(3) do czytelnych linii.
 * FA(3) TAdres: KodKraju + AdresL1 (ulica/nr) + AdresL2 (kod + miasto).
 * Fallback: pola strukturalne (Ulica/NrDomu/KodPocztowy/Miejscowosc).
 */
function parseAddressLines(adres: any): { lines: string[]; countryCode: string | null } {
  if (!adres || typeof adres !== 'object') return { lines: [], countryCode: null }
  const countryCode = str(pick(adres, ['KodKraju']))
  const l1 = str(pick(adres, ['AdresL1']))
  const l2 = str(pick(adres, ['AdresL2']))
  if (l1 || l2) {
    return { lines: [l1, l2].filter((x): x is string => !!x), countryCode }
  }
  // Fallback strukturalny (rzadziej spotykany w FA(3), ale zabezpieczamy)
  const ulica = str(pick(adres, ['Ulica']))
  const nrDomu = str(pick(adres, ['NrDomu']))
  const nrLokalu = str(pick(adres, ['NrLokalu']))
  const kod = str(pick(adres, ['KodPocztowy']))
  const miasto = str(pick(adres, ['Miejscowosc']))
  const line1 = [ulica, [nrDomu, nrLokalu].filter(Boolean).join('/')].filter(Boolean).join(' ')
  const line2 = [kod, miasto].filter(Boolean).join(' ')
  return { lines: [line1, line2].filter((x) => !!x), countryCode }
}

/** Parsuje Podmiot1/Podmiot2 (sprzedawca/nabywca) → KsefParty. */
function parseParty(podmiot: any): KsefParty {
  const dane = podmiot?.DaneIdentyfikacyjne || podmiot?.daneIdentyfikacyjne || podmiot || {}
  const nip = str(pick(dane, ['NIP']) ?? pick(podmiot, ['NIP']))
  // Nazwa firmy lub imie+nazwisko (osoba fizyczna).
  const nazwa = str(pick(dane, ['Nazwa']) ?? pick(podmiot, ['Nazwa']))
  const imie = str(pick(dane, ['ImiePierwsze']))
  const nazwisko = str(pick(dane, ['Nazwisko']))
  const name = nazwa || [imie, nazwisko].filter(Boolean).join(' ') || null
  const { lines, countryCode } = parseAddressLines(podmiot?.Adres || podmiot?.adres)
  const kontakt = podmiot?.DaneKontaktowe || podmiot?.daneKontaktowe
  const email = str(pick(toArray(kontakt)[0] || {}, ['Email']))
  const phone = str(pick(toArray(kontakt)[0] || {}, ['Telefon']))
  return { nip, name, addressLines: lines, countryCode, email, phone }
}

/** Parsuje pozycje faktury Fa.FaWiersz[] → KsefLine[]. */
function parseLines(fa: any): KsefLine[] {
  const wiersze = toArray(pick(fa, ['FaWiersz']) ?? fa?.FaWiersz)
  return wiersze.map((w: any): KsefLine => {
    const net = toNumber(pick(w, ['P_11']))
    const grossRaw = pick(w, ['P_11A'])
    const vatRate = str(pick(w, ['P_12']))
    return {
      no: pick(w, ['NrWierszaFa']) != null ? toNumber(pick(w, ['NrWierszaFa'])) : null,
      name: str(pick(w, ['P_7'])),
      unit: str(pick(w, ['P_8A'])),
      quantity: pick(w, ['P_8B']) != null ? toNumber(pick(w, ['P_8B'])) : null,
      unitPriceNet: pick(w, ['P_9A']) != null ? toNumber(pick(w, ['P_9A'])) : null,
      net: net || null,
      gross: grossRaw != null ? toNumber(grossRaw) : null,
      vatRate,
    }
  })
}

/** Parsuje blok Fa.Platnosc → KsefPayment + flagi paid/paidDate/paidAmount. */
function parsePayment(fa: any): { payment: KsefPayment; paid: boolean; paidDate: Date | null; paidAmount: number } {
  const pl = fa?.Platnosc || fa?.platnosc
  if (!pl || typeof pl !== 'object') {
    return { payment: {}, paid: false, paidDate: null, paidAmount: 0 }
  }
  const paid = toNumber(pick(pl, ['Zaplacono'])) === 1
  const methodCode = str(pick(pl, ['FormaPlatnosci']))
  // Termin platnosci (moze byc tablica) — bierzemy najwczesniejszy.
  const terminy = toArray(pick(pl, ['TerminPlatnosci'])).map((t: any) => toDate(pick(t, ['Termin']) ?? t)).filter((d): d is Date => !!d)
  const dueDate = terminy.length ? terminy.sort((a, b) => a.getTime() - b.getTime())[0] : null
  // Platnosci czesciowe (ZaplataCzesciowa[]).
  const partial = toArray(pick(pl, ['ZaplataCzesciowa'])).map((z: any) => ({
    amount: toNumber(pick(z, ['KwotaZaplatyCzesciowej'])),
    date: (toDate(pick(z, ['DataZaplatyCzesciowej']))?.toISOString()) ?? null,
  })).filter((p) => p.amount > 0)
  const paidAmount = partial.reduce((s, p) => s + p.amount, 0)
  // Data zaplaty: pelna (DataZaplaty), w przeciwnym razie najpozniejsza data
  // platnosci czesciowej (zeby platnosc nie dostala daty wystawienia faktury).
  const partialDates = partial.map((p) => (p.date ? new Date(p.date) : null)).filter((d): d is Date => !!d)
  const lastPartialDate = partialDates.length ? partialDates.sort((a, b) => b.getTime() - a.getTime())[0] : null
  const paidDate = toDate(pick(pl, ['DataZaplaty'])) || lastPartialDate
  const payment: KsefPayment = {
    paid,
    paidDate: paidDate ? paidDate.toISOString() : null,
    dueDate: dueDate ? dueDate.toISOString() : null,
    methodCode,
    partial: partial.length ? partial : undefined,
  }
  return { payment, paid, paidDate, paidAmount }
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

  // Pelne dane podmiotow (adres, kontakt) + pozycje + platnosc.
  const seller = parseParty(podmiot1)
  const buyer = parseParty(podmiot2)
  const lines = parseLines(fa)
  const { payment, paid, paidDate, paidAmount } = parsePayment(fa)

  const sellerNip = seller.nip || ''
  const sellerName = seller.name || ''
  const buyerNip = buyer.nip || ''
  const buyerName = buyer.name || ''

  // Termin platnosci: z bloku Platnosc (parsePayment) lub fallback ze starej sciezki.
  const dueDate = (payment.dueDate ? new Date(payment.dueDate) : null)
    || toDate(pick(fa, ['Platnosc', 'TerminPlatnosci', 'Termin'], ['Platnosc', 'TerminPlatnosci'], ['TerminPlatnosci']))

  // Wariant schematu (do wyswietlenia / debugu).
  const schema = str(pick(naglowek, ['KodFormularza', '@_kodSystemowy']))
    || (str(pick(naglowek, ['WariantFormularza'])) ? `FA(${pick(naglowek, ['WariantFormularza'])})` : null)
    || '?'

  // Sumy FA(3): P_15 = brutto, P_13_1..7 = netto wg stawek, P_14_1..7 = VAT wg stawek
  const grossRaw = toNumber(pick(fa, ['P_15']))
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
  // Brutto: P_15 jeśli podane (>0), inaczej netto+VAT (gwarantuje brutto >= netto,
  // nie zostawia brutto=0 gdy P_15 brak a stawki obecne).
  const amountGross = grossRaw > 0 ? grossRaw : Math.round((netSum + vatSum) * 100) / 100
  const amountNet = netSum > 0 ? netSum : amountGross
  const amountVat = vatSum > 0 ? vatSum : Math.max(0, Math.round((amountGross - amountNet) * 100) / 100)
  const vatRate = amountNet > 0 ? Math.round((amountVat / amountNet) * 100) / 100 : 0

  const currency = String(pick(fa, ['KodWaluty']) || 'PLN')

  const data: KsefInvoiceData = { schema, seller, buyer, lines, payment }

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
    paid,
    paidDate,
    paidAmount,
    data,
  }
}

// Tytul (reference) platnosci tworzonych automatycznie z KSeF — sluzy tez jako
// znacznik do idempotentnego uzgadniania (odroznienie od platnosci recznych Marty).
export const KSEF_PAYMENT_REF = 'Opłacona wg KSeF'

/**
 * Wyznacza DOCELOWY status + laczna kwote oplacona wg KSeF (wartosc bezwzgledna,
 * nie delta). Reguly:
 *  - paid (Zaplacono=1) → OPLACONA, kwota = brutto.
 *  - platnosci czesciowe (paidAmount>0) → OPLACONA gdy pokrywaja brutto, inaczej CZESCIOWO_OPLACONA; kwota = min(paidAmount, brutto).
 *  - brak info LUB brutto<=0 (nie da sie wiarygodnie sklasyfikowac) → status bazowy, brak platnosci.
 * Zwraca laczna kwote `paidTotal` — wlasciwa delta (ile dotworzyc) liczona jest
 * przy uzgadnianiu wzgledem juz istniejacych platnosci z KSeF.
 */
export function ksefPaymentOutcome(
  parsed: ParsedKsefInvoice,
  notPaidStatus: string,
): { status: string; paidTotal: number; paidAt: Date } {
  const gross = parsed.amountGross
  const paidAt = parsed.paidDate || parsed.issueDate
  if (gross <= 0) return { status: notPaidStatus, paidTotal: 0, paidAt }
  if (parsed.paid) {
    return { status: 'OPLACONA', paidTotal: gross, paidAt }
  }
  if (parsed.paidAmount > 0) {
    const capped = Math.min(parsed.paidAmount, gross)
    const full = parsed.paidAmount >= gross - 0.01
    return { status: full ? 'OPLACONA' : 'CZESCIOWO_OPLACONA', paidTotal: capped, paidAt }
  }
  return { status: notPaidStatus, paidTotal: 0, paidAt }
}

type ReconcileInvoice = {
  id: string
  status: string
  payments: { amount: number; reference: string | null }[]
}

/**
 * Idempotentne uzgodnienie platnosci/statusu istniejacej faktury z danymi KSeF.
 *  - Tylko dla faktur POCHODZACYCH z KSeF (ctx.ksefOwned) i bez platnosci RECZNYCH
 *    — reczne/importowane/cross-company oraz te z platnosciami Marty: tylko snapshot ksefData.
 *  - Dotwarza WYLACZNIE brakujaca delte (min(paidTotal, payable) − juz zaplacone z KSeF),
 *    nigdy nie dublujac istniejacych platnosci z KSeF ani nie placąc ponad kwote nalezna. Atomowo.
 *  - Kwota nalezna (payable) = brutto − potracenia (kaucja/KB/prad) — jak w reszcie modulu.
 */
async function reconcileExistingFromKsef(
  kind: 'purchase' | 'sales',
  inv: ReconcileInvoice,
  parsed: ParsedKsefInvoice,
  ctx: { ksefOwned: boolean; payable: number },
): Promise<void> {
  const ksefData = asJson(parsed.data)
  const invModel: any = kind === 'purchase' ? prisma.purchaseInvoice : prisma.salesInvoice
  const payModel: any = kind === 'purchase' ? prisma.purchaseInvoicePayment : prisma.salesInvoicePayment

  const hasManual = inv.payments.some((p) => p.reference !== KSEF_PAYMENT_REF)
  if (!ctx.ksefOwned || hasManual) {
    // Nie ruszamy statusu/platnosci faktur recznych ani z platnosciami uzytkownika —
    // tylko odswiezamy snapshot KSeF (pozycje, dane podmiotow).
    await invModel.update({ where: { id: inv.id }, data: { ksefData } })
    return
  }

  const out = ksefPaymentOutcome(parsed, inv.status)
  const paidTarget = Math.min(out.paidTotal, ctx.payable)
  const alreadyKsef = inv.payments.reduce((s, p) => s + p.amount, 0)
  const delta = Math.round((paidTarget - alreadyKsef) * 100) / 100
  let status = inv.status
  if (paidTarget > 0) status = paidTarget >= ctx.payable - 0.01 ? 'OPLACONA' : 'CZESCIOWO_OPLACONA'

  if (delta > 0.01) {
    await prisma.$transaction([
      payModel.create({ data: { invoiceId: inv.id, amount: delta, paidAt: out.paidAt, reference: KSEF_PAYMENT_REF } }),
      invModel.update({ where: { id: inv.id }, data: { ksefData, status } }),
    ])
  } else if (status !== inv.status) {
    // Reklasyfikacja statusu bez nowej platnosci (np. korekta brutto/potracen).
    await invModel.update({ where: { id: inv.id }, data: { ksefData, status } })
  } else {
    await invModel.update({ where: { id: inv.id }, data: { ksefData } })
  }
}

// =====================================================================
// Sync per firma — pobiera faktury wystawione i otrzymane od lastSyncAt
// (lub syncFromDate jesli pierwsza synchronizacja), upsertuje do bazy.
// =====================================================================

export async function syncCompanyFromKsef(
  company: Company,
  opts: { fullResync?: boolean } = {},
): Promise<{ ok: boolean; count: number; completed: boolean; error?: string }> {
  const cfg = await prisma.ksefConfig.findUnique({ where: { company } })
  if (!cfg) return { ok: false, count: 0, completed: false, error: 'Brak konfiguracji KSeF' }
  if (!cfg.enabled) return { ok: false, count: 0, completed: false, error: 'KSeF wylaczony' }
  if (!cfg.token) return { ok: false, count: 0, completed: false, error: 'Brak tokenu KSeF' }

  const client = new KsefClient(cfg.nip, cfg.token, cfg.environment as KsefEnvironment)
  // Incrementalnie od ostatniej synchronizacji; przy fullResync od daty startu
  // (syncFromDate) — re-skan calego okna, by uzupelnic dane juz pobranych faktur
  // (ksefData/status platnosci). Dedup po ksefNumber (unique) → re-skan idempotentny.
  const defaultFrom = KSEF_DEFAULTS[company]?.syncFromDate || new Date('2026-06-01')
  const fromDate = opts.fullResync
    ? (cfg.syncFromDate || defaultFrom)
    : (cfg.lastSyncAt || cfg.syncFromDate || defaultFrom)
  const fromIso = fromDate.toISOString().slice(0, 10)
  // +1 dzien zapasu na granicy stref (UTC vs Europe/Warsaw) — over-inclusive
  // gorny zakres jest bezpieczny dzieki dedupowi po ksefNumber.
  const toIso = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  let totalCount = 0
  // Limit pobran XML na jedno uruchomienie (rate limit KSeF = 16/min). Przy
  // wiekszej liczbie faktur sync jest WZNAWIALNY: przetwarza paczke, a lastSyncAt
  // przesuwa sie dopiero po pelnym ukonczeniu (patrz route) — kolejne uruchomienie
  // kontynuuje (dedup po ksefNumber pomija juz pobrane).
  const MAX_XML_PER_RUN = 40
  let xmlFetches = 0
  let completed = true
  const fetchXml = (ksefNumber: string) => {
    xmlFetches++
    return client.getInvoiceXml(ksefNumber)
  }

  try {
    // 0. MIGRACJA STATUSU (jednorazowa, idempotentna): faktury zakupowe pobrane
    // z KSeF starym kodem dostawaly status ZATWIERDZONA. Decyzja: faktury z KSeF
    // maja byc WPROWADZONA (do przejrzenia), nie wygladac na zatwierdzone.
    // Migrujemy tylko faktury POCHODZACE z KSeF (znacznik jak w reconcile),
    // ktore NIE zostaly recznie zatwierdzone (brak wpisu APPROVE w historii)
    // i NIE maja platnosci. Po migracji 0 wierszy pasuje (idempotentne).
    await prisma.purchaseInvoice.updateMany({
      where: {
        company,
        status: 'ZATWIERDZONA',
        ksefNumber: { not: null },
        createdById: null,
        importSheet: null,
        sourceSalesInvoiceId: null,
        description: { startsWith: 'Z KSeF' },
        payments: { none: {} },
        approvals: { none: { action: { in: ['APPROVE', 'APPROVED'] } } },
      },
      data: { status: 'WPROWADZONA' },
    })

    // 1. SALES (Subject1) — faktury wystawione przez nas
    const salesMeta = await client.queryInvoicesMetadata({
      subjectType: 'Subject1',
      dateRange: { dateType: 'Issue', from: fromIso, to: toIso },
    })
    for (const meta of salesMeta) {
      if (xmlFetches >= MAX_XML_PER_RUN) { completed = false; break }
      const existing = await prisma.salesInvoice.findUnique({
        where: { ksefNumber: meta.ksefNumber },
        select: {
          id: true, ksefData: true, status: true,
          amountGross: true, deposit: true, buildingCosts: true,
          payments: { select: { amount: true, reference: true } },
        },
      })
      if (existing) {
        // Faktura przychodowa znaleziona po ksefNumber zawsze pochodzi z KSeF
        // (reczne nie maja ksefNumber). Re-skan nierozliczonych przy fullResync.
        const terminal = existing.status === 'OPLACONA' || existing.status === 'ANULOWANA'
        if (existing.ksefData == null || (opts.fullResync && !terminal)) {
          const xml = await fetchXml(meta.ksefNumber)
          const parsed = parseKsefInvoiceXml(xml, meta.ksefNumber)
          const payable = Math.round((existing.amountGross - (existing.deposit || 0) - (existing.buildingCosts || 0)) * 100) / 100
          await reconcileExistingFromKsef('sales', existing, parsed, { ksefOwned: true, payable })
        }
        continue
      }
      const xml = await fetchXml(meta.ksefNumber)
      const parsed = parseKsefInvoiceXml(xml, meta.ksefNumber)
      const out = ksefPaymentOutcome(parsed, 'WYSTAWIONA')
      await prisma.$transaction(async (tx) => {
        const created = await tx.salesInvoice.create({
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
            status: out.status,
            ksefNumber: meta.ksefNumber,
            ksefData: asJson(parsed.data),
            description: `Z KSeF (${meta.ksefNumber})`,
          },
        })
        if (out.paidTotal > 0.01) {
          await tx.salesInvoicePayment.create({
            data: { invoiceId: created.id, amount: out.paidTotal, paidAt: out.paidAt, reference: KSEF_PAYMENT_REF },
          })
        }
      })
      totalCount++
    }

    // 2. PURCHASES (Subject2) — faktury otrzymane
    const purchaseMeta = await client.queryInvoicesMetadata({
      subjectType: 'Subject2',
      dateRange: { dateType: 'Issue', from: fromIso, to: toIso },
    })
    for (const meta of purchaseMeta) {
      if (xmlFetches >= MAX_XML_PER_RUN) { completed = false; break }
      const existing = await prisma.purchaseInvoice.findUnique({
        where: { ksefNumber: meta.ksefNumber },
        select: {
          id: true, ksefData: true, status: true, description: true,
          amountGross: true, deposit: true, buildingCosts: true, electricity: true,
          createdById: true, importSheet: true, sourceSalesInvoiceId: true,
          payments: { select: { amount: true, reference: true } },
        },
      })
      if (existing) {
        // KSeF-owned = utworzona przez sync (nie reczna POST, nie import xlsx, nie cross-company)
        // i z opisem "Z KSeF". Reczne zlinkowane przez dup NIE sa auto-rozliczane.
        const ksefOwned =
          existing.createdById == null &&
          existing.importSheet == null &&
          existing.sourceSalesInvoiceId == null &&
          (existing.description || '').startsWith('Z KSeF')
        const terminal = existing.status === 'OPLACONA' || existing.status === 'ANULOWANA'
        // Backfill ksefData zawsze; reconcile platnosci tylko dla KSeF-owned nierozliczonych.
        if (existing.ksefData == null || (opts.fullResync && ksefOwned && !terminal)) {
          const xml = await fetchXml(meta.ksefNumber)
          const parsed = parseKsefInvoiceXml(xml, meta.ksefNumber)
          const payable = Math.round((existing.amountGross - (existing.deposit || 0) - (existing.buildingCosts || 0) - (existing.electricity || 0)) * 100) / 100
          await reconcileExistingFromKsef('purchase', existing, parsed, { ksefOwned, payable })
        }
        continue
      }
      const xml = await fetchXml(meta.ksefNumber)
      const parsed = parseKsefInvoiceXml(xml, meta.ksefNumber)
      // Vendor matching po NIP lub utworz
      const vendorName = parsed.sellerName || parsed.sellerNip || 'Nieznany'
      let vendor = await prisma.vendor.findFirst({ where: { OR: [{ nip: parsed.sellerNip }, { name: vendorName }] } })
      if (!vendor) {
        vendor = await prisma.vendor.create({
          data: { name: vendorName, nip: parsed.sellerNip || null, category: 'DOSTAWCA', notes: 'Auto-utworzony z KSeF' },
        })
      }
      // Sprawdz dup (vendor, number) — faktura wpisana wczesniej recznie.
      const dup = await prisma.purchaseInvoice.findUnique({
        where: { vendorId_number: { vendorId: vendor.id, number: parsed.invoiceNumber } },
        select: { id: true, ksefData: true },
      })
      if (dup) {
        // Zlinkuj z KSeF (ksefNumber) i dolacz pelne dane z FA; NIE ruszamy
        // statusu/platnosci recznej faktury.
        await prisma.purchaseInvoice.update({
          where: { id: dup.id },
          data: { ksefNumber: meta.ksefNumber, ...(dup.ksefData == null ? { ksefData: asJson(parsed.data) } : {}) },
        })
        continue
      }
      const out = ksefPaymentOutcome(parsed, 'WPROWADZONA')
      await prisma.$transaction(async (tx) => {
        const created = await tx.purchaseInvoice.create({
          data: {
            company,
            vendorId: vendor!.id,
            number: parsed.invoiceNumber,
            issueDate: parsed.issueDate,
            dueDate: parsed.dueDate,
            vatRate: parsed.vatRate,
            amountNet: parsed.amountNet,
            amountVat: parsed.amountVat,
            amountGross: parsed.amountGross,
            currency: parsed.currency,
            status: out.status,
            ksefNumber: meta.ksefNumber,
            ksefData: asJson(parsed.data),
            description: `Z KSeF (${meta.ksefNumber})`,
          },
        })
        if (out.paidTotal > 0.01) {
          await tx.purchaseInvoicePayment.create({
            data: { invoiceId: created.id, amount: out.paidTotal, paidAt: out.paidAt, reference: KSEF_PAYMENT_REF },
          })
        }
      })
      totalCount++
    }

    return { ok: true, count: totalCount, completed }
  } catch (e: any) {
    return { ok: false, count: totalCount, completed: false, error: e.message || String(e) }
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
