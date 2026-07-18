# Zmiany responsywności — 2026-07-16 (deploy help)

> ## ✅ SPRAWA ROZWIĄZANA OSTATECZNIE (2026-07-18)
> **Faktyczna przyczyna padających deployów NIE była w kodzie.** W Coolify (Environment
> Variables) istniała uszkodzona zmienna `cron_secret`, której wartością była wklejona
> **instrukcja z dokumentacji** zamiast wygenerowanego sekretu:
> `BUDOWA_CRON_SECRET = <wynik: node -e "...">`. Coolify wstrzykuje każdą zmienną
> środowiskową jako linię `ARG nazwa=wartość` do Dockerfile przy **każdym** buildzie —
> wartość ze spacjami i `<>` rozwalała parser (`dockerfile parse error: ARG names can not
> be blank`) i **każdy deploy padał w ~1 s, zanim build ruszył**, niezależnie od zawartości
> commita. Padły kolejno: responsywność (`5161664`), Finanse (`2f70585`), fix sharp
> (`166f4a9`) i pushe dokumentacji — produkcja stała na `0924175` z 14.07.
> **Naprawa 2026-07-18**: usunięcie `cron_secret` (widoczna dopiero w **Developer view**
> listy zmiennych!) + poprawna zmienna `BUDOWA_CRON_SECRET` (czysty hex). Deploy przeszedł,
> produkcja zweryfikowana (responsywność + logo bez `/_next/image` na żywo).
> **Fałszywe tropy po drodze** (obie hipotezy obalone): konflikt scalania z responsywnością
> (§3/§6 — zostają jako ogólna ściąga) oraz brak sharp (błędy sharp to szum per-obrazek —
> optymalizator i tak serwował 200 fallbackiem; fix `166f4a9` słuszny porządkowo, ale nie
> był blokerem). Morał: **przy „failed" deployu najpierw czytaj log DEPLOYMENTU (build),
> nie log aplikacji** — werdykt jest zawsze na końcu logu builda.

Dokument opisuje **wszystkie** zmiany wprowadzone na urządzeniu „stacjonarnym" w ostatnich 24h i wypchnięte na produkcję. Powstał, bo na **drugim komputerze** zmiany w module Finanse nie chciały przejść przez deploy — pierwotne podejrzenie padło na konflikt z tym commitem (patrz adnotacja wyżej — podejrzenie się nie potwierdziło).

---

## 1. Co dokładnie poszło na produkcję

To **jeden** commit:

| | |
|---|---|
| **hash** | `5161664f9b3fc4b61889f826b743e68f6da10f4c` (`5161664`) |
| **rodzic** | `0924175` (`Finanse: kolejka platnosci - sortowanie po terminie...`) |
| **autor / data** | Rafal MARAF, Thu Jul 16 11:14:16 2026 +0200 |
| **tytuł** | `Responsywnosc: mobile dla CRM (drawer, karty list), tablet dla back-office` |
| **zakres** | **156 plików**, +1246 / −831 linii |

Nic więcej z tego urządzenia nie trafiło na `main`. (Stara wersja tej pracy leży lokalnie na gałęzi `mobile-responsive-wip` — **nie została wypchnięta**, można ją zignorować.)

---

## 2. Charakter zmian — KLUCZOWE dla rozwiązania konfliktu

**Wszystkie zmiany są wyłącznie prezentacyjne (klasy CSS / Tailwind + zawijanie JSX).**
Zweryfikowane maszynowo na całym diffie Finansów: jedyne zmienione „kodowe" linie (`.map(...)`, `const ...`) to **te same wyrażenia przesunięte o 2 spacje wcięcia** — bo tabele zostały owinięte w dodatkowy `<div className="overflow-x-auto">`.

Czego **NIE** ruszaliśmy nigdzie w Finansach:
- ❌ logiki, warunków, obliczeń,
- ❌ zapytań do bazy / Prisma / pobierania danych,
- ❌ importów, propsów, sygnatur funkcji, typów,
- ❌ akcji (`onClick`, `onSubmit`, `href`, server actions),
- ❌ wyglądu na **desktopie** (`lg` ≥ 1024px) — tam efektywne klasy są identyczne jak przed zmianą.

Konsekwencja dla merge'a: **konflikty w Finansach są „kosmetyczne"**. Twoje zmiany logiki z drugiego komputera i nasze zmiany klas **nie kolidują znaczeniowo** — trzeba tylko poprawnie połączyć oba w JEDNYM pliku.

### Wzorce zmian, które zobaczysz w każdym pliku
1. **Padding strony:** `className="p-8"` → `className="p-4 sm:p-6 lg:p-8"`
2. **Nagłówki/paski akcji:** dodane `flex-wrap gap-2` / `gap-3` do `flex ... justify-between`
3. **Tabele:** owinięte w `<div className="overflow-x-auto">` + na `<table>` dodane `min-w-[Xpx] lg:min-w-0` (na desktopie tabela wraca do naturalnej szerokości — jak przed zmianą; poziomy scroll tylko poniżej `lg`)
4. **Siatki formularzy:** `grid-cols-2` → `grid-cols-1 md:grid-cols-2` (analogicznie 3/4 kolumny)
5. **Spany w siatkach:** `col-span-2` → `md:col-span-2` (żeby na mobile pole nie wymuszało 2 kolumn)

---

## 3. ⚠️ Najbardziej prawdopodobna przyczyna, że deploy pada

Deploy = build Next.js. Nasze zmiany budują się poprawnie (zweryfikowane: `next build`, 121 stron, zielone). Jeśli u Ciebie build pada, to **efekt złego scalenia**, nie samego kodu. Trzy typowe przyczyny — sprawdź po kolei:

**A) Pozostawione znaczniki konfliktu.** Po nieudanym merge w plikach zostają `<<<<<<<`, `=======`, `>>>>>>>`. Build od razu pada. Szukaj:
```bash
git grep -nE '^(<<<<<<<|=======|>>>>>>>)'
```

**B) Niezbalansowane tagi JSX po scaleniu tabeli.** Nasza zmiana dokłada wokół tabel `<div className="overflow-x-auto"> ... </div>` (dodatkowy `<div>` + `</div>`). Przy ręcznym rozwiązywaniu konfliktu łatwo zostawić `<div>` bez pary `</div>` (albo odwrotnie) → błąd „Unexpected token / JSX". Po scaleniu każdego pliku Finansów sprawdź, że **każdy dodany `overflow-x-auto` ma domykający `</div>`**.

**C) Brak nowego pliku `components/layout/MobileNavContext.tsx`.** To **nowy** plik (patrz §5). `AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx` go importują (`import { useMobileNav } from './MobileNavContext'`). Jeśli merge nie przeniósł tego pliku, build pada na nieistniejącym imporcie. Sprawdź:
```bash
ls components/layout/MobileNavContext.tsx   # musi istnieć
```

---

## 4. Moduł FINANSE — 33 zmienione pliki (co w każdym)

**Strony (`app/(app)/finanse/`):**

| Plik | Co zmienione (wyłącznie prezentacja) |
|---|---|
| `faktury/[id]/page.tsx` | padding; nagłówek `flex-wrap`; tabela płatności → `overflow-x-auto` + `min-w-[760px] lg:min-w-0`; wiersz akceptacji `flex-wrap` |
| `faktury/page.tsx` | padding; nagłówek + przyciski `flex-wrap`; paginacja `flex-wrap` |
| `finansowanie/page.tsx` | tylko padding (placeholder dla Maraf) |
| `import/page.tsx` | tylko padding |
| `kaucje/page.tsx` | padding; **2 tabele** → `overflow-x-auto` + `min-w-[680px]/[620px] lg:min-w-0` |
| `kolejka-platnosci/page.tsx` | padding; banery i nagłówki sekcji `flex-wrap`; lista-grid → `overflow-x-auto` + `min-w-[680px]` na wierszach |
| `kontrahenci/[id]/page.tsx` | tylko padding |
| `kontrahenci/page.tsx` | padding; tabela → `overflow-x-auto` + `min-w-[900px] lg:min-w-0` |
| `ksef/page.tsx` | padding (×2) |
| `layout.tsx` | pasek `CompanySwitcher` (sticky): `px-8` → `px-4 sm:px-6 lg:px-8` + `flex-wrap gap-3`. **Uwaga:** `sticky top-0 z-20` bez zmian |
| `nowa/page.tsx` | tylko padding |
| `page.tsx` (pulpit) | padding; kafel kaucji `flex-wrap` |
| `podatki/page.tsx` | padding; komponent `Line` `flex-wrap` |
| `powiernicze/page.tsx` | tylko padding (×2) |
| `przychody/[id]/page.tsx` | padding; nagłówek `flex-wrap`; tabela płatności → `overflow-x-auto` + `min-w-[520px] lg:min-w-0` |
| `przychody/nowa/page.tsx` | tylko padding |
| `przychody/page.tsx` | padding; nagłówek `flex-wrap`; tabela `min-w-[1080px] lg:min-w-0` (wrapper `overflow-x-auto` już był) |
| `statystyki/page.tsx` | tylko padding |

**Komponenty (`components/finanse/`):**

| Plik | Co zmienione |
|---|---|
| `AddPaymentForm.tsx` | `grid-cols-2` → `grid-cols-1 md:grid-cols-2`; `col-span-2` → `md:col-span-2` |
| `AddSalesPaymentForm.tsx` | `grid-cols-3` → `grid-cols-1 md:grid-cols-3` |
| `CreateCostButton.tsx` | baner `flex-wrap gap-2` |
| `EditInvoiceForm.tsx` | `grid-cols-2` → `grid-cols-1 md:grid-cols-2`; `grid-cols-4` → `grid-cols-2 md:grid-cols-4` |
| `ImportFinanseForm.tsx` | siatka statystyk `grid-cols-2 md:grid-cols-4`; **2 tabele** → `overflow-x-auto` + `min-w-[420px]/[640px] lg:min-w-0` (największy diff, ale nadal tylko struktura) |
| `KsefConfigCard.tsx` | `grid-cols-2` → `grid-cols-1 md:grid-cols-2` |
| `KsefInvoiceDetails.tsx` | tabela → `overflow-x-auto` + `min-w-[860px] lg:min-w-0` |
| `NewInvoiceForm.tsx` | siatki pól → stackowanie na mobile |
| `NewSalesInvoiceForm.tsx` | siatki pól → stackowanie na mobile |
| `VendorTermsCell.tsx` | szerokość karty `min-w-[430px]` → `sm:min-w-[430px]` (pełna szerokość na mobile) |
| `finansowanie/FinansowanieView.tsx` | padding/siatki stackują; tabele → `overflow-x-auto` + `min-w-[720px] lg:min-w-0` |
| `powiernicze/DopasowaniePanel.tsx` | tabela → `overflow-x-auto` + `min-w-[760px] lg:min-w-0` |
| `powiernicze/ImportWyciaguForm.tsx` | tabela → `overflow-x-auto` + `min-w-[640px] lg:min-w-0` |
| `powiernicze/RejestrOdsetek.tsx` | tabela → `overflow-x-auto` + `min-w-[860px] lg:min-w-0` |
| `powiernicze/RejestrWplat.tsx` | tabela → `overflow-x-auto` + `min-w-[820px] lg:min-w-0` |

