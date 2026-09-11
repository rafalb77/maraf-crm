/* eslint-disable */
/**
 * Diagnostyka „zniknęły harmonogramy wpłat” — TYLKO ODCZYT, niczego nie zmienia.
 *
 * Drukuje wszystko, co w bazie może wyjaśnić, dlaczego raty (ContractPayment)
 * wprowadzone na kartach umów nie istnieją:
 *   A. użytkownicy i uprawnienie „sales” (bez niego POST /api/contracts/... = 403),
 *   B. logowania z AuditLog + koniec 8-godzinnego okna sesji (zapis po nim = 401),
 *   C. umowy z liczbą rat, sumą i datami utworzenia rat (które mają, które nie),
 *   D. oś czasu tworzenia rat (dzień/godzina) — gdzie praca się urywa,
 *   E. ślady po skasowanych ratach/umowach (zadania PAYMENT_DUE bez raty, pozycje
 *      wyciągu z odpiętą ratą, klienci ze statusem UMOWA bez żadnej umowy),
 *   F. umowy utworzone/zmienione w ostatnich dniach (re-kreacja kasuje raty kaskadą).
 *
 * Uruchomienie (Coolify Terminal w kontenerze CRM):
 *   node scripts/diagnose-contract-payments.js            # ostatnie 21 dni
 *   node scripts/diagnose-contract-payments.js --days=45  # dłuższe okno
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const daysArg = process.argv.find((a) => a.startsWith('--days='))
const DAYS = daysArg ? Math.max(1, parseInt(daysArg.split('=')[1], 10) || 21) : 21
const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000)
const SESSION_H = 8

const fmtDT = (d) => (d ? new Date(d).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', hour12: false }) : '—')
const fmtD = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—')
const money = (n) => (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'
const h = (t) => console.log('\n' + '='.repeat(78) + '\n' + t + '\n' + '='.repeat(78))

async function main() {
  console.log(`Diagnostyka harmonogramów wpłat — okno: ostatnie ${DAYS} dni (od ${fmtDT(since)}), teraz ${fmtDT(new Date())}`)

  // ---------- A. użytkownicy ----------
  h('A. Użytkownicy i uprawnienie „sales” (potrzebne do /api/contracts/*)')
  // Admin (NEXT_PUBLIC_ADMIN_EMAIL) ma zawsze pełny dostęp niezależnie od permissions (lib/permissions.ts).
  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase()
  const users = await prisma.user.findMany({ orderBy: { email: 'asc' } })
  for (const u of users) {
    const perms = Array.isArray(u.permissions) ? u.permissions : []
    const isAdmin = adminEmail && u.email.toLowerCase() === adminEmail
    const sales = isAdmin || perms.includes('sales')
    console.log(`  ${u.email.padEnd(32)} ${String(u.name || '').padEnd(22)} ${isAdmin ? 'ADMIN ' : '      '} sales=${sales ? 'TAK' : 'NIE'}  perms=[${perms.join(',')}]`)
  }

  // ---------- B. logowania ----------
  h(`B. Logowania (AuditLog) od ${fmtD(since)} — koniec okna sesji = login + ${SESSION_H} h`)
  const logins = await prisma.auditLog.findMany({
    where: { action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAIL'] }, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  })
  if (logins.length === 0) console.log('  (brak wpisów logowań w oknie)')
  const sessionWindows = [] // { email, from, to }
  for (const l of logins) {
    const email = l.userEmail || l.userId || '?'
    if (l.action === 'LOGIN_SUCCESS') {
      const to = new Date(new Date(l.createdAt).getTime() + SESSION_H * 3600 * 1000)
      sessionWindows.push({ email, from: new Date(l.createdAt), to })
      console.log(`  ${fmtDT(l.createdAt)}  ${email.padEnd(32)} LOGIN OK   → sesja ważna do ${fmtDT(to)}`)
    } else {
      console.log(`  ${fmtDT(l.createdAt)}  ${email.padEnd(32)} LOGIN FAIL`)
    }
  }

  // ---------- C. umowy i raty ----------
  h('C. Umowy i ich harmonogramy (wszystkie umowy poza ANULOWANA/ROZWIAZANA)')
  const contracts = await prisma.contract.findMany({
    where: { status: { notIn: ['ANULOWANA', 'ROZWIAZANA'] } },
    include: {
      client: { select: { firstName: true, lastName: true } },
      payments: { orderBy: [{ position: 'asc' }, { plannedDate: 'asc' }] },
      contractUnits: { include: { unit: { select: { number: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  })
  let withPayments = 0
  let without = 0
  const allPayments = []
  for (const c of contracts) {
    const client = c.client ? `${c.client.lastName} ${c.client.firstName}` : '—'
    const units = c.contractUnits.map((cu) => cu.unit?.number).filter(Boolean).join(', ')
    const n = c.payments.length
    if (n > 0) withPayments++
    else without++
    const sum = c.payments.reduce((s, p) => s + (p.plannedAmount || 0), 0)
    const created = c.payments.map((p) => new Date(p.createdAt).getTime())
    const range = created.length ? `${fmtDT(Math.min(...created))} … ${fmtDT(Math.max(...created))}` : '—'
    console.log(
      `\n  ${c.number.padEnd(14)} ${client.padEnd(28)} ${String(c.type).padEnd(13)} ${String(c.status).padEnd(16)} lokale: ${units || '—'}\n` +
        `     umowa utworzona ${fmtDT(c.createdAt)}, zmieniona ${fmtDT(c.updatedAt)}\n` +
        `     RATY: ${n} szt., plan ${money(sum)}; utworzone: ${range}`,
    )
    for (const p of c.payments) {
      allPayments.push({ ...p, contractNumber: c.number })
      console.log(
        `        - ${(p.title || p.type).padEnd(28)} ${money(p.plannedAmount).padStart(16)}  termin ${fmtD(p.plannedDate)}  ${String(p.status).padEnd(10)}` +
          `  dodano ${fmtDT(p.createdAt)}${Math.abs(new Date(p.updatedAt) - new Date(p.createdAt)) > 60000 ? `, zmieniono ${fmtDT(p.updatedAt)}` : ''}`,
      )
    }
  }
  console.log(`\n  Podsumowanie: umów ${contracts.length}, z harmonogramem ${withPayments}, BEZ harmonogramu ${without}.`)

  // ---------- D. oś czasu ----------
  h(`D. Oś czasu tworzenia rat od ${fmtD(since)} (dzień, godzina) + czy mieści się w oknie czyjejś sesji`)
  const recent = allPayments.filter((p) => new Date(p.createdAt) >= since).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  if (recent.length === 0) console.log('  (żadna istniejąca rata nie została utworzona w oknie — jeśli siostra pracowała w tym czasie, jej zapisy NIE dotarły do bazy albo zostały skasowane)')
  const buckets = new Map()
  for (const p of recent) {
    const d = new Date(p.createdAt)
    const key = d.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(p)
  }
  for (const [key, ps] of buckets) {
    const t = new Date(ps[0].createdAt)
    const inWindow = sessionWindows.filter((w) => t >= w.from && t <= w.to).map((w) => w.email)
    console.log(`  ${key}:00  ${String(ps.length).padStart(3)} rat  (${[...new Set(ps.map((p) => p.contractNumber))].join(', ')})  sesja: ${inWindow.length ? [...new Set(inWindow)].join(', ') : 'BRAK AKTYWNEJ SESJI wg logowań'}`)
  }
  // Ostatnia rata każdego użytkownika-okna: gdzie praca się urwała
  for (const w of sessionWindows) {
    const inW = recent.filter((p) => new Date(p.createdAt) >= w.from && new Date(p.createdAt) <= w.to)
    if (inW.length) {
      const last = inW[inW.length - 1]
      console.log(`  sesja ${w.email} ${fmtDT(w.from)}–${fmtDT(w.to)}: ${inW.length} rat, ostatnia ${fmtDT(last.createdAt)} (${last.contractNumber}); do końca sesji zostało ${Math.round((w.to - new Date(last.createdAt)) / 60000)} min`)
    }
  }

  // ---------- E. ślady po skasowaniu ----------
  h('E. Ślady po skasowanych ratach / umowach')
  const paymentIds = new Set(allPayments.map((p) => p.id))
  // zadania PAYMENT_DUE (ruleKey zawiera id raty) wskazujące na nieistniejącą ratę
  const tasks = await prisma.task.findMany({ where: { ruleKey: { startsWith: 'PAYMENT_DUE' } } })
  const orphanTasks = tasks.filter((t) => {
    const m = String(t.ruleKey).match(/PAYMENT_DUE[:_/-]+([A-Za-z0-9]+)/)
    const pid = (t.contractPaymentId !== undefined ? t.contractPaymentId : null) || (m ? m[1] : null)
    return pid && !paymentIds.has(pid)
  })
  console.log(`  Zadania PAYMENT_DUE: ${tasks.length}, z nich wskazujących na NIEISTNIEJĄCĄ ratę: ${orphanTasks.length}`)
  for (const t of orphanTasks.slice(0, 40)) console.log(`     - ${fmtDT(t.createdAt)} ${t.status.padEnd(10)} ${t.title}  (${t.ruleKey})`)
  // pozycje wyciągu z odpiętą ratą (onDelete SetNull)
  let orphanTx = []
  try {
    orphanTx = await prisma.bankTransaction.findMany({
      where: { contractPaymentId: null, matchStatus: 'MATCHED' },
      select: { id: true, bookingDate: true, amount: true, counterpartyName: true, title: true },
    })
  } catch {}
  console.log(`  Pozycje wyciągu MATCHED z odpiętą ratą (rata skasowana po dopasowaniu): ${orphanTx.length}`)
  for (const t of orphanTx.slice(0, 20)) console.log(`     - ${fmtD(t.bookingDate)} ${money(t.amount)} ${t.counterpartyName || ''} | ${t.title || ''}`)
  // klienci w statusie UMOWA/REZERWACJA bez żadnej umowy → umowa skasowana
  const clientsNoContract = await prisma.client.findMany({
    where: { status: { in: ['UMOWA', 'REZERWACJA', 'ODBIOR'] }, contracts: { none: {} } },
    select: { id: true, firstName: true, lastName: true, status: true, updatedAt: true },
  })
  console.log(`  Klienci ze statusem UMOWA/REZERWACJA/ODBIOR bez ŻADNEJ umowy (ślad skasowanej umowy): ${clientsNoContract.length}`)
  for (const c of clientsNoContract) console.log(`     - ${c.lastName} ${c.firstName} (${c.status}, zmieniony ${fmtDT(c.updatedAt)})`)

  // ---------- F. umowy utworzone/zmienione ostatnio ----------
  h(`F. Umowy utworzone lub zmienione od ${fmtD(since)} + zdarzenia historii (re-kreacja umowy kasuje raty kaskadą)`)
  const recentContracts = contracts.filter((c) => new Date(c.createdAt) >= since || new Date(c.updatedAt) >= since)
  for (const c of recentContracts) {
    console.log(`  ${c.number.padEnd(14)} utworzona ${fmtDT(c.createdAt)}  zmieniona ${fmtDT(c.updatedAt)}  raty: ${c.payments.length}`)
  }
  const history = await prisma.contractHistory.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    include: { contract: { select: { number: true } } },
  })
  console.log(`  Zdarzenia historii umów w oknie: ${history.length}`)
  for (const e of history) console.log(`     ${fmtDT(e.createdAt)}  ${String(e.contract?.number || '?').padEnd(14)} ${e.event.padEnd(20)} ${(e.details || '').slice(0, 90)}`)
  const audits = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since }, action: { in: ['CREATE', 'UPDATE', 'DELETE'] }, entity: 'Contract' },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`  AuditLog CREATE/UPDATE/DELETE dla Contract w oknie: ${audits.length}`)
  for (const a of audits) console.log(`     ${fmtDT(a.createdAt)}  ${a.userEmail || a.userId || '?'}  ${a.action} ${a.entityId || ''} ${a.path || ''}`)

  h('KONIEC — nic nie zostało zmienione. Wklej cały wynik do sesji Claude.')
}

main()
  .catch((e) => {
    console.error('BŁĄD:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
