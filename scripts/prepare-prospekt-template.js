/* eslint-disable */
/**
 * Buduje templates/prospekt-informacyjny.docx — szablon prospektu
 * informacyjnego z kotwicami {{...}} dla części indywidualnej — z oryginału
 * templates/prospekt-informacyjny-original.docx (dokument od usera,
 * wersja "po hipotece 14.07").
 *
 * Tagowane miejsca (część wspólna dokumentu zostaje bez zmian):
 *  - str. 1:  "przygotowany dla lokalu nr ______"        → {{unitNumber}}
 *  - CZĘŚĆ INDYWIDUALNA (str. 14):
 *    · "________ zł" pod "Cena lokalu mieszkalnego..."   → {{totalPrice}} zł
 *    · "___" pod "Powierzchnia użytkowa lokalu..."       → {{unitArea}} m²
 *    · "________ zł" pod "Cena m2 powierzchni..."        → {{pricePerSqm}} zł
 *    · "Lokal nr ________ usytuowany jest na ___ kondygnacji budynku."
 *        → Lokal nr {{unitNumber}} ... na {{floorNo}} kondygnacji ...
 *    · "powierzchnia ____"                               → powierzchnia {{unitArea}} m²
 *
 * Metoda: przebudowa całych akapitów na pojedynczy run (zachowując pPr/rPr) —
 * odporna na rozbicie tekstu na runy przez Worda. Pozostałe podkreślenia
 * w dokumencie (np. kary umowne "__%") są celowo nietykane.
 *
 * Uruchomienie:  node scripts/prepare-prospekt-template.js
 */
const fs = require('fs')
const path = require('path')
const PizZip = require('pizzip')

const SRC = path.join(__dirname, '..', 'templates', 'prospekt-informacyjny-original.docx')
const DST = path.join(__dirname, '..', 'templates', 'prospekt-informacyjny.docx')

const zip = new PizZip(fs.readFileSync(SRC))
let xml = zip.file('word/document.xml').asText()

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const paraRe = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g

function paraText(p) {
  return [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')
}

function rebuild(target, newText) {
  const pPr = (target.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0]
  const firstRun = target.match(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/)
  const rPr = firstRun ? (firstRun[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0] : ''
  const openTag = target.match(/^<w:p(?: [^>]*)?>/)[0]
  return `${openTag}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(newText)}</w:t></w:r></w:p>`
}

// Podmienia akapity spełniające `match(tekstAkapitu)`; newTexts po kolei per
// wystąpienie. Waliduje dokładną liczbę trafień.
function replaceParas(label, match, newTexts) {
  const paras = xml.match(paraRe) || []
  const targets = paras.filter((p) => match(paraText(p)))
  if (targets.length !== newTexts.length) {
    console.error(`BLAD [${label}]: oczekiwano ${newTexts.length} akapitow, znaleziono ${targets.length}`)
    process.exit(1)
  }
  targets.forEach((t, i) => {
    xml = xml.replace(t, rebuild(t, newTexts[i]))
  })
  console.log(`OK [${label}] ×${newTexts.length}`)
}

replaceParas(
  'str.1 lokal nr',
  (t) => t.includes('przygotowany dla lokalu nr'),
  ['przygotowany dla lokalu nr {{unitNumber}}'],
)
replaceParas(
  'cena lokalu + cena m2',
  (t) => /^_{3,}\s*zł\s*$/.test(t.trim()),
  ['{{totalPrice}} zł', '{{pricePerSqm}} zł'],
)
replaceParas(
  'powierzchnia (tabela cen)',
  (t) => /^_{3,}$/.test(t.trim()),
  ['{{unitArea}} m²'],
)
replaceParas(
  'usytuowanie lokalu',
  (t) => t.includes('usytuowany jest na'),
  ['Lokal nr {{unitNumber}} usytuowany jest na {{floorNo}} kondygnacji budynku.'],
)
replaceParas(
  'powierzchnia (usytuowanie)',
  (t) => /^powierzchnia\s+_{3,}\s*$/.test(t.trim()),
  ['powierzchnia {{unitArea}} m²'],
)

zip.file('word/document.xml', xml)
fs.writeFileSync(DST, zip.generate({ type: 'nodebuffer' }))
console.log('Zapisano:', DST)
