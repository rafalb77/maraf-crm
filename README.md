# MARAF CRM

Aplikacja CRM + ERP dla firmy deweloperskiej (sprzedaż mieszkań, kontroling robót budowlanych, mailing).

## Stack
- **Next.js 14** (App Router)
- **Prisma + PostgreSQL**
- **NextAuth** (uwierzytelnianie)
- **Tailwind CSS v4**
- **Tiptap** (edytor WYSIWYG dla mailingu)
- **Nodemailer** (SMTP, integracja z home.pl)

## Moduły
- **CRM** — klienci, lokale, oferty (kalkulator), sprzedaż, serwis, mailing, kalendarz Google
- **Przeroby** — kontroling protokołów przerobowych podwykonawców (obmiar inżyniera vs podsumowanie kierownika)
- **Rysunki** *(beta)* — analiza obmiarów z plików DXF/PDF/DWG

---

## 🚀 Uruchomienie lokalne

### Wymagania
- Node.js 20+
- PostgreSQL 14+ (lokalnie albo cloud — np. Neon)
- Git

### Krok po kroku

```bash
# 1. Sklonuj repo
git clone https://github.com/twoj-user/maraf-crm.git
cd maraf-crm

# 2. Zależności
npm install

# 3. Konfiguracja środowiska
cp .env.example .env
# Edytuj .env — uzupełnij DATABASE_URL, NEXTAUTH_SECRET itd.

# 4. Migracje DB + admin
npx prisma migrate dev --name init
npm run db:seed

# 5. Uruchom dev server
npm run dev
```

Aplikacja: http://localhost:3000  
Login: dane z `ADMIN_EMAIL` / `ADMIN_PASSWORD` w `.env`

---

## 🌐 Deploy na MyDevil.net

### Wymagania w panelu MyDevil
1. Plan **mDevCloud** (Node.js + PostgreSQL w cenie)
2. Domena (np. `crm.maraf.pl`) lub subdomena `*.mydevil.net`
3. Certyfikat SSL Let's Encrypt (klik w panelu)

### Kroki deployu

```bash
# Lokalnie — push do GitHub
git push origin main

# SSH na MyDevil
ssh user@s12.mydevil.net   # twoja nazwa serwera
cd domains/twoja-domena.pl

# Pierwszy deploy
git clone https://github.com/twoj-user/maraf-crm.git
cd maraf-crm
npm ci --production=false
npm run build
npm run db:migrate:deploy   # zastosuj migracje
npm run db:seed              # utwórz admina
```

W panelu MyDevil → **Aplikacje Node.js** → wskaż katalog `~/domains/twoja-domena.pl/maraf-crm`, plik startowy: `node_modules/next/dist/bin/next start`.

### Aktualizacja kodu

```bash
# Skrypt aktualizacji (na serwerze)
cd ~/domains/twoja-domena.pl/maraf-crm
git pull
npm ci --production=false
npm run build
npm run db:migrate:deploy
# Restart aplikacji w panelu MyDevil
```

---

## 📁 Struktura

```
app/
  (app)/              # Strony aplikacji z sidebar
    dashboard/
    clients/
    units/
    oferty/           # Kalkulator ofert
    przeroby/         # Kontroling protokołów
    drawings/         # Analiza rysunków DXF/PDF
  (print)/            # Widoki do druku (bez sidebara)
    oferty/[id]/druk/
  api/                # API routes
components/           # Komponenty React per moduł
lib/
  prisma.ts           # Klient Prisma
  auth.ts             # NextAuth
  mailer.ts           # SMTP wrapper z retry
prisma/
  schema.prisma
  migrations/         # Tworzy się przy pierwszym `migrate dev`
  seed.ts             # Tworzy admina
scripts/
  import-obmiar.js
  import-protokoly.js
  import-podsumowanie.js
public/
  uploads/            # Pliki uploadowane (gitignored)
```

---

## 🔧 Zmienne środowiskowe

Patrz `.env.example` — wszystkie zmienne są tam udokumentowane z komentarzami.

---

## 🛡️ Bezpieczeństwo
- `.env` w `.gitignore` — sekrety nigdy nie wpadają do repo
- Hasła bcrypt
- NextAuth z sesjami JWT
- HTTPS wymagany w produkcji (NEXTAUTH_URL musi być https://)
