#!/bin/bash
# =============================================================
# Skrypt aktualizacji aplikacji na MyDevil.net
# =============================================================
# Uruchamiaj z katalogu aplikacji po wejściu przez SSH:
#   cd ~/domains/twoja-domena.pl/maraf-crm
#   bash deploy.sh
#
# Robi: git pull → install → build → migracje DB
# Restart aplikacji ZRÓB RĘCZNIE w panelu MyDevil (Aplikacje Node.js).

set -e

echo "📥 Pull z GitHub..."
git pull

echo "📦 Instalacja zależności..."
npm ci --production=false

echo "🔧 Build aplikacji..."
npm run build

echo "🗄️  Migracje bazy danych..."
npm run db:migrate:deploy

echo ""
echo "✅ Deploy zakończony."
echo "👉 Zrestartuj aplikację w panelu MyDevil (Aplikacje Node.js → Restart)."
