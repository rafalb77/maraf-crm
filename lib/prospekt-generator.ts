import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import type { Unit } from '@prisma/client'

// Generator prospektu informacyjnego per lokal MIESZKALNY. Część wspólna
// dokumentu jest stała (templates/prospekt-informacyjny.docx, budowany przez
// scripts/prepare-prospekt-template.js z oryginału); uzupełniamy tylko część
// indywidualną: numer lokalu (×2), kondygnację, powierzchnię (×2), cenę za m²
// i cenę całkowitą — z bieżącego cennika lokalu (Unit), nie ze snapshotu umowy.

function fmt(n: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function generateProspektDocx(unit: Unit): Buffer {
  if (unit.type !== 'MIESZKALNY') {
    throw new Error('Prospekt informacyjny generujemy tylko dla lokali mieszkalnych.')
  }
  const templatePath = path.join(process.cwd(), 'templates', 'prospekt-informacyjny.docx')
  if (!fs.existsSync(templatePath)) {
    throw new Error('Brak szablonu prospektu. Uruchom: node scripts/prepare-prospekt-template.js')
  }

  const zip = new PizZip(fs.readFileSync(templatePath))
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  })

  doc.render({
    unitNumber: unit.number,
    unitArea: fmt(unit.area),
    pricePerSqm: fmt(unit.pricePerSqmGross),
    totalPrice: fmt(unit.priceGross),
    // Kondygnacja = piętro + 1 (parter = pierwsza kondygnacja) — konwencja
    // z §1 umowy rezerwacyjnej („na kondygnacji pierwszej (parterze)").
    floorNo: String((unit.floor ?? 0) + 1),
  })
  return doc.getZip().generate({ type: 'nodebuffer' })
}