Pełne diffy tych plików — **§8 (załącznik)**.

---

## 5. Szkielet layoutu — 4 pliki (druga możliwa strefa konfliktu)

Jeśli na drugim komputerze ktoś dotykał layoutu/sidebara — tu też będą konflikty.

| Plik | Zmiana |
|---|---|
| `components/layout/MobileNavContext.tsx` | **NOWY PLIK** — kontekst stanu drawera (`open`/`setOpen`). Musi istnieć, bo importują go 3 pliki niżej |
| `components/layout/AppShell.tsx` | dodany drawer mobilny + `MobileNavProvider` + backdrop; margines treści `ml-0 lg:ml-[var(--sb-w)]`; `h-screen` → `h-dvh`; `effectiveCollapsed = isDesktop && collapsed` (zwijanie do 80px tylko na desktopie) |
| `components/layout/Sidebar.tsx` | `aside` dostaje transform drawera (`-translate-x-full lg:translate-x-0`, `z-40 lg:z-30`); przełącznik „Zwiń panel" ukryty na mobile (`hidden lg:flex`) |
| `components/layout/TopBar.tsx` | dodany hamburger (`lg:hidden`) otwierający drawer |

Pełny diff — **§8 (załącznik)**.

---

## 6. Jak rozwiązać konflikt na drugim komputerze (krok po kroku)

> **Nie rób `git push --force`** — skasowałoby to responsywność z produkcji.

Zakładam: na drugim komputerze masz lokalne, niezacommitowane zmiany w Finansach, oparte o `0924175`, a `origin/main` jest już na `5161664`.

```bash
# 0. Backup na wszelki wypadek
git stash list            # zobacz co masz; albo zacommituj lokalnie:
git add -A && git commit -m "WIP finanse (drugi komputer)"

# 1. Pobierz nasz commit
git fetch origin

# 2. Scal (albo rebase — jak wolisz)
git merge origin/main
#   -> git zgłosi konflikty w plikach Finansów, które oba tknęliśmy

# 3. Rozwiąż KAŻDY konflikt. Zasada: nasze zmiany to TYLKO klasy CSS
#    i owinięcie tabel w <div className="overflow-x-auto">. Zachowaj SWOJĄ logikę,
#    a na wierzch nałóż nasze klasy responsywne (padding, flex-wrap, overflow+min-w).

# 4. Po rozwiązaniu — sanity check:
git grep -nE '^(<<<<<<<|=======|>>>>>>>)'   # musi być PUSTO (żadnych markerów)
ls components/layout/MobileNavContext.tsx    # musi istnieć
npx tsc --noEmit                             # typy OK
npm run build                                # build MUSI przejść lokalnie

# 5. Dopiero gdy build zielony:
git push origin main
```

**Alternatywa (gdy Twoje zmiany w Finansach są małe):** najprościej odłożyć je i nałożyć na czysto:
```bash
git stash          # odłóż swoje zmiany
git pull            # fast-forward do 5161664 (nasza responsywność)
git stash pop       # przywróć swoje; rozwiąż drobne konflikty
npm run build       # zielone? -> push
```

Jeśli utknie któryś konkretny plik — wklej mi jego zawartość z markerami konfliktu (`<<<<<<<` … `>>>>>>>`), rozpiszę gotowe rozwiązanie.

---

## 7. Pełna lista 156 zmienionych plików (wg modułu)

**Layout / szkielet (4):** `components/layout/{AppShell,MobileNavContext(NOWY),Sidebar,TopBar}.tsx`

**Finanse (33):** patrz §4.

**CRM — Klienci (7):** `app/(app)/clients/{page,[id]/page,[id]/edit/page,new/page,import/page}.tsx`, `components/clients/{ClientsTable,ClientFilters,ClientForm,ClientOwnerChanger,AssignUnitModal,DeleteClientButton,PromoteReservationButton,ClientsImporter}.tsx`

**CRM — Lokale (8):** `app/(app)/units/{page,[id]/page,[id]/edit/page,[id]/creative/page,new/page,import/page}.tsx`, `components/units/{UnitsTable,UnitFilters,UnitForm,AdCreativeStudio,UnitImageGallery,ReserveForClientModal,UnitsImporter,DeleteUnitButton}.tsx`

**CRM — Rezerwacje (3):** `app/(app)/rezerwacje/page.tsx`, `components/reservations/{ReservationActions,NewReservationModal}.tsx`

**CRM — Oferty (7):** `app/(app)/oferty/{page,[id]/page,[id]/edytuj/page,nowa/page}.tsx`, `components/oferty/{OffersTable,OfferCalculator,OfferActions}.tsx`

**CRM — Sprzedaż (12):** `app/(app)/sales/{page,[id]/page,[id]/preview/page,new/page,import/page,link-units/page}.tsx`, `components/sales/{SalesTable,ContractForm,ContractPaymentsPanel,ContractStageStepper,ContractUnitsEditor,ContractAttachments,ContractEmailButton,ContractsImporter,MarkSignedButton}.tsx`

**CRM — Serwis (5):** `app/(app)/service/{page,[id]/page,new/page}.tsx`, `components/service/{ServiceForm,ServiceStatusChanger}.tsx`

**CRM — Sprawy (7):** `app/(app)/cases/{page,[id]/page,new/page}.tsx`, `components/cases/{CaseForm,CaseEntryForm,CaseDocuments,DeleteCaseButton,DeleteEntryButton}.tsx`

**CRM — reszta (7):** `app/(app)/{calendar,mailing,dashboard,profil,statystyki}/page.tsx`, `components/calendar/CalendarView.tsx`, `components/mailing/MailComposer.tsx`, `components/dashboard/{TopWidget,TaskWidget}.tsx`, `components/profil/ProfileForm.tsx`

**Auth (3):** `app/auth/{signin,forgot-password,reset-password/[token]}/page.tsx`

**Przeroby (13):** `app/(app)/przeroby/**` (obmiar, porownanie, podwykonawcy, protokoly), `components/przeroby/{ComparisonTable,MarafObmiarPanel,ObmiarTree,ProtocolGenerator,PrzedmiarKonradUploader,SubcontractorActions}.tsx`

**Budowa (8):** `app/(app)/budowa/{page,dziennik,harmonogram,harmonogram/import,koszty,ryzyka,wykonawcy}/page.tsx`, `components/budowa/{GanttLazy,HarmonogramImport,HarmonogramView,KosztyTable,RyzykaView,VendorBridge}.tsx`

**Settings / diagnostyka (5):** `app/(app)/settings/{page,dane-gov,audit-log}/page.tsx`, `app/(app)/diagnostyka/page.tsx`, `components/settings/{SettingsForm,UsersSection,DaneGovPanel}.tsx`

**Docs (2):** `docs/changelog.md`, `docs/architektura.md`

---

## 8. Załącznik — pełne diffy (do scalania)

Poniżej dokładne diffy `0924175 → 5161664` dla **Finansów** i **szkieletu layoutu**. To materiał źródłowy do ręcznego rozwiązywania konfliktów.

### 8a. Diff — moduł Finanse (33 pliki)

