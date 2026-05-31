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

  const total = contract.contractUnits.reduce((sum, cu) => sum + cu.unit.priceGross, 0)
  const priceSqm = mieszkanie
    ? mieszkanie.pricePerSqmGross || (mieszkanie.area > 0 ? mieszkanie.priceGross / mieszkanie.area : null)
    : null

  // Bank account from settings
  const bankSetting = await prisma.settings.findUnique({ where: { key: 'bankAccount' } })

  const client1 = contract.client
  const client2 = contract.contractClients[0]?.client || null

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
    unitPrice: mieszkanie ? fmt(mieszkanie.priceGross) : '...',
    unitPriceWords: mieszkanie ? wordsOr(mieszkanie.priceGross) : '...',
    pricePerSqm: priceSqm ? fmt(priceSqm) : '...',

    // Parking / garaże / komórka
    parking1Number: parkings[0]?.number || '...',
    parking2Number: parkings[1]?.number || '...',
    parking1Price: parkings[0] ? fmt(parkings[0].priceGross) : '...',
    parking2Price: parkings[1] ? fmt(parkings[1].priceGross) : '...',
    parking1PriceWords: parkings[0] ? wordsOr(parkings[0].priceGross) : '...',
    parking2PriceWords: parkings[1] ? wordsOr(parkings[1].priceGross) : '...',
    garage1Number: garaze[0]?.number || '...',
    garage2Number: garaze[1]?.number || '...',
    garage1Price: garaze[0] ? fmt(garaze[0].priceGross) : '...',
    garage2Price: garaze[1] ? fmt(garaze[1].priceGross) : '...',
    garage1PriceWords: garaze[0] ? wordsOr(garaze[0].priceGross) : '...',
    garage2PriceWords: garaze[1] ? wordsOr(garaze[1].priceGross) : '...',
    komorkaNumber: komorka?.number || '...',
    komorkaArea: komorka ? fmt(komorka.area) : '...',
    komorkaAreaWords: komorka ? areaWords(komorka.area) : '...',
    komorkaPrice: komorka ? fmt(komorka.priceGross) : '...',
    komorkaPriceWords: komorka ? wordsOr(komorka.priceGross) : '...',

    // Totals
    totalPrice: fmt(total),
    totalPriceWords: wordsOr(total),

    // Fee / bank / dates
    bankAccount: bankSetting?.value || '...',
    reservationFee: contract.reservationFee != null ? fmt(contract.reservationFee) : '...',
    reservationFeeWords: contract.reservationFee != null
      ? integerToWordsPl(Math.floor(contract.reservationFee))
      : '...',
    reservationFeeDeadline: fmtDate(contract.plannedSignDate),
    reservationEndDate: fmtDate(contract.plannedSignDate),
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
