import { PrismaClient } from '@prisma/client'
import { encryptClientData, encryptKsefConfigData, deepDecrypt } from './crypto'

/**
 * Prisma z przezroczystym szyfrowaniem pól wrażliwych (patrz lib/crypto.ts).
 *
 * - WRITE:
 *   - `client` — szyfruje pesel, nip, idNumber, fatherName, motherName, address
 *   - `ksefConfig` — szyfruje token (dostęp do faktur firmy w KSeF)
 * - READ: `$allModels.$allOperations` przepuszcza KAŻDY wynik przez deepDecrypt,
 *   który odszyfrowuje stringi z prefiksem `enc::v1::` — także w nested includes.
 *   Pominięcie ścieżki odczytu jest niemożliwe, bo wszystko idzie przez Prisma.
 *
 * Idempotentne i bezpieczne dla legacy plaintext (przed migracją) — encrypt nie
 * szyfruje podwójnie, decrypt jest no-op dla wartości bez prefiksu.
 */
function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  return base.$extends({
    query: {
      client: {
        async create({ args, query }) {
          if (args.data) args.data = encryptClientData(args.data as Record<string, unknown>) as typeof args.data
          return deepDecrypt(await query(args))
        },
        async update({ args, query }) {
          if (args.data) args.data = encryptClientData(args.data as Record<string, unknown>) as typeof args.data
          return deepDecrypt(await query(args))
        },
        async upsert({ args, query }) {
          if (args.create) args.create = encryptClientData(args.create as Record<string, unknown>) as typeof args.create
          if (args.update) args.update = encryptClientData(args.update as Record<string, unknown>) as typeof args.update
          return deepDecrypt(await query(args))
        },
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d) => encryptClientData(d as Record<string, unknown>)) as typeof args.data
          } else if (args.data) {
            args.data = encryptClientData(args.data as Record<string, unknown>) as typeof args.data
          }
          return query(args)
        },
        async updateMany({ args, query }) {
          if (args.data) args.data = encryptClientData(args.data as Record<string, unknown>) as typeof args.data
          return query(args)
        },
      },
      ksefConfig: {
        async create({ args, query }) {
          if (args.data) args.data = encryptKsefConfigData(args.data as Record<string, unknown>) as typeof args.data
          return deepDecrypt(await query(args))
        },
        async update({ args, query }) {
          if (args.data) args.data = encryptKsefConfigData(args.data as Record<string, unknown>) as typeof args.data
          return deepDecrypt(await query(args))
        },
        async upsert({ args, query }) {
          if (args.create) args.create = encryptKsefConfigData(args.create as Record<string, unknown>) as typeof args.create
          if (args.update) args.update = encryptKsefConfigData(args.update as Record<string, unknown>) as typeof args.update
          return deepDecrypt(await query(args))
        },
        async updateMany({ args, query }) {
          if (args.data) args.data = encryptKsefConfigData(args.data as Record<string, unknown>) as typeof args.data
          return query(args)
        },
      },
      $allModels: {
        async $allOperations({ args, query }) {
          return deepDecrypt(await query(args))
        },
      },
    },
  })
}

type ExtendedPrisma = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrisma | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
