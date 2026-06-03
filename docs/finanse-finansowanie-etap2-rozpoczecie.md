# Finansowanie inwestycji — ETAP 2: auto-EscrowDeposit z modułu Sprzedaż

🟡 **OTWARTE** — do zrobienia w nowej sesji. Etap 1 (kredyty + escrow + zwroty VAT, ręczne wpisywanie) wdrożony 2026-06-03 (commit `334a0f6`). Patrz `docs/finanse-decyzje.md` sekcja „Moduł Finansowanie inwestycji".

## Cel

Gdy Marta rejestruje **wpłatę nabywcy** w module Sprzedaż (umowa deweloperska/rezerwacyjna na inwestycji Maraf Development), system **automatycznie tworzy `EscrowDeposit`** na powiązanym rachunku powierniczym — bez podwójnego wpisywania.

## Dlaczego to osobny etap (bloker)

Moduł Sprzedaż w obecnej formie **NIE MA modelu wpłat**:
- `Contract` ma tylko `reservationFee` (jednorazowa opłata rezerwacyjna), `valueNet`, `valueGross`
- Brak harmonogramu rat z umowy deweloperskiej
- Brak żadnego UI do rejestrowania kolejnych wpłat nabywcy

Czyli najpierw trzeba **rozbudować Sprzedaż**, dopiero potem podpiąć trigger.

## Plan (~3-4h)

### 1. Schema — `ContractPayment`

```prisma
model ContractPayment {
  id             String   @id @default(cuid())
  contractId     String
  contract       Contract @relation(fields: [contractId], references: [id], onDelete: Cascade)
  date           DateTime          // data wpłaty (lub planowana)
  amount         Float
  type           String   @default("RATA")  // ZALICZKA | RATA | KONCOWA | REZERWACYJNA
  status         String   @default("OPLACONA") // PLANOWANA | OPLACONA
  note           String?
  // link do auto-utworzonego depositu (żeby usunięcie wpłaty kasowało deposit)
  escrowDepositId String?  @unique
  createdAt      DateTime @default(now())
}
```
Plus relacja `Contract.payments ContractPayment[]`.

`EscrowDeposit` już ma `contractNumber` (tekst) — w etapie 2 dodać `contractPaymentId String? @unique` jako twardy link.

### 2. UI — `/sales/[id]` sekcja „Wpłaty"

- Lista wpłat (data, kwota, typ, status)
- Formularz dodawania (analogiczny do `AddPaymentForm` w fakturach kosztowych)
- Suma wpłacone / pozostało (z `Contract.valueGross`)

### 3. Trigger (auto-EscrowDeposit)

W endpoincie POST `ContractPayment`:
- Jeśli `Contract` należy do inwestycji **Maraf Development** I istnieje rachunek escrow dla tej inwestycji
- → utwórz `EscrowDeposit` z `amount`, `date`, `buyerName` (z `ContractClient`), `unitId` (z `ContractUnit`), `contractNumber` (z `Contract.number`)
- Zapisz `escrowDepositId` w `ContractPayment` (i odwrotnie `contractPaymentId` w deposit)
- DELETE wpłaty → kasuje powiązany deposit

**Pytanie do rozstrzygnięcia:** jak skojarzyć `Contract` → konkretny `EscrowAccount`? Opcje:
- (a) Po `investmentName` (tekstowe dopasowanie Contract.investmentName ↔ EscrowAccount.investmentName)
- (b) Dodać `Contract.escrowAccountId` (jawny wybór przy tworzeniu umowy)
- (c) Jeśli jest tylko 1 aktywny escrow dla MD — użyj go automatycznie

Rekomendacja: zacząć od (c) z fallbackiem na (b) gdy escrow >1.

### 4. Retroaktywne matchowanie

Ręczne depozyty z etapu 1 mają `contractNumber` jako tekst. Skrypt/akcja: dopasuj po `contractNumber` do istniejących `Contract` i podlinkuj (opcjonalne, nice-to-have).

## Pliki do tknięcia

```
prisma/schema.prisma                          — ContractPayment + Contract.payments + EscrowDeposit.contractPaymentId
app/(app)/sales/[id]/page.tsx                 — sekcja Wpłaty
components/sales/ContractPaymentsSection.tsx  — NOWY (lista + formularz)
app/api/sales/[id]/payments/route.ts          — NOWY (POST + trigger escrow)
app/api/sales/payments/[id]/route.ts           — NOWY (DELETE + kasowanie depositu)
```

## Uwaga o module Sprzedaż

Sprawdzić `docs/sprzedaz-decyzje.md` — sekcja „10 kierunków rozwoju" prawdopodobnie już wspomina o harmonogramie wpłat. ContractPayment to fundament również pod inne rzeczy (raport należności od nabywców, przypomnienia o ratach).

## Stan na 2026-06-03

- Rafał testuje etap 1 gdy będzie miał dane kredytu pod ręką
- Etap 2 czeka aż Rafał da zielone światło na rozbudowę Sprzedaży
- Decyzja z etapu 1: „Automat z modułu Sprzedaż" (Rafał wybrał ten wariant świadomie)
