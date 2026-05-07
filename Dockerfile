# syntax=docker/dockerfile:1.6

# ============= Stage 1: deps =============
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Prisma wymaga OpenSSL i CA certs
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma

# Instalacja bez postinstall (--ignore-scripts), prisma generate uruchamiamy ręcznie
RUN npm ci --production=false --ignore-scripts --legacy-peer-deps
RUN npx prisma generate

# ============= Stage 2: builder =============
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1
# Wiecej pamieci dla Node podczas `next build` — bez tego Coolify potrafi OOM
# w fazie "Generating static pages" przy wiekszej ilosci stron.
ENV NODE_OPTIONS="--max-old-space-size=4096"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Klient Prismy z deps stage (już wygenerowany)
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma

RUN npm run build

# ============= Stage 3: runner (production) =============
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# OpenSSL dla Prismy w runtime + tini do prawidłowego sygnałowania (graceful shutdown)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Niesetowy user dla bezpieczeństwa
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma — pełny zestaw potrzebny do migracji w runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/package.json ./package.json

# Scripts importowe (xlsx → DB) i ich zależności runtime
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/xlsx ./node_modules/xlsx
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Pliki danych do jednorazowego importu (np. obmiar Maraf — stały).
# Pliki, które się zmieniają (np. Konrad — co miesiąc), wgrywaj
# przez UI / endpoint upload, NIE przez git.
COPY --from=builder /app/data ./data

# Persistent katalog na uploady (montowany przez Coolify volume)
RUN mkdir -p /app/public/uploads/rysunki && \
    chown -R nextjs:nodejs /app/public/uploads

USER nextjs

EXPOSE 3000

# tini = init system w kontenerze (poprawne sygnałowanie SIGTERM/SIGINT)
ENTRYPOINT ["/usr/bin/tini", "--"]

# Migracje przed startem (idempotent), potem start aplikacji
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
