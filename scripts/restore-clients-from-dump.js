// Przywracanie klientów z pełnego zrzutu JSON (tworzonego automatycznie przez
// dedupe-clients.js przed --apply, w scripts/backups/), albo z dowolnego eksportu
// o tym samym kształcie.
//
// BEZPIECZNE: odtwarza WYŁĄCZNIE klientów, których ID już NIE MA w bazie
// (twardo skasowanych). Istniejących rekordów NIGDY nie dotyka — zero nadpisań.
// Pola szyfrowane (pesel/adres/…) zapisywane 1:1 (ciphertext, ten sam klucz) przez
// bazowy PrismaClient, więc pozostają odczytywalne przez extension w lib/prisma.ts.
//
// UWAGA: powiązania (umowy/aktywności/lokale) mogły zostać przez dedupe przepięte
// na innego klienta — restore przywraca REKORD OSOBY z danymi kontaktowymi, nie
// cofa przepięcia relacji. To i tak ratuje utracone dane; relacje można poprawić ręcznie.
//
// Użycie (Coolify Terminal):
//   node scripts/restore-clients-from-dump.js <plik.json>            # RAPORT
//   node scripts/restore-clients-from-dump.js <plik.json> --apply    # przywraca
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')

const APPLY = process.argv.includes('--apply')
const file = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'))

// Pola Client odtwarzane 1:1. id zachowujemy, by ewentualne wiszące referencje
// się rozwiązały. createdAt/updatedAt konwertujemy na Date.
const SCALAR_FIELDS = [
  'id', 'firstName', 'lastName', 'email', 'phone', 'phone2', 'pesel', 'nip',
  'idNumber', 'fatherName', 'motherName', 'address', 'city', 'zipCode',
  'status', 'source', 'notes', 'ownerId', 'createdAt', 'updatedAt',
]
const DATE_FIELDS = new Set(['createdAt', 'updatedAt'])

function toData(row) {
  const d = {}
  for (const f of SCALAR_FIELDS) {
    if (!(f in row)) continue
    d[f] = DATE_FIELDS.has(f) && row[f] ? new Date(row[f]) : row[f]
  }
  return d
}

async function main() {
  if (!file) {
    console.error('Podaj plik zrzutu: node scripts/restore-clients-from-dump.js <plik.json> [--apply]')
    process.exit(1)
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(rows)) throw new Error('Zrzut musi być tablicą klientów.')
  console.log(`Wczytano ${rows.length} rekordów z ${file}`)

  const prisma = new PrismaClient()
  try {
    const existingIds = new Set((await prisma.client.findMany({ select: { id: true } })).map((c) => c.id))
    const missing = rows.filter((r) => r.id && !existingIds.has(r.id))
    console.log(`W bazie brakuje: ${missing.length} (istnieje: ${rows.length - missing.length}, pomijane)`)

    let created = 0
    const failed = []
    for (const r of missing) {
      const name = `${r.firstName || ''} ${r.lastName || ''}`.trim()
      console.log(`  ${APPLY ? 'RESTORE' : 'DO ODTWORZENIA'}  ${r.id}  ${name}  (tel: ${r.phone || '—'})`)
      if (!APPLY) continue
      try {
        await prisma.client.create({ data: toData(r) })
        created++
      } catch (e) {
        // Najczęściej: ownerId wskazuje usuniętego Usera → ponów bez ownerId.
        try {
          const d = toData(r); delete d.ownerId
          await prisma.client.create({ data: d })
          created++
          console.log('     (odtworzono bez ownerId — użytkownik nie istnieje)')
        } catch (e2) {
          failed.push({ id: r.id, name, error: e2.message })
          console.error(`     ✗ nie udało się: ${e2.message}`)
        }
      }
    }

    console.log(`\n${APPLY ? `✓ Odtworzono: ${created}` : `DO ODTWORZENIA: ${missing.length} (uruchom z --apply)`}`)
    if (failed.length) console.log(`✗ Niepowodzenia: ${failed.length}`)
    if (!APPLY && missing.length) console.log('To był RAPORT. Aby wykonać: dodaj --apply')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error('Błąd:', e); process.exit(1) })
