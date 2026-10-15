// ============================================================================
// SKRYPT WYCOFANY (2026-10-15) — NIE WYKONUJE ZADNYCH ZMIAN.
//
// Byla to JEDNORAZOWA migracja statusow po wprowadzeniu statusu POBRANA
// (lipiec 2026): KSeF-owe WPROWADZONA/ZATWIERDZONA -> POBRANA + ING Leasing
// -> OPLACONA. Migracja zostala wykonana na produkcji w lipcu 2026.
//
// Dlaczego wycofany: faktury z KSeF sprzed czerwca 2026 byly AUTO-zatwierdzane
// przez stary kod bez wpisu w historii — dla tego skryptu wygladaly jak
// "nietkniete recznie" i kazde PONOWNE uruchomienie cofalo je ZATWIERDZONA ->
// POBRANA (zgloszenie: "status zatwierdzone znowu sie cofnal, np. lipiec",
// FS 1202/2026). Zadna logika produkcyjna nie zmienia juz statusow istniejacych
// faktur na POBRANA — jedyne miejsce nadajace POBRANA to utworzenie NOWEJ
// faktury przy synchronizacji KSeF.
//
// Jesli kiedys potrzebna bedzie podobna migracja — napisz nowy skrypt z guardem
// obejmujacym CALY slad czlowieka (approvals: { none: {} }) ORAZ liste
// konkretnych faktur w dry-run do recznego przegladu.
// ============================================================================

console.log('Skrypt wycofany (2026-10-15) — migracja POBRANA wykonana w lipcu 2026; nic nie zmieniono.')
console.log('Powod: ponowne uruchomienia cofaly auto-zatwierdzone faktury KSeF sprzed czerwca do POBRANA.')
process.exit(0)
