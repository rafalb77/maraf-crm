// Typy i stale modulu Obciazenia kontrahentow — BEZ importu Prismy, bo
// korzysta z nich takze komponent kliencki (ObciazeniaKontrahent).
// Agregacja (server-only) jest w lib/obciazenia.ts.

export type ChargeType = 'KAUCJA' | 'KB' | 'PRAD' | 'KARA'

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  KAUCJA: 'Kaucja gwarancyjna',
  KB: 'Koszty budowy',
  PRAD: 'Prąd',
  KARA: 'Kara',
}

export const CHARGE_TYPE_COLORS: Record<ChargeType, string> = {
  KAUCJA: 'bg-amber-100 text-amber-700',
  KB: 'bg-blue-100 text-blue-700',
  PRAD: 'bg-sky-100 text-sky-700',
  KARA: 'bg-rose-100 text-rose-700',
}

export type ChargeItem = {
  key: string
  type: ChargeType
  date: string // ISO — data wystawienia FV / nalozenia kary
  number: string | null // nr FV / nr noty
  invoiceId: string | null
  chargeId: string | null
  title: string | null // tytul kary
  amount: number // kwota potracenia (brutto-rownowazna); dla kary = netto
  amountNet: number
  pct: number | null // % z faktury (kaucja/KB)
  // Cykl zycia: kaucja (trzymana/zwrocona/po terminie zwrotu), kara
  // (aktywna/rozliczona). KB/PRAD sa potraceniami definitywnymi — null.
  status: 'AKTYWNA' | 'PO_TERMINIE' | 'ZWROCONA' | 'ROZLICZONA' | null
  returnDate: string | null
  returnedAt: string | null
  settledAt: string | null
  notes: string | null
}

export type VendorCharges = {
  label: string
  umbrella: string | null // parasol (vendor), gdy pozycje ida z etykiety subVendor
  items: ChargeItem[]
  // Sumy NETTO: kaucje TRZYMANE, KB/prad narastajaco, kary AKTYWNE
  netKaucje: number
  netKb: number
  netPrad: number
  netKary: number
  netTotal: number
  overdueReturns: number // kaucje po terminie zwrotu
}
