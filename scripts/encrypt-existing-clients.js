// Migracja: szyfruje istniejące (plaintext) dane osobowe klientów at-rest.
// Uruchom RAZ po ustawieniu ENCRYPTION_KEY w env (Coolify Terminal):
//   node scripts/encrypt-existing-clients.js
//
// Idempotentny — pola już zaszyfrowane (prefiks enc::v1::) są pomijane, więc
// można uruchomić wielokrotnie bez szkody. Używa BAZOWEGO PrismaClient (bez
// rozszerzenia z lib/prisma.ts), żeby czytać/zapisywać surowe wartości.
//
// Format MUSI być identyczny z lib/crypto.ts: enc::v1::base64(iv[12]|tag[16]|ct), AES-256-GCM.
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')

const ENC_PREFIX = 'enc::v1::'
const FIELDS = ['pesel', 'nip', 'idNumber', 'fatherName', 'motherName', 'address']

function getKey() {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    console.error('BŁĄD: ENCRYPTION_KEY musi być 64 znakami hex (32 bajty).')
    console.error('Wygeneruj: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
    process.exit(1)
  }
  return Buffer.from(raw, 'hex')
}

function isEncrypted(v) {
  return typeof v === 'string' && v.startsWith(ENC_PREFIX)
}

function encryptField(plain, key) {
  if (plain == null || plain === '' || isEncrypted(plain)) return plain
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64')
}

async function main() {
  const key = getKey()
  const prisma = new PrismaClient()
  try {
    const clients = await prisma.client.findMany()
    let updated = 0
    let skipped = 0
    for (const c of clients) {
      const data = {}
      for (const f of FIELDS) {
        const v = c[f]
        if (typeof v === 'string' && v !== '' && !isEncrypted(v)) {
          data[f] = encryptField(v, key)
        }
      }
      if (Object.keys(data).length > 0) {
        await prisma.client.update({ where: { id: c.id }, data })
        updated++
      } else {
        skipped++
      }
    }
    console.log(`✓ Gotowe. Klientów: ${clients.length}, zaszyfrowano: ${updated}, pominięto (już OK / brak danych): ${skipped}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('Błąd migracji:', e)
  process.exit(1)
})
