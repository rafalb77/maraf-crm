// Builds templates/umowa-rezerwacyjna.docx by tagging the original.
// The original text is split across <w:r> runs, so we operate on each
// individual <w:t> content, matched sequentially by index (based on the
// list of underscore-containing runs in the document).
const fs = require('fs')
const path = require('path')
const PizZip = require('pizzip')

const SRC = path.join(__dirname, '..', 'templates', 'umowa-rezerwacyjna-original.docx')
const DST = path.join(__dirname, '..', 'templates', 'umowa-rezerwacyjna.docx')

const buf = fs.readFileSync(SRC)
const zip = new PizZip(buf)
let xml = zip.file('word/document.xml').asText()

// Replacements for each <w:t> run that contains underscores, indexed by
// order of appearance. Each entry: { match: RegExp|string, replace: string }.
const runReplacements = [
  // 0: "NR _______________"
  { match: /NR _{3,}/, replace: 'NR {{contractNumber}}' },
  // 1: " __________________ " (signing date)
  { match: /^ _{3,} $/, replace: ' {{signDate}} ' },
  // 2: client 1 block (full <w:t>)
  {
    match: /_{20,}, synem\/córką _{3,} i _{3,}, dowód osobisty\/paszport _{3,}, PESEL _{3,}, /,
    replace: '{{client1Name}}, synem/córką {{client1Father}} i {{client1Mother}}, dowód osobisty/paszport {{client1Id}}, PESEL {{client1Pesel}}, ',
  },
  // 3: "pod adresem ______________________"
  { match: /pod adresem _{3,}$/, replace: 'pod adresem {{client1Address}}' },
  // 4: client 2 full block
  {
    match: /_{20,}, synem\/córką _{3,} i _{3,}, dowód osobisty\/paszport _{3,}, PESEL _{3,}, zamieszkałym\/ą pod adresem _{3,},/,
    replace: '{{client2Name}}, synem/córką {{client2Father}} i {{client2Mother}}, dowód osobisty/paszport {{client2Id}}, PESEL {{client2Pesel}}, zamieszkałym/ą pod adresem {{client2Address}},',
  },
  // 5: floor + unit project number in same run
  {
    match: /na jego _{3,} kondygnacji lokal mieszkalny oznaczony numerem projektowym _{3,} o projektowanej/,
    replace: 'na jego {{floor}} kondygnacji lokal mieszkalny oznaczony numerem projektowym {{unitNumber}} o projektowanej',
  },
  // 6: "lokalu wynoszącej _____ "
  { match: /lokalu wynoszącej _{3,} $/, replace: 'lokalu wynoszącej {{unitArea}} ' },
  // 7: first "(_______ metra kwadratowego)" => unit area words
  { match: /^ \(_{3,} metra kwadratowego\)$/, replace: ' ({{unitAreaWords}} metra kwadratowego)' },
  // 8: parking 1 number (run ending with "Miejsca Postojowego numer ____ ")
  { match: /Miejsca Postojowego numer _{3,} $/, replace: 'Miejsca Postojowego numer {{parking1Number}} ' },
  // 9: parking 2 number
  { match: /Drugiego Miejsca Postojowego numer _{3,}$/, replace: 'Drugiego Miejsca Postojowego numer {{parking2Number}}' },
  // 10: komorka number (bare "____ " run)
  { match: /^_{3,} $/, replace: '{{komorkaNumber}} ' },
  // 11: komorka area (digits)
  { match: /o projektowanej powierzchni _{3,} m$/, replace: 'o projektowanej powierzchni {{komorkaArea}} m' },
  // 12: second "(_______ metra kwadratowego) / " => komorka area words
  { match: /^ \(_{3,} metra kwadratowego\) \/ $/, replace: ' ({{komorkaAreaWords}} metra kwadratowego) / ' },
  // 13: garage 1 + garage 2 (single run)
  {
    match: /Miejsca Garażowego numer _{3,} \/ Drugiego Miejsca Garażowego numer _{3,}/,
    replace: 'Miejsca Garażowego numer {{garage1Number}} / Drugiego Miejsca Garażowego numer {{garage2Number}}',
  },
  // 14: reservation end date — run of "_________________" alone
  { match: /^_{3,}$/, replace: '{{reservationEndDate}}' },
  // 15: price of Lokal Mieszkalny line
  {
    match: /cena Lokalu Mieszkalnego – _{3,}/,
    replace: 'cena Lokalu Mieszkalnego – {{unitPrice}}',
  },
  // 16: slownie unit price (split into two segments)
  { match: /^_{3,} _{3,}$/, replace: '{{unitPriceWords}}' },
  // 17: ", to jest iloczyn ... stawki ________ zł brutto za 1 m"
  {
    match: /, to jest iloczyn powierzchni użytkowej Lokalu Mieszkalnego i stawki _{3,} zł brutto za 1 m/,
    replace: ', to jest iloczyn powierzchni użytkowej Lokalu Mieszkalnego i stawki {{pricePerSqm}} zł brutto za 1 m',
  },
  // 18: Naziemnego Miejsca Postojowego price + words
  {
    match: /ostojowego – _{3,} zł \(słownie: _{3,} _{3,}\) brutto;/,
    replace: 'ostojowego – {{parking1Price}} zł (słownie: {{parking1PriceWords}}) brutto;',
  },
  // 19: Drugiego Naziemnego Miejsca Postojowego (second "ostojowego – ... brutto" run)
  {
    match: /ostojowego – _{3,} zł \(słownie: _{3,}\) brutto/,
    replace: 'ostojowego – {{parking2Price}} zł (słownie: {{parking2PriceWords}}) brutto',
  },
  // 20: Komórki price
  {
    match: /cena prawa do wyłącznego korzystania z Komórki – _{3,} zł \(słownie: _{3,}\) brutto;/,
    replace: 'cena prawa do wyłącznego korzystania z Komórki – {{komorkaPrice}} zł (słownie: {{komorkaPriceWords}}) brutto;',
  },
  // 21: Miejsca Garażowego price
  {
    match: /cena prawa do wyłącznego korzystania Miejsca Garażowego – _{3,} zł \(słownie: _{3,}\) brutto;/,
    replace: 'cena prawa do wyłącznego korzystania Miejsca Garażowego – {{garage1Price}} zł (słownie: {{garage1PriceWords}}) brutto;',
  },
  // 22: Drugiego Miejsca Garażowego price
  {
    match: /cena prawa do wyłącznego korzystania Drugiego Miejsca Garażowego – _{3,} zł \(słownie: _{3,}\) brutto/,
    replace: 'cena prawa do wyłącznego korzystania Drugiego Miejsca Garażowego – {{garage2Price}} zł (słownie: {{garage2PriceWords}}) brutto',
  },
  // 23: total price
  {
    match: /czyli na łączną cenę brutto w kwocie _{3,} zł \(słownie: _{3,}\)\./,
    replace: 'czyli na łączną cenę brutto w kwocie {{totalPrice}} zł (słownie: {{totalPriceWords}}).',
  },
  // 24: land share price
  {
    match: / ha, zapewniającą Przedmiotowi Umowy dostęp do drogi publicznej, za cenę kwocie _{3,} zł \(słownie: _{3,}\) brutto/,
    replace: ' ha, zapewniającą Przedmiotowi Umowy dostęp do drogi publicznej, za cenę kwocie {{landSharePrice}} zł (słownie: {{landSharePriceWords}}) brutto',
  },
  // 25: bank account (long run of _____ alone)
  { match: /^_{30,}$/, replace: '{{bankAccount}}' },
  // 26: reservation fee amount (bare "_________" run shorter than 30)
  { match: /^_{5,29}$/, replace: '{{reservationFee}}' },
  // 27: reservation fee words (bare "_______________________")
  { match: /^_{20,29}$/, replace: '{{reservationFeeWords}}' },
  // 28: reservation fee deadline
  { match: /najpóźniej do dnia _{3,} r/, replace: 'najpóźniej do dnia {{reservationFeeDeadline}} r' },
]

let runIdx = 0
let replaced = 0
let skipped = 0

// Iterate every <w:t>...</w:t> run, apply replacement by global index.
xml = xml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (full, attrs, content) => {
  if (!/_{3,}/.test(content)) return full
  const r = runReplacements[runIdx]
  runIdx++
  if (!r) {
    skipped++
    return full
  }
  const newContent = content.replace(r.match, r.replace)
  if (newContent === content) {
    skipped++
    console.warn(`⚠ run ${runIdx - 1}: match failed. Content:`, JSON.stringify(content))
    return full
  }
  replaced++
  return `<w:t${attrs}>${newContent}</w:t>`
})

console.log(`Replaced: ${replaced}, Skipped: ${skipped}, Total runs visited: ${runIdx}`)

zip.file('word/document.xml', xml)
fs.writeFileSync(DST, zip.generate({ type: 'nodebuffer' }))
console.log('✓ Tagged template written to', DST)
