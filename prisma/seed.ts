/**
 * Seed produkcyjny — tworzy TYLKO konto admina.
 * Lokale, klientów, podsumowania importujemy ze skryptów `scripts/import-*`
 * lub przez UI.
 *
 * Uruchomienie: npm run db:seed
 */
import { config } from 'dotenv'
config()

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@twojafirma.pl'
  const password = process.env.ADMIN_PASSWORD || 'haslo123'

  if (password === 'haslo123' || password === 'zmien-natychmiast-po-pierwszym-logowaniu') {
    console.warn('⚠️  Używasz domyślnego hasła. Zmień ADMIN_PASSWORD w .env i uruchom seed ponownie.')
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password: hashedPassword,
      name: 'Administrator',
    },
  })

  // Moduł Budowa (Etap 0): jedyna aktywna inwestycja. Idempotentne — upsert po slug,
  // update pusty żeby nie nadpisywać danych edytowanych później w UI.
  await prisma.investment.upsert({
    where: { slug: 'nova-staffa' },
    update: {},
    create: {
      name: 'Nova Staffa',
      slug: 'nova-staffa',
      status: 'W_BUDOWIE',
    },
  })

  console.log(`✅ Seed zakończony. Admin: ${email}. Inwestycja: Nova Staffa.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
