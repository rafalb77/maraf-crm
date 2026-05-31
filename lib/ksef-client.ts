// =====================================================================
// KSeF API 2.0 — klient (SZKIELET).
//
// Status: stuby + interfejs gotowy do wpięcia rzeczywistej implementacji.
// Wszystkie metody rzucają NotImplementedError z TODO. Logika UI/endpointów
// (zapisywanie konfiguracji, listowanie faktur z DB) działa niezależnie —
// faktyczne wywołania KSeF dopiero gdy ktoś zaimplementuje te metody.
//
// Dokumentacja API 2.0:
//   https://ksef.podatki.gov.pl (publikacja czerwiec 2025)
//   https://tritaxoffice.pl/integracja-z-ksef-2-0-techniczny-przewodnik-po-api-strukturze-fa3-i-uwierzytelnianiu/
//   https://ksbot.pl/api/ksef-api-2-0/
//
// Co implementacja musi obsłużyć (kolejność):
//   1. authenticate(token) → token autoryzacyjny długoterminowy
//      - POST /api/v2/auth/challenge (challenge ważny 10 min)
//      - podpisanie AuthTokenRequest tokenem KSeF (lub XAdES z pieczęcią kwalifikowaną)
//      - cache w pamięci/DB do wygaśnięcia (LongLivedToken — kilka miesięcy)
//   2. queryInvoicesMetadata({ from, to, direction }) → lista metadanych faktur
//      - POST /invoices/query/metadata (filtry: zakres dat, kierunek: wystawione/otrzymane)
//      - paginate
//   3. getInvoiceXml(ksefNumber) → zaszyfrowany XML
//      - GET /invoices/ksef/{ksefNumber}
//   4. decryptInvoiceXml(encrypted) → plain XML
//      - AES-256-CBC z kluczem symetrycznym
//      - klucz symetryczny zaszyfrowany RSAES-OAEP (SHA-256/MGF1) — odszyfrować naszą parą RSA
//      - klucze RSA wygenerować raz i wgrać do KSeF (część flow auth)
//   5. parseInvoiceFA3(xml) → strukturalny obiekt (numer, daty, kontrahent NIP+nazwa,
//      pozycje, sumy netto/VAT/brutto)
//      - schemat FA(3) — zacząć od pól które realnie zapisujemy do PurchaseInvoice/SalesInvoice
//
// Sync per firma (cron lub przycisk "Synchronizuj teraz"):
//   - dla każdej KsefConfig (enabled=true):
//     - auth tokenem firmy
//     - queryMetadata od lastSyncAt (lub syncFromDate jeśli null)
//     - dla każdej faktury: getInvoiceXml → decrypt → parseFA3
//     - upsert do SalesInvoice/PurchaseInvoice po ksefNumber (unique)
//     - vendor match po NIP lub utwórz
//     - update lastSyncAt + lastSyncStatus + lastSyncCount
// =====================================================================

export type KsefEnvironment = 'PROD' | 'TEST'

export type KsefInvoiceMetadata = {
  ksefNumber: string
  issueDate: Date
  invoiceNumber: string
  sellerNip: string
  sellerName: string
  buyerNip: string
  buyerName: string
  amountGross: number
  amountNet: number
  amountVat: number
  currency: string
}

export type KsefDirection = 'ISSUED' | 'RECEIVED' // wystawione przez nas / otrzymane

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`KSeF client: ${method} — not implemented yet. See lib/ksef-client.ts header for plan.`)
  }
}

const ENDPOINTS: Record<KsefEnvironment, string> = {
  PROD: 'https://ksef.podatki.gov.pl',
  TEST: 'https://ksef-test.mf.gov.pl', // do weryfikacji
}

export class KsefClient {
  private authToken: string | null = null

  constructor(
    public readonly nip: string,
    public readonly providedToken: string,
    public readonly environment: KsefEnvironment = 'PROD',
  ) {}

  get baseUrl(): string {
    return ENDPOINTS[this.environment]
  }

  /**
   * Uwierzytelnienie: challenge + podpisanie tokenem → authToken długoterminowy.
   * TODO: pełna implementacja (challenge endpoint + AuthTokenRequest XML + sign).
   */
  async authenticate(): Promise<string> {
    throw new NotImplementedError('authenticate()')
  }

  /**
   * Lista metadanych faktur w zakresie dat. Paginate.
   * TODO: POST /invoices/query/metadata z filtrami direction + dateFrom/dateTo.
   */
  async queryInvoicesMetadata(_opts: {
    from: Date
    to: Date
    direction: KsefDirection
  }): Promise<KsefInvoiceMetadata[]> {
    throw new NotImplementedError('queryInvoicesMetadata()')
  }

  /**
   * Pobranie zaszyfrowanego XML faktury po numerze KSeF.
   * TODO: GET /invoices/ksef/{ksefNumber}.
   */
  async getInvoiceXml(_ksefNumber: string): Promise<{ encrypted: Buffer; encryptedSymKey: Buffer }> {
    throw new NotImplementedError('getInvoiceXml()')
  }

  /**
   * Deszyfrowanie faktury (AES-256-CBC + RSAES-OAEP).
   * TODO: użyć Node 'crypto'. Wymaga naszej pary RSA wgranej do KSeF przy auth.
   */
  async decryptInvoiceXml(_encrypted: Buffer, _encryptedSymKey: Buffer): Promise<string> {
    throw new NotImplementedError('decryptInvoiceXml()')
  }
}

/**
 * Wysokopoziomowy sync per firma. Wywoływany przez przycisk "Synchronizuj teraz"
 * lub cron. Na razie zwraca placeholder — pełna implementacja gdy będą tokeny
 * obu firm i przetestowana auth.
 */
export async function syncCompanyFromKsef(_company: 'MARAF' | 'MARAF_DEVELOPMENT'): Promise<{
  ok: boolean
  count: number
  error?: string
}> {
  return {
    ok: false,
    count: 0,
    error: 'Klient KSeF jeszcze nie zaimplementowany — szkielet gotowy do wpięcia. Patrz lib/ksef-client.ts.',
  }
}
