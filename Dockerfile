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

# OpenSSL dla Prismy w runtime + tini + Google Chrome (PDF z oferta)
# UWAGA: Debian "chromium" 137+ ma bug crashpad ("--database is required").
# Google Chrome stable nie ma tego problemu — instalujemy go z repo Google.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates tini wget gnupg \
    fonts-liberation fonts-dejavu \
    tesseract-ocr tesseract-ocr-pol poppler-utils \
    libnss3 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libpango-1.0-0 libpangocairo-1.0-0 \
    && wget -qO- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Nieprivileged user dla bezpieczenstwa.
# UWAGA: user MUSI miec katalog home (nie --system bez -m) — Chrome/Chromium
# pada bez $HOME ("Permission denied: /home/nextjs") z bledami crashpad.
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs -m -d /home/nextjs -s /bin/sh nextjs && \
    mkdir -p /home/nextjs/.config /home/nextjs/.local/share/applications \
             /tmp/chrome-crashes /tmp/chrome-user-data && \
    chown -R nextjs:nodejs /home/nextjs /tmp/chrome-crashes /tmp/chrome-user-data

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

# Puppeteer-core (do generowania PDF z oferta)
COPY --from=builder /app/node_modules/puppeteer-core ./node_modules/puppeteer-core

# pdf-parse (do bulk importu kart mieszkań — scripts/import-floorplans.js)
COPY --from=builder /app/node_modules/pdf-parse ./node_modules/pdf-parse
COPY --from=builder /app/node_modules/node-ensure ./node_modules/node-ensure

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
