/* eslint-disable */
/**
 * Buduje templates/aneks-deweloperska.docx — szablon aneksu do umowy
 * (dołożenie garażu / miejsca postojowego / komórki). Reużywa KONTENERA
 * istniejącego szablonu umowy rezerwacyjnej (style, czcionki, content-types,
 * ustawienia strony), podmieniając tylko treść (word/document.xml). Dzięki temu
 * wynik jest gwarantowanie poprawnym .docx o spójnym wyglądzie.
 *
 * Placeholdery (docxtemplater, delimiter {{ }}):
 *   {{annexNumber}} {{contractNumber}} {{annexDate}}
 *   {{client1Name}}  {{#hasClient2}} … {{client2Name}} … {{/hasClient2}}
 *   pętla: {{#addedUnits}} {{typeLabel}} {{number}} {{areaClause}} {{price}} {{priceWords}} {{/addedUnits}}
 *   {{totalGross}} {{totalGrossWords}}
 *
 * Uruchomienie:  node scripts/prepare-annex-template.js
 */
const fs = require('fs')
const path = require('path')
const PizZip = require('pizzip')

const SRC = path.join(__dirname, '..', 'templates', 'umowa-rezerwacyjna.docx')
const DST = path.join(__dirname, '..', 'templates', 'aneks-deweloperska.docx')

const buf = fs.readFileSync(SRC)
const zip = new PizZip(buf)
const origXml = zip.file('word/document.xml').asText()

// Wyciągnij nagłówek <w:document ...> (z przestrzeniami nazw) i ustawienia
// strony <w:sectPr>…</w:sectPr> z oryginału, żeby zachować marginesy/rozmiar.
const docOpen = origXml.match(/<w:document[^>]*>/)[0]
const sectPr = (origXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/) || ['<w:sectPr/>'])[0]

// ---- Budowa akapitów ----
function run(text, { bold, size } = {}) {
  const rpr =
    bold || size
      ? `<w:rPr>${bold ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}</w:rPr>`
      : ''
  return `<w:r>${rpr}<w:t xml:space="preserve">${text}</w:t></w:r>`
}
function p(text, { bold, center, size } = {}) {
  const ppr = center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''
  const runs = Array.isArray(text) ? text.join('') : run(text, { bold, size })
  return `<w:p>${ppr}${runs}</w:p>`
}
const empty = () => '<w:p/>'

const body = [
  p('ANEKS NR {{annexNumber}}', { bold: true, center: true, size: 32 }),
  p('do umowy deweloperskiej nr {{contractNumber}}', { center: true, bold: true }),
  empty(),
  p('Zawarty w dniu {{annexDate}} pomiędzy:'),
  empty(),
  p('MARAF Development Spółka z ograniczoną odpowiedzialnością z siedzibą w Łodzi, zwaną dalej „Deweloperem”,'),
  p('a'),
  p([
    run('{{client1Name}}'),
    run('{{#hasClient2}} oraz {{client2Name}}{{/hasClient2}}'),
    run(', zwanym/zwanymi dalej „Nabywcą”.'),
  ]),
  empty(),
  p('§ 1', { bold: true, center: true }),
  p('Strony zgodnie postanawiają rozszerzyć przedmiot umowy deweloperskiej nr {{contractNumber}} o następujące składniki:'),
  // Pętla po dołożonych lokalach — akapit powtarzany per pozycja.
  p('{{#addedUnits}}'),
  p('— {{typeLabel}} nr {{number}}{{areaClause}}, za cenę brutto {{price}} zł (słownie: {{priceWords}}).'),
  p('{{/addedUnits}}'),
  empty(),
  p('§ 2', { bold: true, center: true }),
  p('Łączna cena brutto przedmiotu umowy, po uwzględnieniu niniejszego aneksu, wynosi {{totalGross}} zł (słownie: {{totalGrossWords}}).'),
  empty(),
  p('§ 3', { bold: true, center: true }),
  p('Pozostałe postanowienia umowy deweloperskiej pozostają bez zmian.'),
  empty(),
  p('Aneks sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze stron.'),
  empty(),
  empty(),
  p([run('……………………………………                              ……………………………………')]),
  p([run('            Deweloper                                                          Nabywca')]),
].join('')

const newDoc = `${docOpen}<w:body>${body}${sectPr}</w:body></w:document>`

zip.file('word/document.xml', newDoc)
const out = zip.generate({ type: 'nodebuffer' })
fs.writeFileSync(DST, out)
console.log('Zapisano', path.relative(process.cwd(), DST), `(${out.length} B)`)
