import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import type { Contract, Client, Unit, ContractUnit, ContractClient } from '@prisma/client'
import { amountToWordsPl, integerToWordsPl } from './numberToWordsPl'
import { prisma } from './prisma'

type ContractWithRelations = Contract & {
  client: Client
  contractClients: (ContractClient & { client: Client })[]
  contractUnits: (ContractUnit & { unit: Unit })[]
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '...'
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '...'
  const date = new Date(d)
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

function floorWord(n: number | null): string {
  if (n == null) return '...'
  const words = ['parterze', 'pierwszej', 'drugiej', 'trzeciej', 'czwartej', 'piątej']
  return words[n] || String(n)
}

function wordsOr(n: number | null | undefined): string {
  if (n == null) return '...'
  return amountToWordsPl(n)
}

function areaWords(n: number | null | undefined): string {
  if (n == null) return '...'
  // spell out integer part; decimals left as fractional
  const whole = Math.floor(n)
  const decimals = Math.round((n - whole) * 100)
  const wholeWord = integerToWordsPl(whole)
  if (decimals === 0) return `${wholeWord} całych`
  return `${wholeWord} i ${decimals}/100`
}

function clientCtx(prefix: string, c: Client | null) {
  if (!c) {
    return {
      [`${prefix}Name`]: '...',
      [`${prefix}Father`]: '...',
      [`${prefix}Mother`]: '...',
      [`${prefix}Id`]: '...',
      [`${prefix}Pesel`]: '...',
      [`${prefix}Address`]: '...',
    }
  }
  return {
    [`${prefix}Name`]: `${c.firstName} ${c.lastName}`.toUpperCase(),
    [`${prefix}Father`]: c.fatherName || '...',
    [`${prefix}Mother`]: c.motherName || '...',
    [`${prefix}Id`]: c.idNumber || '...',
    [`${prefix}Pesel`]: c.pesel || '...',
    [`${prefix}Address`]: [c.address, c.zipCode, c.city].filter(Boolean).join(', ') || '...',
  }
}

export async function buildContractContext(contract: ContractWithRelations): Promise<Record<string, string>> {
  const mieszkanie = contract.contractUnits.find((cu) => cu.unit.type === 'MIESZKALNY')?.unit
  const parkings = contract.contractUnits.filter((cu) => cu.unit.type === 'PARKING').map((cu) => cu.unit)
  const garaze = contract.contractUnits.filter((cu) => cu.unit.type === 'GARAZ').map((cu) => cu.unit)
  const komorka = contract.contractUnits.find((cu) => cu.unit.type === 'KOMORKA')?.unit

  // Ceny z UMOWY (snapshot na ContractUnit, po rabacie/z oferty) z fallbackiem
  // na cenę bazową lokalu (umowy sprzed wdrożenia snapshotu).
  const grossById = new Map(contract.contractUnits.map((cu) => [cu.unitId, cu.priceGross ?? cu.unit.priceGross]))
  const grossOf = (u: Unit | null | undefined): number | null => (u ? (grossById.get(u.id) ?? u.priceGross) : null)

  const total = contract.contractUnits.reduce((sum, cu) => sum + (cu.priceGross ?? cu.unit.priceGross), 0)
  const priceSqm = mieszkanie && mieszkanie.area > 0 ? (grossOf(mieszkanie)! / mieszkanie.area) : null

  // Bank account from settings
  const bankSetting = await prisma.settings.findUnique({ where: { key: 'bankAccount' } })

  // Termin wpłaty opłaty rezerwacyjnej = data podpisania (lub planowana) + N dni.
  const signBase = contract.signedAt || contract.plannedSignDate
  const feeDeadline = signBase
    ? new Date(signBase.getTime() + (contract.reservationFeeDays ?? 7) * 86_400_000)
    : null

  const client1 = contract.client
  // Współrezerwujący = pierwszy contractClient RÓŻNY od głównego klienta.
  // (Import/konwersja wrzucały głównego na pozycję 1 — bez tego dublował się.)
  const client2 = contract.contractClients.find((cc) => cc.clientId !== contract.clientId)?.client || null

  return {
    contractNumber: contract.number,
    signDate: fmtDate(contract.signedAt || contract.plannedSignDate),

    ...clientCtx('client1', client1),
    ...clientCtx('client2', client2),

    // Mieszkanie
    floor: mieszkanie?.floor != null ? floorWord(mieszkanie.floor) : '...',
    unitNumber: mieszkanie?.number || '...',
    unitArea: mieszkanie ? fmt(mieszkanie.area) : '...',
    unitAreaWords: mieszkanie ? areaWords(mieszkanie.area) : '...',
    unitPrice: mieszkanie ? fmt(grossOf(mieszkanie)) : '...',
    unitPriceWords: mieszkanie ? wordsOr(grossOf(mieszkanie)) : '...',
    pricePerSqm: priceSqm ? fmt(priceSqm) : '...',

    // Parking / garaże / komórka
    parking1Number: parkings[0]?.number || '...',
    parking2Number: parkings[1]?.number || '...',
    parking1Price: parkings[0] ? fmt(grossOf(parkings[0])) : '...',
    parking2Price: parkings[1] ? fmt(grossOf(parkings[1])) : '...',
    parking1PriceWords: parkings[0] ? wordsOr(grossOf(parkings[0])) : '...',
    parking2PriceWords: parkings[1] ? wordsOr(grossOf(parkings[1])) : '...',
    garage1Number: garaze[0]?.number || '...',
    garage2Number: garaze[1]?.number || '...',
    garage1Price: garaze[0] ? fmt(grossOf(garaze[0])) : '...',
    garage2Price: garaze[1] ? fmt(grossOf(garaze[1])) : '...',
    garage1PriceWords: garaze[0] ? wordsOr(grossOf(garaze[0])) : '...',
    garage2PriceWords: garaze[1] ? wordsOr(grossOf(garaze[1])) : '...',
    komorkaNumber: komorka?.number || '...',
    komorkaArea: komorka ? fmt(komorka.area) : '...',
    komorkaAreaWords: komorka ? areaWords(komorka.area) : '...',
    komorkaPrice: komorka ? fmt(grossOf(komorka)) : '...',
    komorkaPriceWords: komorka ? wordsOr(grossOf(komorka)) : '...',

    // Totals
    totalPrice: fmt(total),
    totalPriceWords: wordsOr(total),

    // Fee / bank / dates
    bankAccount: bankSetting?.value || '...',
    reservationFee: contract.reservationFee != null ? fmt(contract.reservationFee) : '...',
    reservationFeeWords: contract.reservationFee != null
      ? integerToWordsPl(Math.floor(contract.reservationFee))
      : '...',
    reservationFeeDeadline: fmtDate(feeDeadline),
    // Termin zakończenia rezerwacji: jawne pole; fallback plannedSignDate dla
    // umów sprzed wdrożenia (stare umowy używały planowanej daty podpisania).
    reservationEndDate: fmtDate(contract.reservationEndDate ?? contract.plannedSignDate),
  }
}

/**
 * Renderuje umowę jako HTML (do podglądu w UI). Generuje DOCX z szablonu
 * (jedno źródło prawdy) i konwertuje go przez mammoth → wierne odwzorowanie treści.
 */
export async function generateContractHtml(contract: ContractWithRelations): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const buffer = await generateContractDocx(contract)
  const { value } = await mammoth.convertToHtml({ buffer })
  return value
}

export async function generateContractDocx(contract: ContractWithRelations): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'templates', 'umowa-rezerwacyjna.docx')
  if (!fs.existsSync(templatePath)) {
    throw new Error('Brak szablonu umowy. Uruchom: node scripts/prepare-template.js')
  }

  const buf = fs.readFileSync(templatePath)
  const zip = new PizZip(buf)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  })

  const ctx = await buildContractContext(contract)
  doc.render(ctx)
  return doc.getZip().generate({ type: 'nodebuffer' })
}