```diff
diff --git a/app/(app)/finanse/faktury/[id]/page.tsx b/app/(app)/finanse/faktury/[id]/page.tsx
index 06bc608..a2476b1 100644
--- a/app/(app)/finanse/faktury/[id]/page.tsx
+++ b/app/(app)/finanse/faktury/[id]/page.tsx
@@ -82,10 +82,10 @@ export default async function InvoiceDetailsPage({ params }: { params: { id: str
   const ksef = (inv.ksefData as unknown as KsefInvoiceData | null) || null
 
   return (
-    <div className="p-8 max-w-5xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
       <div className="mb-6">
         <Link href="/finanse/faktury" className="text-sm text-gray-500 hover:text-gray-700">← Wszystkie faktury</Link>
-        <div className="flex items-start justify-between mt-2 gap-4">
+        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
           <div>
             {/* Gdy jest podkontrahent (Janpol/PATRIMEX pod STAFFA) — to ON jest
                 glownym, czytelnym tytulem; parasol (STAFFA) maly nad nim. */}
@@ -238,32 +238,34 @@ export default async function InvoiceDetailsPage({ params }: { params: { id: str
 
         {inv.payments.length > 0 && (
           <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
-            <table className="w-full text-sm">
-              <thead className="bg-gray-50 border-b border-gray-200 text-left">
-                <tr>
-                  <th className="px-4 py-2 font-medium text-gray-700">Data</th>
-                  <th className="px-4 py-2 font-medium text-gray-700 text-right">Kwota</th>
-                  <th className="px-4 py-2 font-medium text-gray-700">Bank</th>
-                  <th className="px-4 py-2 font-medium text-gray-700">Tytuł</th>
-                  <th className="px-4 py-2 font-medium text-gray-700">Notatka</th>
-                  <th className="px-4 py-2"></th>
-                </tr>
-              </thead>
-              <tbody className="divide-y divide-gray-100">
-                {inv.payments.map((p) => (
-                  <tr key={p.id}>
-                    <td className="px-4 py-2 text-gray-700 tabular-nums">{fmtDate(p.paidAt)}</td>
-                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(p.amount)}</td>
-                    <td className="px-4 py-2 text-gray-600">{p.bankAccount || '—'}</td>
-                    <td className="px-4 py-2 text-gray-600 text-xs">{p.reference || '—'}</td>
-                    <td className="px-4 py-2 text-gray-500 text-xs">{p.notes || '—'}</td>
-                    <td className="px-4 py-2 text-right">
-                      <DeletePaymentButton invoiceId={inv.id} paymentId={p.id} />
-                    </td>
+            <div className="overflow-x-auto">
+              <table className="w-full text-sm min-w-[760px] lg:min-w-0">
+                <thead className="bg-gray-50 border-b border-gray-200 text-left">
+                  <tr>
+                    <th className="px-4 py-2 font-medium text-gray-700">Data</th>
+                    <th className="px-4 py-2 font-medium text-gray-700 text-right">Kwota</th>
+                    <th className="px-4 py-2 font-medium text-gray-700">Bank</th>
+                    <th className="px-4 py-2 font-medium text-gray-700">Tytuł</th>
+                    <th className="px-4 py-2 font-medium text-gray-700">Notatka</th>
+                    <th className="px-4 py-2"></th>
                   </tr>
-                ))}
-              </tbody>
-            </table>
+                </thead>
+                <tbody className="divide-y divide-gray-100">
+                  {inv.payments.map((p) => (
+                    <tr key={p.id}>
+                      <td className="px-4 py-2 text-gray-700 tabular-nums">{fmtDate(p.paidAt)}</td>
+                      <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(p.amount)}</td>
+                      <td className="px-4 py-2 text-gray-600">{p.bankAccount || '—'}</td>
+                      <td className="px-4 py-2 text-gray-600 text-xs">{p.reference || '—'}</td>
+                      <td className="px-4 py-2 text-gray-500 text-xs">{p.notes || '—'}</td>
+                      <td className="px-4 py-2 text-right">
+                        <DeletePaymentButton invoiceId={inv.id} paymentId={p.id} />
+                      </td>
+                    </tr>
+                  ))}
+                </tbody>
+              </table>
+            </div>
           </div>
         )}
 
@@ -282,7 +284,7 @@ export default async function InvoiceDetailsPage({ params }: { params: { id: str
           <ol className="space-y-2">
             {inv.approvals.map((a) => (
               <li key={a.id} className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
-                <div className="flex items-baseline justify-between">
+                <div className="flex items-baseline justify-between flex-wrap gap-x-3">
                   <div>
                     <span className="font-medium text-gray-900">{INVOICE_APPROVAL_ACTION_LABELS[a.action] || a.action}</span>
                     {a.userEmail && <span className="text-gray-500 ml-2">— {a.userEmail}</span>}
diff --git a/app/(app)/finanse/faktury/page.tsx b/app/(app)/finanse/faktury/page.tsx
index 0b279ac..758c4ee 100644
--- a/app/(app)/finanse/faktury/page.tsx
+++ b/app/(app)/finanse/faktury/page.tsx
@@ -194,8 +194,8 @@ export default async function FakturyListPage({
   })
 
   return (
-    <div className="p-8">
-      <div className="flex items-center justify-between mb-6">
+    <div className="p-4 sm:p-6 lg:p-8">
+      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
         <div>
           <h1 className="text-2xl font-bold text-gray-900">Faktury zakupowe</h1>
           <p className="text-gray-500 text-sm mt-1">
@@ -203,7 +203,7 @@ export default async function FakturyListPage({
             {hasFilters && ' (po filtrach)'}
           </p>
         </div>
-        <div className="flex gap-2">
+        <div className="flex gap-2 flex-wrap">
           <Link
             href="/finanse/import"
             className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
@@ -298,7 +298,7 @@ export default async function FakturyListPage({
 
       {/* Komponent zakładki folderu — server */}
       {totalPages > 1 && (
-        <div className="mt-4 flex items-center justify-between text-sm">
+        <div className="mt-4 flex items-center justify-between text-sm flex-wrap gap-2">
           <p className="text-gray-500">Strona {page} z {totalPages} • {total} faktur</p>
           <div className="flex gap-2">
             {page > 1 && (
diff --git a/app/(app)/finanse/finansowanie/page.tsx b/app/(app)/finanse/finansowanie/page.tsx
index 7b1e829..62cba1f 100644
--- a/app/(app)/finanse/finansowanie/page.tsx
+++ b/app/(app)/finanse/finansowanie/page.tsx
@@ -9,7 +9,7 @@ export default async function FinansowaniePage() {
   // Dla Maraf pokazujemy placeholder.
   if (company !== 'MARAF_DEVELOPMENT') {
     return (
-      <div className="p-8 max-w-3xl">
+      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
         <div className="mb-6">
           <h1 className="text-2xl font-bold text-gray-900">Finansowanie inwestycji</h1>
           <p className="text-gray-500 text-sm mt-1">Kredyty, rachunki powiernicze, zwroty VAT</p>
diff --git a/app/(app)/finanse/import/page.tsx b/app/(app)/finanse/import/page.tsx
index fce8b57..bf40952 100644
--- a/app/(app)/finanse/import/page.tsx
+++ b/app/(app)/finanse/import/page.tsx
@@ -2,7 +2,7 @@ import { ImportFinanseForm } from '@/components/finanse/ImportFinanseForm'
 
 export default function ImportFinansePage() {
   return (
-    <div className="p-8 max-w-4xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Import faktur z xlsx</h1>
         <p className="text-gray-500 text-sm mt-1">
diff --git a/app/(app)/finanse/kaucje/page.tsx b/app/(app)/finanse/kaucje/page.tsx
index 54fc95e..0c2bec1 100644
--- a/app/(app)/finanse/kaucje/page.tsx
+++ b/app/(app)/finanse/kaucje/page.tsx
@@ -23,7 +23,7 @@ export default async function KaucjePage() {
   const overdue = active.filter((i) => i.depositReturnDate && new Date(i.depositReturnDate) < today)
 
   return (
-    <div className="p-8 max-w-5xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Kaucje gwarancyjne</h1>
         <p className="text-gray-500 text-sm mt-1">
@@ -43,43 +43,45 @@ export default async function KaucjePage() {
           <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
             Zatrzymane (do zwrotu)
           </div>
-          <table className="w-full text-sm">
-            <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
-              <tr>
-                <th className="px-4 py-2">Kontrahent</th>
-                <th className="px-4 py-2">Nr FV</th>
-                <th className="px-4 py-2 text-right">Kwota kaucji</th>
-                <th className="px-4 py-2">Termin zwrotu</th>
-                <th className="px-4 py-2"></th>
-              </tr>
-            </thead>
-            <tbody className="divide-y divide-gray-100">
-              {active.map((inv) => {
-                const isOverdue = inv.depositReturnDate && new Date(inv.depositReturnDate) < today
-                return (
-                  <tr key={inv.id} className="hover:bg-gray-50">
-                    <td className="px-4 py-2.5">
-                      <div className="font-medium text-gray-900">{inv.subVendor || inv.vendor.name}</div>
-                      {inv.subVendor && <div className="text-xs text-gray-400">{inv.vendor.name}</div>}
-                    </td>
-                    <td className="px-4 py-2.5">
-                      <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
-                    </td>
-                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
-                      {fmtMoney(inv.deposit)}
-                      {inv.depositPct ? <span className="text-xs text-gray-400 ml-1">({inv.depositPct}%)</span> : null}
-                    </td>
-                    <td className={`px-4 py-2.5 tabular-nums ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
-                      {fmtDate(inv.depositReturnDate)}{isOverdue && ' ⚠'}
-                    </td>
-                    <td className="px-4 py-2.5 text-right">
-                      <MarkDepositReturnedButton invoiceId={inv.id} />
-                    </td>
-                  </tr>
-                )
-              })}
-            </tbody>
-          </table>
+          <div className="overflow-x-auto">
+            <table className="w-full text-sm min-w-[680px] lg:min-w-0">
+              <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
+                <tr>
+                  <th className="px-4 py-2">Kontrahent</th>
+                  <th className="px-4 py-2">Nr FV</th>
+                  <th className="px-4 py-2 text-right">Kwota kaucji</th>
+                  <th className="px-4 py-2">Termin zwrotu</th>
+                  <th className="px-4 py-2"></th>
+                </tr>
+              </thead>
+              <tbody className="divide-y divide-gray-100">
+                {active.map((inv) => {
+                  const isOverdue = inv.depositReturnDate && new Date(inv.depositReturnDate) < today
+                  return (
+                    <tr key={inv.id} className="hover:bg-gray-50">
+                      <td className="px-4 py-2.5">
+                        <div className="font-medium text-gray-900">{inv.subVendor || inv.vendor.name}</div>
+                        {inv.subVendor && <div className="text-xs text-gray-400">{inv.vendor.name}</div>}
+                      </td>
+                      <td className="px-4 py-2.5">
+                        <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
+                      </td>
+                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
+                        {fmtMoney(inv.deposit)}
+                        {inv.depositPct ? <span className="text-xs text-gray-400 ml-1">({inv.depositPct}%)</span> : null}
+                      </td>
+                      <td className={`px-4 py-2.5 tabular-nums ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
+                        {fmtDate(inv.depositReturnDate)}{isOverdue && ' ⚠'}
+                      </td>
+                      <td className="px-4 py-2.5 text-right">
+                        <MarkDepositReturnedButton invoiceId={inv.id} />
+                      </td>
+                    </tr>
+                  )
+                })}
+              </tbody>
+            </table>
+          </div>
         </div>
       )}
 
@@ -88,20 +90,22 @@ export default async function KaucjePage() {
           <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
             Zwrócone ({returned.length})
           </div>
-          <table className="w-full text-sm">
-            <tbody className="divide-y divide-gray-100">
-              {returned.map((inv) => (
-                <tr key={inv.id} className="text-gray-500">
-                  <td className="px-4 py-2.5">{inv.subVendor || inv.vendor.name}</td>
-                  <td className="px-4 py-2.5">
-                    <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
-                  </td>
-                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(inv.deposit)}</td>
-                  <td className="px-4 py-2.5 text-green-700 text-xs">✓ zwrócona {fmtDate(inv.depositReturnedAt)}</td>
-                </tr>
-              ))}
-            </tbody>
-          </table>
+          <div className="overflow-x-auto">
+            <table className="w-full text-sm min-w-[620px] lg:min-w-0">
+              <tbody className="divide-y divide-gray-100">
+                {returned.map((inv) => (
+                  <tr key={inv.id} className="text-gray-500">
+                    <td className="px-4 py-2.5">{inv.subVendor || inv.vendor.name}</td>
+                    <td className="px-4 py-2.5">
+                      <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
+                    </td>
+                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(inv.deposit)}</td>
+                    <td className="px-4 py-2.5 text-green-700 text-xs">✓ zwrócona {fmtDate(inv.depositReturnedAt)}</td>
+                  </tr>
+                ))}
+              </tbody>
+            </table>
+          </div>
         </div>
       )}
     </div>
diff --git a/app/(app)/finanse/kolejka-platnosci/page.tsx b/app/(app)/finanse/kolejka-platnosci/page.tsx
index 665252f..03c0d24 100644
--- a/app/(app)/finanse/kolejka-platnosci/page.tsx
+++ b/app/(app)/finanse/kolejka-platnosci/page.tsx
@@ -207,7 +207,7 @@ export default async function KolejkaPlatnosciPage({ searchParams }: { searchPar
   }
 
   return (
-    <div className="p-8 max-w-6xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
       <div className="mb-4">
         <h1 className="text-2xl font-bold text-gray-900">Kolejka płatności</h1>
         <p className="text-gray-500 text-sm mt-1">
@@ -262,7 +262,7 @@ export default async function KolejkaPlatnosciPage({ searchParams }: { searchPar
 
       {/* Baner zaległości */}
       {overdueRows.length > 0 && !overdueOnly && (
-        <Link href={`/finanse/kolejka-platnosci${qs({ overdue: '1' })}`} className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 hover:bg-red-100 transition-colors">
+        <Link href={`/finanse/kolejka-platnosci${qs({ overdue: '1' })}`} className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 hover:bg-red-100 transition-colors flex-wrap">
           <span className="text-sm text-red-700 font-medium">⚠ {overdueRows.length} {overdueRows.length === 1 ? 'faktura' : 'faktur'} po terminie — łącznie {fmtMoney(overdueSum)}</span>
           <span className="text-sm text-red-700">Pokaż tylko po terminie →</span>
         </Link>
@@ -285,7 +285,7 @@ export default async function KolejkaPlatnosciPage({ searchParams }: { searchPar
                 <div className="mt-5 pt-5 border-t border-gray-100 max-w-lg mx-auto space-y-2">
                   <p className="text-sm text-gray-600">Niezapłacone faktury tej firmy są tutaj:</p>
                   {emptyHints.map((h) => (
-                    <Link key={h.href} href={h.href} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm">
+                    <Link key={h.href} href={h.href} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm flex-wrap">
                       <span className="text-gray-700">{h.label}</span>
                       <span className="tabular-nums font-medium text-gray-900 whitespace-nowrap">{fmtMoney(h.sum)} →</span>
                     </Link>
@@ -306,7 +306,7 @@ export default async function KolejkaPlatnosciPage({ searchParams }: { searchPar
           <div key={sec.key} className="v2-card-in">
             {sec.label && (
               <div
-                className={`flex items-baseline justify-between gap-3 border rounded-t-xl px-4 py-2.5 ${sec.tone === 'red' ? 'bg-red-50' : ''}`}
+                className={`flex items-baseline justify-between gap-3 border rounded-t-xl px-4 py-2.5 flex-wrap ${sec.tone === 'red' ? 'bg-red-50' : ''}`}
                 style={sec.tone === 'red' ? { borderColor: '#fecaca' } : { background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
               >
                 <span className={`font-semibold ${sec.tone === 'red' ? 'text-red-700' : 'text-gray-900'}`}>
@@ -321,35 +321,39 @@ export default async function KolejkaPlatnosciPage({ searchParams }: { searchPar
               className={`bg-white border rounded-b-xl overflow-hidden ${sec.label ? 'border-t-0' : 'rounded-t-xl'}`}
               style={{ borderColor: 'var(--border)' }}
             >
-              {sec.rows.map((inv, idx) => {
-                const rem = remaining(inv)
-                const sumPaid = inv.amountGross - rem
-                const overdue = isOverdue(inv.dueDate, inv.status)
-                return (
-                  <div
-                    key={inv.id}
-                    className={`grid grid-cols-[1fr_auto_auto_auto] gap-5 items-center px-4 py-2.5 hover:bg-gray-50 transition-colors ${idx > 0 ? 'border-t' : ''} ${overdue ? 'border-l-2 border-l-red-500' : ''}`}
-                    style={idx > 0 ? { borderColor: 'var(--border-soft)' } : undefined}
-                  >
-                    <span className="min-w-0">
-                      {inv.subVendor && <span className="font-medium text-gray-900 mr-2">{inv.subVendor}</span>}
-                      {!inv.subVendor && group !== 'vendor' && <span className="text-gray-500 mr-2">{inv.vendor.name}</span>}
-                      <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
-                    </span>
-                    <span className={`tabular-nums text-sm whitespace-nowrap text-right ${overdue ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
-                      <span className="block">termin: {fmtDate(inv.dueDate)}{overdue && ' ⚠'}</span>
-                      {inv.dueDate && <span className={`block text-[11px] ${overdue ? 'text-red-500' : 'text-gray-400'}`}>{fmtDaysFromNow(inv.dueDate)}</span>}
-                    </span>
-                    <span className="text-right tabular-nums">
-                      {sumPaid > 0.01 && <span className="block text-xs text-gray-400">zapł. {fmtMoney(sumPaid)}</span>}
-                      <span className="block font-semibold text-gray-900">{fmtMoney(rem)}</span>
-                    </span>
-                    <Link href={`/finanse/faktury/${inv.id}`} className="text-xs text-blue-600 font-medium whitespace-nowrap px-2 py-1.5 rounded-md">
-                      Oznacz opłacone →
-                    </Link>
-                  </div>
-                )
-              })}
+              {/* Wiersz to CSS grid (nie tabela) — na wąskich ekranach zamiast
+                  zgniatania kolumn wymuszamy min-w i przewijamy poziomo. */}
+              <div className="overflow-x-auto">
+                {sec.rows.map((inv, idx) => {
+                  const rem = remaining(inv)
+                  const sumPaid = inv.amountGross - rem
+                  const overdue = isOverdue(inv.dueDate, inv.status)
+                  return (
+                    <div
+                      key={inv.id}
+                      className={`grid grid-cols-[1fr_auto_auto_auto] gap-5 items-center px-4 py-2.5 min-w-[680px] hover:bg-gray-50 transition-colors ${idx > 0 ? 'border-t' : ''} ${overdue ? 'border-l-2 border-l-red-500' : ''}`}
+                      style={idx > 0 ? { borderColor: 'var(--border-soft)' } : undefined}
+                    >
+                      <span className="min-w-0">
+                        {inv.subVendor && <span className="font-medium text-gray-900 mr-2">{inv.subVendor}</span>}
+                        {!inv.subVendor && group !== 'vendor' && <span className="text-gray-500 mr-2">{inv.vendor.name}</span>}
+                        <Link href={`/finanse/faktury/${inv.id}`} className="text-blue-600 hover:underline font-mono text-xs">{inv.number}</Link>
+                      </span>
+                      <span className={`tabular-nums text-sm whitespace-nowrap text-right ${overdue ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
+                        <span className="block">termin: {fmtDate(inv.dueDate)}{overdue && ' ⚠'}</span>
+                        {inv.dueDate && <span className={`block text-[11px] ${overdue ? 'text-red-500' : 'text-gray-400'}`}>{fmtDaysFromNow(inv.dueDate)}</span>}
+                      </span>
+                      <span className="text-right tabular-nums">
+                        {sumPaid > 0.01 && <span className="block text-xs text-gray-400">zapł. {fmtMoney(sumPaid)}</span>}
+                        <span className="block font-semibold text-gray-900">{fmtMoney(rem)}</span>
+                      </span>
+                      <Link href={`/finanse/faktury/${inv.id}`} className="text-xs text-blue-600 font-medium whitespace-nowrap px-2 py-1.5 rounded-md">
+                        Oznacz opłacone →
+                      </Link>
+                    </div>
+                  )
+                })}
+              </div>
             </div>
           </div>
         ))}
diff --git a/app/(app)/finanse/kontrahenci/[id]/page.tsx b/app/(app)/finanse/kontrahenci/[id]/page.tsx
index 7c75278..26cf75e 100644
--- a/app/(app)/finanse/kontrahenci/[id]/page.tsx
+++ b/app/(app)/finanse/kontrahenci/[id]/page.tsx
@@ -113,7 +113,7 @@ export default async function KontrahentPage({ params }: { params: { id: string
   const maxMonth = Math.max(1, ...months.map((m) => m.sum))
 
   return (
-    <div className="p-8 max-w-5xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
       <div className="mb-6">
         <Link href="/finanse/kontrahenci" className="text-sm text-gray-500 hover:text-gray-700">← Wszyscy kontrahenci</Link>
         <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
diff --git a/app/(app)/finanse/kontrahenci/page.tsx b/app/(app)/finanse/kontrahenci/page.tsx
index 7195e98..92684f6 100644
--- a/app/(app)/finanse/kontrahenci/page.tsx
+++ b/app/(app)/finanse/kontrahenci/page.tsx
@@ -103,7 +103,7 @@ export default async function KontrahenciPage({ searchParams }: { searchParams:
   }
 
   return (
-    <div className="p-8">
+    <div className="p-4 sm:p-6 lg:p-8">
       <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
         <div>
           <h1 className="text-2xl font-bold text-gray-900">Kontrahenci</h1>
@@ -132,7 +132,8 @@ export default async function KontrahenciPage({ searchParams }: { searchParams:
       </div>
 
       <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
-        <table className="w-full text-sm">
+        <div className="overflow-x-auto">
+        <table className="w-full text-sm min-w-[900px] lg:min-w-0">
           <thead className="bg-gray-50 border-b border-gray-200 text-left">
             <tr>
               <SortTh label="Nazwa" colKey="name" sort={sort} qs={qs} />
@@ -196,6 +197,7 @@ export default async function KontrahenciPage({ searchParams }: { searchParams:
             ))}
           </tbody>
         </table>
+        </div>
       </div>
 
       <p className="text-xs text-gray-400 mt-4">
diff --git a/app/(app)/finanse/ksef/page.tsx b/app/(app)/finanse/ksef/page.tsx
index be0604a..0587c09 100644
--- a/app/(app)/finanse/ksef/page.tsx
+++ b/app/(app)/finanse/ksef/page.tsx
@@ -10,7 +10,7 @@ export default async function KsefPage() {
   const session = await getServerSession(authOptions)
   if (!isAdmin(session?.user?.email)) {
     return (
-      <div className="p-8">
+      <div className="p-4 sm:p-6 lg:p-8">
         <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-900">
           Konfiguracja KSeF dostępna tylko dla administratora.
         </div>
@@ -39,7 +39,7 @@ export default async function KsefPage() {
   }
 
   return (
-    <div className="p-8 max-w-4xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Konfiguracja KSeF</h1>
         <p className="text-gray-500 text-sm mt-1">
diff --git a/app/(app)/finanse/layout.tsx b/app/(app)/finanse/layout.tsx
index fbde4f9..c62c835 100644
--- a/app/(app)/finanse/layout.tsx
+++ b/app/(app)/finanse/layout.tsx
@@ -13,7 +13,7 @@ export default function FinanseLayout({ children }: { children: React.ReactNode
   return (
     <div>
       <div
-        className="sticky top-0 z-20 border-b px-8 py-3 flex items-center justify-between"
+        className="sticky top-0 z-20 border-b px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between flex-wrap gap-3"
         style={{
           backgroundColor: isMD ? '#faf5ff' : '#ffffff',
           borderColor: isMD ? '#e9d5ff' : '#e5e7eb',
diff --git a/app/(app)/finanse/nowa/page.tsx b/app/(app)/finanse/nowa/page.tsx
index 6b42263..de75445 100644
--- a/app/(app)/finanse/nowa/page.tsx
+++ b/app/(app)/finanse/nowa/page.tsx
@@ -32,7 +32,7 @@ export default async function NowaFakturaPage() {
   })
 
   return (
-    <div className="p-8 max-w-3xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Nowa faktura zakupowa</h1>
         <p className="text-gray-500 text-sm mt-1">
diff --git a/app/(app)/finanse/page.tsx b/app/(app)/finanse/page.tsx
index 0360f88..ee381dc 100644
--- a/app/(app)/finanse/page.tsx
+++ b/app/(app)/finanse/page.tsx
@@ -131,7 +131,7 @@ export default async function FinanseHomePage() {
   const maxVendorSum = topVendors[0]?.sum || 1
 
   return (
-    <div className="p-8">
+    <div className="p-4 sm:p-6 lg:p-8">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Finanse</h1>
         <p className="text-gray-500 text-sm mt-1">
@@ -169,7 +169,7 @@ export default async function FinanseHomePage() {
           href="/finanse/kaucje"
           className="block bg-white rounded-xl border border-gray-200 hover:border-gray-300 p-5 mb-6 transition-colors"
         >
-          <div className="flex items-center justify-between">
+          <div className="flex items-center justify-between flex-wrap gap-2">
             <div>
               <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Kaucje gwarancyjne (zatrzymane)</p>
               <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtMoney(depositActive._sum.deposit || 0)}</p>
diff --git a/app/(app)/finanse/podatki/page.tsx b/app/(app)/finanse/podatki/page.tsx
index 0e97ce6..2ef26aa 100644
--- a/app/(app)/finanse/podatki/page.tsx
+++ b/app/(app)/finanse/podatki/page.tsx
@@ -39,7 +39,7 @@ export default async function PodatkiPage({ searchParams }: { searchParams: { ye
   const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]
 
   return (
-    <div className="p-8 max-w-4xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Podatki (orientacyjnie)</h1>
         <p className="text-gray-500 text-sm mt-1">CIT {(CIT_RATE * 100).toFixed(0)}% + VAT do zapłaty, narastająco za rok. Bez faktur zaliczkowych.</p>
@@ -96,7 +96,7 @@ export default async function PodatkiPage({ searchParams }: { searchParams: { ye
 function Line({ label, value, bold, big, accent }: { label: string; value: string; bold?: boolean; big?: boolean; accent?: 'red' | 'green' }) {
   const color = accent === 'red' ? 'text-red-600' : accent === 'green' ? 'text-green-700' : 'text-gray-900'
   return (
-    <div className="flex items-baseline justify-between">
+    <div className="flex items-baseline justify-between flex-wrap gap-x-3">
       <span className="text-gray-600">{label}</span>
       <span className={`tabular-nums ${big ? 'text-xl font-bold' : bold ? 'font-semibold' : ''} ${color}`}>{value}</span>
     </div>
diff --git a/app/(app)/finanse/powiernicze/page.tsx b/app/(app)/finanse/powiernicze/page.tsx
index 84e4ae8..4029998 100644
--- a/app/(app)/finanse/powiernicze/page.tsx
+++ b/app/(app)/finanse/powiernicze/page.tsx
@@ -7,7 +7,7 @@ export default async function PowiernniczePage() {
 
   if (company !== 'MARAF_DEVELOPMENT') {
     return (
-      <div className="p-8 max-w-3xl">
+      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
         <div className="mb-6">
           <h1 className="text-2xl font-bold text-gray-900">Rozliczenia powiernicze</h1>
           <p className="text-gray-500 text-sm mt-1">Kontrola wpłat nabywców z rachunków powierniczych</p>
@@ -31,7 +31,7 @@ export default async function PowiernniczePage() {
   })
 
   return (
-    <div className="p-8">
+    <div className="p-4 sm:p-6 lg:p-8">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Rozliczenia powiernicze</h1>
         <p className="text-gray-500 text-sm mt-1">
diff --git a/app/(app)/finanse/przychody/[id]/page.tsx b/app/(app)/finanse/przychody/[id]/page.tsx
index bb72301..2981601 100644
--- a/app/(app)/finanse/przychody/[id]/page.tsx
+++ b/app/(app)/finanse/przychody/[id]/page.tsx
@@ -30,10 +30,10 @@ export default async function SalesInvoiceDetailsPage({ params }: { params: { id
   const ksef = (inv.ksefData as unknown as KsefInvoiceData | null) || null
 
   return (
-    <div className="p-8 max-w-5xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
       <div className="mb-6">
         <Link href="/finanse/przychody" className="text-sm text-gray-500 hover:text-gray-700">← Faktury przychodowe</Link>
-        <div className="flex items-start justify-between mt-2 gap-4">
+        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
           <div>
             <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
               {inv.recipientName}
@@ -100,26 +100,28 @@ export default async function SalesInvoiceDetailsPage({ params }: { params: { id
 
         {inv.payments.length > 0 && (
           <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
-            <table className="w-full text-sm">
-              <thead className="bg-gray-50 border-b border-gray-200 text-left">
-                <tr>
-                  <th className="px-4 py-2 font-medium text-gray-700">Data</th>
-                  <th className="px-4 py-2 font-medium text-gray-700 text-right">Kwota</th>
-                  <th className="px-4 py-2 font-medium text-gray-700">Tytuł</th>
-                  <th className="px-4 py-2"></th>
-                </tr>
-              </thead>
-              <tbody className="divide-y divide-gray-100">
-                {inv.payments.map((p) => (
-                  <tr key={p.id}>
-                    <td className="px-4 py-2 text-gray-700 tabular-nums">{fmtDate(p.paidAt)}</td>
-                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(p.amount)}</td>
-                    <td className="px-4 py-2 text-gray-500 text-xs">{p.reference || '—'}</td>
-                    <td className="px-4 py-2 text-right"><DeleteSalesPaymentButton invoiceId={inv.id} paymentId={p.id} /></td>
+            <div className="overflow-x-auto">
+              <table className="w-full text-sm min-w-[520px] lg:min-w-0">
+                <thead className="bg-gray-50 border-b border-gray-200 text-left">
+                  <tr>
+                    <th className="px-4 py-2 font-medium text-gray-700">Data</th>
+                    <th className="px-4 py-2 font-medium text-gray-700 text-right">Kwota</th>
+                    <th className="px-4 py-2 font-medium text-gray-700">Tytuł</th>
+                    <th className="px-4 py-2"></th>
                   </tr>
-                ))}
-              </tbody>
-            </table>
+                </thead>
+                <tbody className="divide-y divide-gray-100">
+                  {inv.payments.map((p) => (
+                    <tr key={p.id}>
+                      <td className="px-4 py-2 text-gray-700 tabular-nums">{fmtDate(p.paidAt)}</td>
+                      <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(p.amount)}</td>
+                      <td className="px-4 py-2 text-gray-500 text-xs">{p.reference || '—'}</td>
+                      <td className="px-4 py-2 text-right"><DeleteSalesPaymentButton invoiceId={inv.id} paymentId={p.id} /></td>
+                    </tr>
+                  ))}
+                </tbody>
+              </table>
+            </div>
           </div>
         )}
 
diff --git a/app/(app)/finanse/przychody/nowa/page.tsx b/app/(app)/finanse/przychody/nowa/page.tsx
index bd31788..91904a2 100644
--- a/app/(app)/finanse/przychody/nowa/page.tsx
+++ b/app/(app)/finanse/przychody/nowa/page.tsx
@@ -5,7 +5,7 @@ import { COMPANY_LABELS } from '@/lib/types'
 export default function NowaPrzychodowaPage() {
   const company = getActiveCompany()
   return (
-    <div className="p-8 max-w-3xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Nowa faktura przychodowa</h1>
         <p className="text-gray-500 text-sm mt-1">Wystawia: <strong>{COMPANY_LABELS[company]}</strong></p>
diff --git a/app/(app)/finanse/przychody/page.tsx b/app/(app)/finanse/przychody/page.tsx
index f8671ab..f8f4048 100644
--- a/app/(app)/finanse/przychody/page.tsx
+++ b/app/(app)/finanse/przychody/page.tsx
@@ -42,8 +42,8 @@ export default async function PrzychodyPage({ searchParams }: { searchParams: Se
   const hasFilters = !!(searchParams.status || searchParams.q || searchParams.year)
 
   return (
-    <div className="p-8">
-      <div className="flex items-center justify-between mb-6">
+    <div className="p-4 sm:p-6 lg:p-8">
+      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
         <div>
           <h1 className="text-2xl font-bold text-gray-900">Faktury przychodowe</h1>
           <p className="text-gray-500 text-sm mt-1">{invoices.length} faktur{hasFilters ? ' (po filtrach)' : ''}</p>
@@ -67,7 +67,7 @@ export default async function PrzychodyPage({ searchParams }: { searchParams: Se
 
       <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
         <div className="overflow-x-auto">
-          <table className="w-full text-sm">
+          <table className="w-full text-sm min-w-[1080px] lg:min-w-0">
             <thead className="bg-gray-50 border-b border-gray-200 text-left">
               <tr>
                 <th className="px-3 py-3 font-medium text-gray-700">Odbiorca</th>
diff --git a/app/(app)/finanse/statystyki/page.tsx b/app/(app)/finanse/statystyki/page.tsx
index fab225e..0e2c6f9 100644
--- a/app/(app)/finanse/statystyki/page.tsx
+++ b/app/(app)/finanse/statystyki/page.tsx
@@ -40,7 +40,7 @@ export default async function StatystykiPage() {
   ])
 
   return (
-    <div className="p-8 max-w-7xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Statystyki</h1>
         <p className="text-gray-500 text-sm mt-1">
diff --git a/components/finanse/AddPaymentForm.tsx b/components/finanse/AddPaymentForm.tsx
index ffaf316..0ee0058 100644
--- a/components/finanse/AddPaymentForm.tsx
+++ b/components/finanse/AddPaymentForm.tsx
@@ -55,7 +55,7 @@ export function AddPaymentForm({ invoiceId, remaining }: { invoiceId: string; re
   return (
     <div className="bg-white border border-gray-200 rounded-xl p-4">
       <h3 className="font-medium text-gray-900 mb-3">Nowa płatność</h3>
-      <div className="grid grid-cols-2 gap-3">
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
         <div>
           <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Kwota (zł)</label>
           <input
@@ -84,7 +84,7 @@ export function AddPaymentForm({ invoiceId, remaining }: { invoiceId: string; re
             placeholder="np. FV/000299/26"
           />
         </div>
-        <div className="col-span-2">
+        <div className="md:col-span-2">
           <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Notatka (opcjonalnie)</label>
           <input
             value={notes}
diff --git a/components/finanse/AddSalesPaymentForm.tsx b/components/finanse/AddSalesPaymentForm.tsx
index 698ea60..c0d0f94 100644
--- a/components/finanse/AddSalesPaymentForm.tsx
+++ b/components/finanse/AddSalesPaymentForm.tsx
@@ -31,7 +31,7 @@ export function AddSalesPaymentForm({ invoiceId, remaining }: { invoiceId: strin
   return (
     <div className="bg-white border border-gray-200 rounded-xl p-4">
       <h3 className="font-medium text-gray-900 mb-3">Nowa wpłata</h3>
-      <div className="grid grid-cols-3 gap-3">
+      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
         <div>
           <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Kwota (zł)</label>
           <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
diff --git a/components/finanse/CreateCostButton.tsx b/components/finanse/CreateCostButton.tsx
index f431d31..f6ace61 100644
--- a/components/finanse/CreateCostButton.tsx
+++ b/components/finanse/CreateCostButton.tsx
@@ -19,7 +19,7 @@ export function CreateCostButton({ invoiceId, recipientCompany, linkedPurchaseIn
 
   if (linkedPurchaseInvoiceId) {
     return (
-      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-900 flex items-center justify-between">
+      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-900 flex items-center justify-between flex-wrap gap-2">
         <span>✓ Utworzono koszt u odbiorcy ({COMPANY_LABELS[recipientCompany as Company] || recipientCompany}).</span>
         <Link href={`/finanse/faktury/${linkedPurchaseInvoiceId}`} className="text-blue-600 hover:underline font-medium">Zobacz koszt →</Link>
       </div>
diff --git a/components/finanse/EditInvoiceForm.tsx b/components/finanse/EditInvoiceForm.tsx
index 3abe795..8231a56 100644
--- a/components/finanse/EditInvoiceForm.tsx
+++ b/components/finanse/EditInvoiceForm.tsx
@@ -115,7 +115,7 @@ export function EditInvoiceForm(p: Props) {
         <input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
       </Row>
 
-      <div className="grid grid-cols-2 gap-4">
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <Row label="Data wystawienia">
           <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
         </Row>
@@ -124,7 +124,7 @@ export function EditInvoiceForm(p: Props) {
         </Row>
       </div>
 
-      <div className="grid grid-cols-4 gap-3">
+      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
         <Row label="VAT %">
           <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
             <option value="23">23%</option>
diff --git a/components/finanse/ImportFinanseForm.tsx b/components/finanse/ImportFinanseForm.tsx
index eefc4f7..cc676b2 100644
--- a/components/finanse/ImportFinanseForm.tsx
+++ b/components/finanse/ImportFinanseForm.tsx
@@ -120,7 +120,7 @@ export function ImportFinanseForm() {
         <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
           <h2 className="font-semibold text-gray-900">Podgląd importu</h2>
 
-          <div className="grid grid-cols-4 gap-3">
+          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
             <Stat label="Nowych faktur" value={preview.newInvoicesCount} accent="blue" />
             <Stat label="Duplikatów (pomijamy)" value={preview.duplicatesCount} accent="gray" />
             <Stat label="Pominiętych wierszy" value={preview.skippedCount} accent="amber" />
@@ -129,26 +129,28 @@ export function ImportFinanseForm() {
 
           <div>
             <h3 className="text-sm font-medium text-gray-700 mb-2">Per zakładka</h3>
-            <table className="w-full text-sm">
-              <thead className="text-left text-xs text-gray-500 border-b border-gray-200">
-                <tr>
-                  <th className="py-1 px-2">Zakładka</th>
-                  <th className="py-1 px-2 text-right">Faktur</th>
-                  <th className="py-1 px-2 text-right">Płatności</th>
-                  <th className="py-1 px-2 text-right">Pominięto</th>
-                </tr>
-              </thead>
-              <tbody className="divide-y divide-gray-100">
-                {Object.entries(preview.perSheetCounts).map(([sheet, c]) => (
-                  <tr key={sheet}>
-                    <td className="py-1.5 px-2 font-mono text-xs">{sheet}</td>
-                    <td className="py-1.5 px-2 text-right tabular-nums">{c.invoices}</td>
-                    <td className="py-1.5 px-2 text-right tabular-nums">{c.payments}</td>
-                    <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{c.skipped}</td>
+            <div className="overflow-x-auto">
+              <table className="w-full text-sm min-w-[420px] lg:min-w-0">
+                <thead className="text-left text-xs text-gray-500 border-b border-gray-200">
+                  <tr>
+                    <th className="py-1 px-2">Zakładka</th>
+                    <th className="py-1 px-2 text-right">Faktur</th>
+                    <th className="py-1 px-2 text-right">Płatności</th>
+                    <th className="py-1 px-2 text-right">Pominięto</th>
                   </tr>
-                ))}
-              </tbody>
-            </table>
+                </thead>
+                <tbody className="divide-y divide-gray-100">
+                  {Object.entries(preview.perSheetCounts).map(([sheet, c]) => (
+                    <tr key={sheet}>
+                      <td className="py-1.5 px-2 font-mono text-xs">{sheet}</td>
+                      <td className="py-1.5 px-2 text-right tabular-nums">{c.invoices}</td>
+                      <td className="py-1.5 px-2 text-right tabular-nums">{c.payments}</td>
+                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{c.skipped}</td>
+                    </tr>
+                  ))}
+                </tbody>
+              </table>
+            </div>
           </div>
 
           {preview.newVendors.length > 0 && (
@@ -167,32 +169,34 @@ export function ImportFinanseForm() {
           {preview.sampleNewInvoices.length > 0 && (
             <div>
               <h3 className="text-sm font-medium text-gray-700 mb-2">Przykładowe faktury (pierwsze 10 z {preview.newInvoicesCount})</h3>
-              <table className="w-full text-xs">
-                <thead className="text-left text-gray-500 border-b border-gray-200">
-                  <tr>
-                    <th className="py-1 px-2">Vendor / Sub</th>
-                    <th className="py-1 px-2">Nr FV</th>
-                    <th className="py-1 px-2">Wystawiona</th>
-                    <th className="py-1 px-2 text-right">Brutto</th>
-                    <th className="py-1 px-2">Status</th>
-                    <th className="py-1 px-2 text-right">Płat.</th>
-                  </tr>
-                </thead>
-                <tbody className="divide-y divide-gray-100">
-                  {preview.sampleNewInvoices.map((inv, i) => (
-                    <tr key={i}>
-                      <td className="py-1 px-2">
-                        {inv.vendor}{inv.subVendor && <span className="text-gray-500"> / {inv.subVendor}</span>}
-                      </td>
-                      <td className="py-1 px-2 font-mono">{inv.number}</td>
-                      <td className="py-1 px-2 tabular-nums">{new Date(inv.issueDate).toLocaleDateString('pl-PL')}</td>
-                      <td className="py-1 px-2 text-right tabular-nums">{fmtMoney(inv.amountGross)}</td>
-                      <td className="py-1 px-2 text-gray-600">{inv.status}</td>
-                      <td className="py-1 px-2 text-right tabular-nums">{inv.paymentsCount}</td>
+              <div className="overflow-x-auto">
+                <table className="w-full text-xs min-w-[640px] lg:min-w-0">
+                  <thead className="text-left text-gray-500 border-b border-gray-200">
+                    <tr>
+                      <th className="py-1 px-2">Vendor / Sub</th>
+                      <th className="py-1 px-2">Nr FV</th>
+                      <th className="py-1 px-2">Wystawiona</th>
+                      <th className="py-1 px-2 text-right">Brutto</th>
+                      <th className="py-1 px-2">Status</th>
+                      <th className="py-1 px-2 text-right">Płat.</th>
                     </tr>
-                  ))}
-                </tbody>
-              </table>
+                  </thead>
+                  <tbody className="divide-y divide-gray-100">
+                    {preview.sampleNewInvoices.map((inv, i) => (
+                      <tr key={i}>
+                        <td className="py-1 px-2">
+                          {inv.vendor}{inv.subVendor && <span className="text-gray-500"> / {inv.subVendor}</span>}
+                        </td>
+                        <td className="py-1 px-2 font-mono">{inv.number}</td>
+                        <td className="py-1 px-2 tabular-nums">{new Date(inv.issueDate).toLocaleDateString('pl-PL')}</td>
+                        <td className="py-1 px-2 text-right tabular-nums">{fmtMoney(inv.amountGross)}</td>
+                        <td className="py-1 px-2 text-gray-600">{inv.status}</td>
+                        <td className="py-1 px-2 text-right tabular-nums">{inv.paymentsCount}</td>
+                      </tr>
+                    ))}
+                  </tbody>
+                </table>
+              </div>
             </div>
           )}
 
diff --git a/components/finanse/KsefConfigCard.tsx b/components/finanse/KsefConfigCard.tsx
index c941dc7..ed44ef9 100644
--- a/components/finanse/KsefConfigCard.tsx
+++ b/components/finanse/KsefConfigCard.tsx
@@ -85,7 +85,7 @@ export function KsefConfigCard(p: Props) {
         </div>
       </div>
 
-      <div className="grid grid-cols-2 gap-4 mb-4">
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
         <div>
           <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">NIP</label>
           <input value={nip} onChange={(e) => setNip(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
@@ -97,7 +97,7 @@ export function KsefConfigCard(p: Props) {
             <option value="TEST">Test</option>
           </select>
         </div>
-        <div className="col-span-2">
+        <div className="md:col-span-2">
           <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Token KSeF</label>
           {p.hasToken && !editingToken ? (
             <div className="flex items-center gap-2">
@@ -144,7 +144,7 @@ export function KsefConfigCard(p: Props) {
       {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2 mb-3">{msg}</p>}
       {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{error}</p>}
 
-      <div className="flex gap-2 pt-3 border-t border-gray-100">
+      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
         <button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
           {saving ? 'Zapisuję...' : 'Zapisz konfigurację'}
         </button>
diff --git a/components/finanse/KsefInvoiceDetails.tsx b/components/finanse/KsefInvoiceDetails.tsx
index f4b0fab..6fd53c4 100644
--- a/components/finanse/KsefInvoiceDetails.tsx
+++ b/components/finanse/KsefInvoiceDetails.tsx
@@ -71,7 +71,7 @@ export function KsefInvoiceDetails({ data }: { data: KsefInvoiceData }) {
           <p className="text-sm text-gray-400">Brak pozycji w danych z KSeF.</p>
         ) : (
           <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
-            <table className="w-full text-sm">
+            <table className="w-full text-sm min-w-[860px] lg:min-w-0">
               <thead className="bg-gray-50 border-b border-gray-200 text-left">
                 <tr>
                   <th className="px-3 py-2 font-medium text-gray-700 w-8">Lp</th>
diff --git a/components/finanse/NewInvoiceForm.tsx b/components/finanse/NewInvoiceForm.tsx
index 85e793f..1764a84 100644
--- a/components/finanse/NewInvoiceForm.tsx
+++ b/components/finanse/NewInvoiceForm.tsx
@@ -122,7 +122,7 @@ export function NewInvoiceForm({ vendors, company }: { vendors: Vendor[]; compan
           className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
         />
       </Row>
-      <div className="grid grid-cols-2 gap-4">
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <Row label="Data wystawienia">
           <input
             type="date"
@@ -141,7 +141,7 @@ export function NewInvoiceForm({ vendors, company }: { vendors: Vendor[]; compan
         </Row>
       </div>
 
-      <div className="grid grid-cols-4 gap-3">
+      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
         <Row label="VAT %">
           <select
             value={vatRate}
@@ -188,7 +188,7 @@ export function NewInvoiceForm({ vendors, company }: { vendors: Vendor[]; compan
         Automatycznie licz netto/VAT z brutto i stawki
       </label>
 
-      <div className="grid grid-cols-2 gap-3">
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
         <Row label="Kaucja % (opc.)">
           <input value={depositPct} onChange={(e) => setDepositPct(e.target.value)} placeholder="np. 5" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" />
         </Row>
diff --git a/components/finanse/NewSalesInvoiceForm.tsx b/components/finanse/NewSalesInvoiceForm.tsx
index 0f0cc29..d8222e5 100644
--- a/components/finanse/NewSalesInvoiceForm.tsx
+++ b/components/finanse/NewSalesInvoiceForm.tsx
@@ -62,7 +62,7 @@ export function NewSalesInvoiceForm({ company }: { company: string }) {
         <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="np. FV/12/2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
       </Row>
 
-      <div className="grid grid-cols-2 gap-4">
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <Row label="Odbiorca (firma)">
           <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="np. Janpol sp. z o.o." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
         </Row>
@@ -74,7 +74,7 @@ export function NewSalesInvoiceForm({ company }: { company: string }) {
         </Row>
       </div>
 
-      <div className="grid grid-cols-2 gap-4">
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <Row label="Data wystawienia">
           <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
         </Row>
@@ -83,7 +83,7 @@ export function NewSalesInvoiceForm({ company }: { company: string }) {
         </Row>
       </div>
 
-      <div className="grid grid-cols-4 gap-3">
+      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
         <Row label="VAT %">
           <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
             <option value="23">23%</option><option value="8">8%</option><option value="5">5%</option><option value="0">0%</option>
@@ -98,7 +98,7 @@ export function NewSalesInvoiceForm({ company }: { company: string }) {
         Automatycznie licz netto/VAT z brutto
       </label>
 
-      <div className="grid grid-cols-2 gap-4">
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <Row label="Kaucja zatrzymana (opc.)"><input value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="zł" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" /></Row>
         <Row label="Koszty budowy / KB (opc.)"><input value={kb} onChange={(e) => setKb(e.target.value)} placeholder="zł" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums" /></Row>
       </div>
diff --git a/components/finanse/VendorTermsCell.tsx b/components/finanse/VendorTermsCell.tsx
index 956f240..ade4019 100644
--- a/components/finanse/VendorTermsCell.tsx
+++ b/components/finanse/VendorTermsCell.tsx
@@ -152,7 +152,7 @@ export function VendorTermsCell({ vendorId, terms, legacyDepositPct, legacyKbPct
   }
 
   return (
-    <div className="text-xs bg-white border border-gray-300 rounded-lg p-3 min-w-[430px] shadow-sm">
+    <div className="text-xs bg-white border border-gray-300 rounded-lg p-3 w-full sm:min-w-[430px] shadow-sm">
       <p className="font-semibold text-gray-900 mb-2">Warunki umowne (kaucja / zwrot / koszty budowy)</p>
       <div className="space-y-2">
         {rows.map((row, idx) => (
diff --git a/components/finanse/finansowanie/FinansowanieView.tsx b/components/finanse/finansowanie/FinansowanieView.tsx
index 84fd868..2f559b3 100644
--- a/components/finanse/finansowanie/FinansowanieView.tsx
+++ b/components/finanse/finansowanie/FinansowanieView.tsx
@@ -72,14 +72,14 @@ export function FinansowanieView({
   }
 
   return (
-    <div className="p-8 max-w-6xl">
+    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-gray-900">Finansowanie inwestycji</h1>
         <p className="text-gray-500 text-sm mt-1">Kredyty, rachunki powiernicze, zwroty VAT — Maraf Development</p>
       </div>
 
       {/* Taby */}
-      <div className="flex gap-1 mb-6 border-b border-gray-200">
+      <div className="flex gap-1 mb-6 border-b border-gray-200 flex-wrap">
         <TabBtn active={tab === 'loans'} onClick={() => setTab('loans')}>
           Kredyty <Badge>{loans.length}</Badge>
         </TabBtn>
@@ -136,7 +136,7 @@ function LoansTab({ loansByType }: { loansByType: Record<string, LoanRow[]> }) {
 
   return (
     <div className="space-y-6">
-      <div className="flex items-center justify-between">
+      <div className="flex items-center justify-between flex-wrap gap-3">
         <div className="text-sm text-gray-500">
           Suma limitów:{' '}
           <strong className="text-gray-900 tabular-nums">
@@ -518,7 +518,7 @@ function EscrowTab({ escrows }: { escrows: EscrowRow[] }) {
 
   return (
     <div className="space-y-4">
-      <div className="flex items-center justify-between">
+      <div className="flex items-center justify-between flex-wrap gap-3">
         <div className="text-sm text-gray-500 space-x-4">
           <span>W escrow: <strong className="text-gray-900 tabular-nums">{fmtMoney(totalBalance)}</strong></span>
           <span>Uwolnione łącznie: <strong className="text-gray-900 tabular-nums">{fmtMoney(totalReleased)}</strong></span>
@@ -878,7 +878,7 @@ function VatTab({ refunds, vatLoans }: { refunds: RefundRow[]; vatLoans: { id: s
 
   return (
     <div className="space-y-4">
-      <div className="flex items-center justify-between">
+      <div className="flex items-center justify-between flex-wrap gap-3">
         <div className="text-sm text-gray-500 space-x-4">
           <span>YTD: <strong className="text-gray-900 tabular-nums">{fmtMoney(totalYTD)}</strong></span>
           <span>Na spłatę kredytu VAT: <strong className="text-gray-900 tabular-nums">{fmtMoney(totalAppliedToLoan)}</strong></span>
@@ -931,38 +931,40 @@ function VatTab({ refunds, vatLoans }: { refunds: RefundRow[]; vatLoans: { id: s
 
       {refunds.length > 0 && (
         <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
-          <table className="w-full text-sm">
-            <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
-              <tr>
-                <th className="px-4 py-2">Data</th>
-                <th className="px-4 py-2">Okres</th>
-                <th className="px-4 py-2 text-right">Kwota</th>
-                <th className="px-4 py-2">Przeznaczenie</th>
-                <th className="px-4 py-2">Notatka</th>
-                <th className="px-4 py-2"></th>
-              </tr>
-            </thead>
-            <tbody className="divide-y divide-gray-100">
-              {refunds.map((r) => (
-                <tr key={r.id} className="hover:bg-gray-50">
-                  <td className="px-4 py-2 text-gray-700 tabular-nums">{r.date.slice(0, 10)}</td>
-                  <td className="px-4 py-2 text-gray-600 text-xs">{r.periodLabel || '—'}</td>
-                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{fmtMoney(r.amount)}</td>
-                  <td className="px-4 py-2 text-xs">
-                    {r.appliedToLoan ? (
-                      <span className="bg-purple-50 text-purple-700 rounded px-2 py-0.5">Spłata: {r.appliedToLoan.name}</span>
-                    ) : (
-                      <span className="text-gray-500">Na konto operacyjne</span>
-                    )}
-                  </td>
-                  <td className="px-4 py-2 text-xs text-gray-500">{r.note || '—'}</td>
-                  <td className="px-4 py-2 text-right">
-                    <button onClick={() => del(r.id)} className="text-rose-500 hover:text-rose-700 text-sm">×</button>
-                  </td>
+          <div className="overflow-x-auto">
+            <table className="w-full min-w-[720px] lg:min-w-0 text-sm">
+              <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
+                <tr>
+                  <th className="px-4 py-2">Data</th>
+                  <th className="px-4 py-2">Okres</th>
+                  <th className="px-4 py-2 text-right">Kwota</th>
+                  <th className="px-4 py-2">Przeznaczenie</th>
+                  <th className="px-4 py-2">Notatka</th>
+                  <th className="px-4 py-2"></th>
                 </tr>
-              ))}
-            </tbody>
-          </table>
+              </thead>
+              <tbody className="divide-y divide-gray-100">
+                {refunds.map((r) => (
+                  <tr key={r.id} className="hover:bg-gray-50">
+                    <td className="px-4 py-2 text-gray-700 tabular-nums">{r.date.slice(0, 10)}</td>
+                    <td className="px-4 py-2 text-gray-600 text-xs">{r.periodLabel || '—'}</td>
+                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{fmtMoney(r.amount)}</td>
+                    <td className="px-4 py-2 text-xs">
+                      {r.appliedToLoan ? (
+                        <span className="bg-purple-50 text-purple-700 rounded px-2 py-0.5">Spłata: {r.appliedToLoan.name}</span>
+                      ) : (
+                        <span className="text-gray-500">Na konto operacyjne</span>
+                      )}
+                    </td>
+                    <td className="px-4 py-2 text-xs text-gray-500">{r.note || '—'}</td>
+                    <td className="px-4 py-2 text-right">
+                      <button onClick={() => del(r.id)} className="text-rose-500 hover:text-rose-700 text-sm">×</button>
+                    </td>
+                  </tr>
+                ))}
+              </tbody>
+            </table>
+          </div>
         </div>
       )}
     </div>
diff --git a/components/finanse/powiernicze/DopasowaniePanel.tsx b/components/finanse/powiernicze/DopasowaniePanel.tsx
index 5013ac4..37a42b6 100644
--- a/components/finanse/powiernicze/DopasowaniePanel.tsx
+++ b/components/finanse/powiernicze/DopasowaniePanel.tsx
@@ -150,7 +150,7 @@ export function DopasowaniePanel({
           {/* Tabela wpłat */}
           <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
             <div className="overflow-x-auto">
-              <table className="w-full text-sm">
+              <table className="w-full min-w-[760px] lg:min-w-0 text-sm">
                 <thead className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                   <tr>
                     <th className="py-2 px-3">Data</th>
diff --git a/components/finanse/powiernicze/ImportWyciaguForm.tsx b/components/finanse/powiernicze/ImportWyciaguForm.tsx
index 32e04d2..a7551bd 100644
--- a/components/finanse/powiernicze/ImportWyciaguForm.tsx
+++ b/components/finanse/powiernicze/ImportWyciaguForm.tsx
@@ -151,7 +151,7 @@ export function ImportWyciaguForm({ onImported }: { onImported: () => void }) {
           <div>
             <h3 className="text-sm font-medium text-gray-700 mb-2">Pozycje (pierwsze {Math.min(preview.preview.length, 200)})</h3>
             <div className="overflow-x-auto">
-              <table className="w-full text-xs">
+              <table className="w-full min-w-[640px] lg:min-w-0 text-xs">
                 <thead className="text-left text-gray-500 border-b border-gray-200">
                   <tr>
                     <th className="py-1 px-2">Data</th>
diff --git a/components/finanse/powiernicze/RejestrOdsetek.tsx b/components/finanse/powiernicze/RejestrOdsetek.tsx
index b9596ef..dff3b76 100644
--- a/components/finanse/powiernicze/RejestrOdsetek.tsx
+++ b/components/finanse/powiernicze/RejestrOdsetek.tsx
@@ -47,7 +47,7 @@ export function RejestrOdsetek({ refreshKey, onChanged }: { refreshKey: number;
 
       <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
         <div className="overflow-x-auto">
-          <table className="w-full text-sm">
+          <table className="w-full min-w-[860px] lg:min-w-0 text-sm">
             <thead className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
               <tr>
                 <th className="py-2 px-3">Umowa</th>
diff --git a/components/finanse/powiernicze/RejestrWplat.tsx b/components/finanse/powiernicze/RejestrWplat.tsx
index 6869706..03d9c20 100644
--- a/components/finanse/powiernicze/RejestrWplat.tsx
+++ b/components/finanse/powiernicze/RejestrWplat.tsx
@@ -50,7 +50,7 @@ export function RejestrWplat({ refreshKey }: { refreshKey: number }) {
 
       <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
         <div className="overflow-x-auto">
-          <table className="w-full text-sm">
+          <table className="w-full min-w-[820px] lg:min-w-0 text-sm">
             <thead className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
               <tr>
                 <th className="py-2 px-3">Data</th>

```

### 8b. Diff — szkielet layoutu (4 pliki)

```diff
diff --git a/components/layout/AppShell.tsx b/components/layout/AppShell.tsx
index 284688f..9dca5f8 100644
--- a/components/layout/AppShell.tsx
+++ b/components/layout/AppShell.tsx
@@ -1,23 +1,33 @@
 'use client'
 import { useEffect, useState } from 'react'
+import { usePathname } from 'next/navigation'
 import { Sidebar } from './Sidebar'
+import { MobileNavProvider, useMobileNav } from './MobileNavContext'
 
-// Szerokości panelu bocznego — muszą być zsynchronizowane z marginesem treści.
-const W_EXPANDED = 256 // w-64
-const W_COLLAPSED = 80
 const LS_COLLAPSED = 'sidebar.collapsed'
 
 /**
- * Powłoka aplikacji: trzyma stan zwinięcia sidebara (localStorage) i utrzymuje
- * margines treści w zgodzie z szerokością panelu. Sidebar jest `fixed`, więc
- * treść musi mieć odpowiadający margines lewy.
+ * Powłoka aplikacji.
+ * - Desktop (lg+): sidebar `fixed`, zwijany do 80px (stan w localStorage);
+ *   margines treści (`lg:ml-[var(--sb-w)]`) idzie w parze z szerokością panelu.
+ * - Mobile (<lg): sidebar staje się wysuwanym drawerem (patrz Sidebar +
+ *   MobileNavContext), treść zajmuje pełną szerokość (`ml-0`), a hamburger w
+ *   TopBar otwiera panel. Backdrop i zamykanie (Escape / nawigacja) tutaj.
  */
 export function AppShell({ topBar, children }: { topBar: React.ReactNode; children: React.ReactNode }) {
   const [collapsed, setCollapsed] = useState(false)
+  // Zwijanie do 80px to funkcja WYŁĄCZNIE desktopowa (lg+). isDesktop domyślnie
+  // true (SSR/pierwszy paint = desktop-first); na mobile ustala się po mount.
+  const [isDesktop, setIsDesktop] = useState(true)
 
   useEffect(() => {
     if (typeof window === 'undefined') return
     setCollapsed(window.localStorage.getItem(LS_COLLAPSED) === '1')
+    const mq = window.matchMedia('(min-width: 1024px)')
+    const sync = () => setIsDesktop(mq.matches)
+    sync()
+    mq.addEventListener('change', sync)
+    return () => mq.removeEventListener('change', sync)
   }, [])
 
   function toggle() {
@@ -30,12 +40,63 @@ export function AppShell({ topBar, children }: { topBar: React.ReactNode; childr
     })
   }
 
+  // Poniżej lg drawer jest ZAWSZE rozwinięty (256px, pełne menu) — inaczej
+  // zapamiętany stan „zwinięty" z desktopu zablokowałby panel na 80px bez
+  // dostępu do przełącznika (ukryty na mobile).
+  const effectiveCollapsed = isDesktop && collapsed
+
+  return (
+    <MobileNavProvider>
+      <Shell topBar={topBar} collapsed={effectiveCollapsed} onToggleCollapse={toggle}>
+        {children}
+      </Shell>
+    </MobileNavProvider>
+  )
+}
+
+function Shell({
+  topBar,
+  collapsed,
+  onToggleCollapse,
+  children,
+}: {
+  topBar: React.ReactNode
+  collapsed: boolean
+  onToggleCollapse: () => void
+  children: React.ReactNode
+}) {
+  const { open, setOpen } = useMobileNav()
+  const pathname = usePathname()
+
+  // Drawer zamyka się po każdej nawigacji (zmiana pathname) i na Escape.
+  useEffect(() => {
+    setOpen(false)
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [pathname])
+  useEffect(() => {
+    if (!open) return
+    function onKey(e: KeyboardEvent) {
+      if (e.key === 'Escape') setOpen(false)
+    }
+    document.addEventListener('keydown', onKey)
+    return () => document.removeEventListener('keydown', onKey)
+  }, [open, setOpen])
+
   return (
-    <div className="flex h-screen" style={{ backgroundColor: 'var(--background)' }}>
-      <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
+    // h-dvh zamiast h-screen — na mobile 100vh nie uwzględnia paska adresu przeglądarki.
+    <div className="flex h-dvh" style={{ backgroundColor: 'var(--background)' }}>
+      {/* Backdrop drawera — tylko mobile, klik zamyka */}
+      {open && (
+        <div
+          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
+          aria-hidden="true"
+          onClick={() => setOpen(false)}
+        />
+      )}
+      <Sidebar collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
       <div
-        className="flex-1 flex flex-col overflow-hidden transition-[margin] duration-200 ease-out"
-        style={{ marginLeft: collapsed ? W_COLLAPSED : W_EXPANDED }}
+        className="flex-1 flex flex-col overflow-hidden transition-[margin] duration-200 ease-out ml-0 lg:ml-[var(--sb-w)]"
+        style={{ ['--sb-w' as string]: collapsed ? '80px' : '256px' } as React.CSSProperties}
       >
         {topBar}
         <main className="flex-1 overflow-y-auto">{children}</main>
diff --git a/components/layout/MobileNavContext.tsx b/components/layout/MobileNavContext.tsx
new file mode 100644
index 0000000..a78fd7b
--- /dev/null
+++ b/components/layout/MobileNavContext.tsx
@@ -0,0 +1,18 @@
+'use client'
+import { createContext, useContext, useState } from 'react'
+
+// Stan wysuwanego sidebara na mobile (<lg). Provider siedzi w AppShell,
+// konsumują go TopBar (hamburger otwiera) i Sidebar (drawer się wysuwa).
+// Na lg+ stan nie ma znaczenia — sidebar jest zawsze widoczny (CSS lg:translate-x-0).
+type MobileNavState = { open: boolean; setOpen: (v: boolean) => void }
+
+const MobileNavContext = createContext<MobileNavState>({ open: false, setOpen: () => {} })
+
+export function MobileNavProvider({ children }: { children: React.ReactNode }) {
+  const [open, setOpen] = useState(false)
+  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>
+}
+
+export function useMobileNav() {
+  return useContext(MobileNavContext)
+}
diff --git a/components/layout/Sidebar.tsx b/components/layout/Sidebar.tsx
index ded139b..a35513d 100644
--- a/components/layout/Sidebar.tsx
+++ b/components/layout/Sidebar.tsx
@@ -7,6 +7,7 @@ import { LogoFullOnDark, LogoIcon } from './Logo'
 import { isAdmin } from '@/lib/auth-utils'
 import { getRequiredPermission } from '@/lib/permissions'
 import { useRipple } from '@/lib/ripple'
+import { useMobileNav } from './MobileNavContext'
 
 type NavItem = { href: string; label: string; icon: React.ReactNode }
 type NavSection = { label?: string; items: NavItem[] }
@@ -291,6 +292,7 @@ export function Sidebar({
 } = {}) {
   const pathname = usePathname()
   const router = useRouter()
+  const { open: mobileOpen } = useMobileNav()
   const { data: session, status } = useSession()
   const userIsAdmin = isAdmin(session?.user?.email)
   const userPermissions = (session?.user as any)?.permissions as string[] | undefined
@@ -363,7 +365,9 @@ export function Sidebar({
 
   return (
     <aside
-      className="fixed left-0 top-0 h-full flex flex-col z-30 transition-[width] duration-200 ease-out"
+      className={`fixed left-0 top-0 h-dvh flex flex-col z-40 lg:z-30 transition-[width,transform] duration-200 ease-out -translate-x-full lg:translate-x-0 ${
+        mobileOpen ? 'translate-x-0' : ''
+      }`}
       style={{ background: SB.bg, borderRight: '1px solid rgba(242,232,214,.08)', width: collapsed ? 80 : 256 }}
     >
       {/* Logo — klik prowadzi na stronę główną (Pulpit). 64px — spójnie z TopBarem. */}
@@ -465,7 +469,8 @@ export function Sidebar({
             onClick={onToggleCollapse}
             title={collapsed ? 'Rozwiń panel' : 'Zwiń panel'}
             aria-label={collapsed ? 'Rozwiń panel' : 'Zwiń panel'}
-            className={itemBase + ' w-full' + (collapsed ? ' justify-center' : '')}
+            /* Zwijanie to funkcja desktopowa — na mobile (drawer) ukryte, żeby panel nie wpadł w tryb 80px */
+            className={itemBase + ' w-full hidden lg:flex' + (collapsed ? ' justify-center' : '')}
             style={{ color: SB.muted }}
             onMouseEnter={(e) => {
               e.currentTarget.style.backgroundColor = SB.hoverBg
diff --git a/components/layout/TopBar.tsx b/components/layout/TopBar.tsx
index 118f2ac..3a069d5 100644
--- a/components/layout/TopBar.tsx
+++ b/components/layout/TopBar.tsx
@@ -2,11 +2,12 @@
 import { useEffect, useRef, useState } from 'react'
 import Link from 'next/link'
 import { signOut } from 'next-auth/react'
-import { User, LogOut, ChevronDown } from 'lucide-react'
+import { User, LogOut, ChevronDown, Menu } from 'lucide-react'
 import { ThemeToggle } from './ThemeToggle'
 import { CommandPalette } from './CommandPalette'
 import { Avatar } from '@/components/profil/Avatar'
 import { useRipple } from '@/lib/ripple'
+import { useMobileNav } from './MobileNavContext'
 
 export function TopBar({
   userName,
@@ -18,6 +19,7 @@ export function TopBar({
   const [open, setOpen] = useState(false)
   const wrapRef = useRef<HTMLDivElement | null>(null)
   const ripple = useRipple()
+  const { setOpen: setMobileNavOpen } = useMobileNav()
 
   // Close on click outside
   useEffect(() => {
@@ -46,7 +48,19 @@ export function TopBar({
         borderColor: 'color-mix(in srgb, var(--border) 55%, transparent)',
       }}
     >
-      <CommandPalette />
+      <div className="flex items-center gap-2 min-w-0">
+        {/* Hamburger — otwiera drawer sidebara, tylko mobile/tablet (<lg) */}
+        <button
+          type="button"
+          onClick={() => setMobileNavOpen(true)}
+          onPointerDown={ripple}
+          className="lg:hidden -ml-1 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0"
+          aria-label="Otwórz menu"
+        >
+          <Menu className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
+        </button>
+        <CommandPalette />
+      </div>
 
       <div className="flex items-center gap-3">
       <ThemeToggle />

```
