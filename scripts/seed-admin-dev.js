/**
 * Seed DEV admina bez ts-node (omija problem quotingu w PowerShell).
 * Uruchomienie: node scripts/seed-admin-dev.js
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'admin@maraf.pl').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || 'Admin123!'
  const hashed = await bcrypt.hash(password, 10)
  await prisma.user.upsert({
    where: { email },
    update: { password: hashed },
    create: { email, password: hashed, name: 'Administrator' },
  })
  console.log('✅ Admin gotowy:', email)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
