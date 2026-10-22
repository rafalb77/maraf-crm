// Protokół odbioru jako HTML — JEDNO źródło dla widoku do druku ((print)/odbiory/[id]/protokol)
// i dla PDF generowanego na serwerze (lib/odbiory/protocol-pdf.ts → mail do wykonawcy).
// Bez Tailwinda (PDF renderuje puppeteer z samego stringa) — własne klasy `pr-*` w <style>.
// assets: 'url' = obrazy jako ścieżki (/rzuty/…, /uploads/…) dla przeglądarki zalogowanego
// użytkownika; 'embed' = base64 (puppeteer nie ma sesji ani dostępu do serwera HTTP).

import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import {
  ATTENDEE_ROLE_LABELS,
  DEFECT_STATUS_LABELS,
  DEFECT_STATUS_RING,
  DEFECT_PRIORITY_LABELS,
  INSPECTION_KIND_LABELS,
  PROTOCOL_PARTIES,
  resultLabel,
  TRADE_LABELS,
  type AttendeeRole,
  type DefectStatus,
  type InspectionKind,
} from './constants'
import { formatDatePl, formatDateTimePl, unitShortLabel } from './codes'

export type ProtocolOptions = {
  withPhotos?: boolean
  mono?: boolean
  assets: 'url' | 'embed'
}

// Wymiary strony A4 w mm (@page margin 12 mm → obszar 186 × 273)
const PAGE_W = 186
const PAGE_H = 273
const ATTACHMENT_HEADER_MM = 16

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

/** Zasób z public/ jako data URL (tylko wewnątrz public/rzuty i public/uploads/odbiory). */
async function embedAsset(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  const rel = url.replace(/^\//, '')
  if (!/^(rzuty\/|uploads\/odbiory\/)/.test(rel)) return null
  const abs = path.resolve(process.cwd(), 'public', rel)
  const root = path.resolve(process.cwd(), 'public')
  if (!abs.startsWith(root + path.sep)) return null
  try {
    const buf = await fs.readFile(abs)
    const mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function loadProtocolData(inspectionId: string) {
  const r = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      sheet: true,
      subcontractor: true,
      attendees: { orderBy: { sortOrder: 'asc' } },
      defects: {
        where: { status: { not: 'ANULOWANA' } },
        include: { photos: { orderBy: { createdAt: 'asc' } }, subcontractor: { select: { name: true } } },
        orderBy: { seq: 'asc' },
      },
      investment: true,
      parent: {
        include: {
          defects: {
            where: { status: { not: 'ANULOWANA' } },
            include: { photos: { orderBy: { createdAt: 'asc' } }, subcontractor: { select: { name: true } } },
            orderBy: { seq: 'asc' },
          },
        },
      },
    },
  })
  if (!r) return null
  // Ponowny odbiór: usterki z odbioru pierwotnego; „w tym odbiorze" = ostatnia decyzja
  // odebrano / nie odebrano w oknie czasu ponownego odbioru (zdarzenia usterek).
  const defects = r.parent ? r.parent.defects : r.defects
  const verified = new Map<string, 'ODEBRANA' | 'NIE_ODEBRANA'>()
  if (r.parent) {
    const events = await prisma.defectEvent.findMany({
      where: {
        defect: { inspectionId: r.parent.id },
        event: { in: ['ODEBRANA', 'NIE_ODEBRANA'] },
        createdAt: { gte: r.startedAt, ...(r.finishedAt ? { lte: r.finishedAt } : {}) },
      },
      orderBy: { createdAt: 'asc' },
      select: { defectId: true, event: true },
    })
    for (const e of events) verified.set(e.defectId, e.event as 'ODEBRANA' | 'NIE_ODEBRANA')
  }
  const settings = await prisma.settings.findMany({ where: { key: { in: ['companyName', 'companyAddress', 'odbiory.gcName', 'odbiory.gcAddress', 'odbiory.investorName', 'odbiory.investorAddress'] } } })
  const setting = (k: string) => settings.find((s) => s.key === k)?.value || ''
  return {
    r,
    defects,
    verified,
    investorName: setting('odbiory.investorName') || setting('companyName') || PROTOCOL_PARTIES.investor.name,
    investorAddress: setting('odbiory.investorAddress') || setting('companyAddress'),
    gcName: setting('odbiory.gcName') || PROTOCOL_PARTIES.generalContractor.name,
    gcAddress: setting('odbiory.gcAddress'),
  }
}

export type ProtocolData = NonNullable<Awaited<ReturnType<typeof loadProtocolData>>>

export const PROTOCOL_CSS = `
.pr{font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35;color:#000;max-width:190mm;margin:0 auto}
.pr *{box-sizing:border-box}
.pr table{border-collapse:collapse;width:100%}
.pr th,.pr td{border:1px solid #999;padding:4px 6px;vertical-align:top;text-align:left}
.pr th{background:#eee;font-weight:700}
.pr .pr-small{font-size:11px}
.pr .pr-xs{font-size:10px;color:#444}
.pr .pr-title{font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.pr .pr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.pr .pr-mono{font-family:"Courier New",monospace}
.pr .pr-b{font-weight:700}
.pr .pr-sec{margin-top:14px;font-weight:700}
.pr .pr-mt{margin-top:6px}
.pr .pr-sig{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:18px 32px}
.pr .pr-sig-box{text-align:center;page-break-inside:avoid}
.pr .pr-sig-img{height:22mm;display:flex;align-items:flex-end;justify-content:center}
.pr .pr-sig-img img{max-height:22mm;max-width:60mm;object-fit:contain}
.pr .pr-sig-line{border-top:1px solid #000;padding-top:3px}
.pr .pr-page{page-break-before:always}
.pr .pr-avoid{page-break-inside:avoid}
.pr .pr-plan{margin:4px auto 0;overflow:hidden}
.pr .pr-photos{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.pr .pr-photo{border:1px solid #bbb;padding:6px;page-break-inside:avoid}
.pr .pr-photo img{height:42mm;width:auto;max-width:80mm;object-fit:contain}
.pr .pr-center{text-align:center}
.pr .pr-note{font-size:9px;color:#444;margin-top:10px}
@page{size:A4 portrait;margin:12mm}
`

/** HTML protokołu (bez <html>/<body>); dla PDF opakuj w pełny dokument (patrz protocol-pdf.ts). */
export async function renderProtocolHtml(data: ProtocolData, opts: ProtocolOptions): Promise<string> {
  const { r, defects, verified, investorName, investorAddress, gcName, gcAddress } = data
  const isRe = !!r.parent
  const withPhotos = !!opts.withPhotos
  const mono = !!opts.mono
  const asset = async (u: string | null | undefined) => (opts.assets === 'embed' ? await embedAsset(u) : u || null)

  const present = r.attendees.filter((a) => a.present)
  const absent = r.attendees.filter((a) => !a.present)
  const open = defects.filter((d) => d.status === 'DO_POPRAWY' || d.status === 'POPRAWIONA' || d.status === 'SPORNA')
  const byContractor = new Map<string, typeof defects>()
  for (const d of defects) {
    const k = d.subcontractor?.name || 'Nieprzypisane'
    byContractor.set(k, [...(byContractor.get(k) || []), d])
  }
  const dueDates = defects.map((d) => d.dueAt).filter((d): d is Date => !!d)
  const dueAt = r.fixDueAt || (dueDates.length ? new Date(Math.max(...dueDates.map((d) => d.getTime()))) : null)
  const ring = (status: string) => (mono ? '#111' : DEFECT_STATUS_RING[status as DefectStatus] || '#dc2626')
  const isRoboty = r.kind === 'ROBOTY'

  const sheet = r.sheet
  const aspect = sheet ? sheet.width / sheet.height : 1.5
  const rotate = aspect >= 1.15
  const availH = PAGE_H - ATTACHMENT_HEADER_MM
  const planLong = rotate ? Math.min(availH, PAGE_W * aspect) : Math.min(PAGE_W, availH * aspect)
  const planShort = planLong / aspect
  const pinR = sheet ? Math.max(9, Math.round(sheet.width / 90)) : 12
  const sheetSrc = sheet ? await asset(sheet.imageUrl) : null

  type Signer = { id: string; name: string; company: string | null; role: string; signatureUrl: string | null; signedAt: Date | null }
  const signers: Signer[] = present.length
    ? present.map((a) => ({ id: a.id, name: a.name, company: a.company, role: a.role, signatureUrl: a.signatureUrl, signedAt: a.signedAt }))
    : [
        { id: 'gw', name: r.inspectorName || 'Prowadzący odbiór', company: gcName, role: 'PRZEDSTAWICIEL_GW', signatureUrl: null, signedAt: null },
        { id: 'sub', name: r.subcontractor?.name || 'Wykonawca robót', company: null, role: 'WYKONAWCA', signatureUrl: null, signedAt: null },
      ]
  const signerBlocks: string[] = []
  for (const a of signers.slice(0, 6)) {
    const src = await asset(a.signatureUrl)
    signerBlocks.push(`<div class="pr-sig-box">
      <div class="pr-sig-img">${src ? `<img src="${src}" alt="podpis">` : ''}</div>
      <div class="pr-sig-line">${esc(a.name)}${a.company ? `, ${esc(a.company)}` : ''}</div>
      <div class="pr-xs">${esc(ATTENDEE_ROLE_LABELS[a.role as AttendeeRole] || 'podpis')}${a.signedAt ? ` · podpis elektroniczny ${formatDateTimePl(a.signedAt)}` : ''}</div>
    </div>`)
  }

  const kindTitle = isRe
    ? 'Protokół ponownego odbioru robót'
    : isRoboty
    ? 'Protokół odbioru robót'
    : `Protokół ${(INSPECTION_KIND_LABELS[r.kind as InspectionKind] || 'odbiór').toLowerCase().replace('odbiór ', 'odbioru ')}`

  const attendeesRows = r.attendees.length
    ? r.attendees
        .map(
          (a, i) =>
            `<tr><td>${i + 1}</td><td>${esc(a.name)}</td><td>${esc(a.company || '')}</td><td>${esc(ATTENDEE_ROLE_LABELS[a.role as AttendeeRole] || a.role)}</td><td${a.present ? '' : ' class="pr-b"'}>${a.present ? 'obecny' : 'nie stawił się'}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="5" class="pr-xs">Nie wpisano obecnych.</td></tr>'

  const pins = defects
    .map(
      (d) =>
        `<g><circle cx="${d.x}" cy="${d.y}" r="${pinR}" fill="#fff" stroke="${ring(d.status)}" stroke-width="${Math.max(2, pinR / 4)}"/><text x="${d.x}" y="${d.y + pinR * 0.38}" text-anchor="middle" font-size="${pinR * 1.05}" font-weight="700" font-family="Arial, sans-serif" fill="#111">${d.seq}</text></g>`,
    )
    .join('')
  const planStyleOuter = rotate ? `width:${planShort}mm;height:${planLong}mm` : `width:${planLong}mm;height:${planShort}mm`
  const planStyleSvg = rotate
    ? `width:${planLong}mm;height:${planShort}mm;transform-origin:0 0;transform:translate(${planShort}mm,0) rotate(90deg);display:block`
    : `width:${planLong}mm;height:${planShort}mm;display:block`

  const legendRows = defects
    .map(
      (d) => `<tr class="pr-avoid">
        <td class="pr-center pr-b">${d.seq}</td>
        <td class="pr-mono">${esc(d.code)}</td>
        <td>${d.unitNumber ? esc(unitShortLabel(d.unitNumber)) : 'część wspólna'}${d.room ? ` / ${esc(d.room)}` : ''}</td>
        <td><b>${esc(d.title)}</b>${d.description ? `<div>${esc(d.description)}</div>` : ''}</td>
        <td>${d.trade ? esc(TRADE_LABELS[d.trade as keyof typeof TRADE_LABELS] || d.trade) : ''}</td>
        <td>${esc(d.subcontractor?.name || '')}</td>
        <td>${d.dueAt ? formatDatePl(d.dueAt) : ''}</td>
        <td>${esc(DEFECT_PRIORITY_LABELS[d.priority as keyof typeof DEFECT_PRIORITY_LABELS] || d.priority)}</td>
        <td>${esc(DEFECT_STATUS_LABELS[d.status as DefectStatus] || d.status)}</td>
        ${isRe ? `<td class="pr-b">${verified.get(d.id) === 'ODEBRANA' ? 'odebrana' : verified.get(d.id) === 'NIE_ODEBRANA' ? 'nie odebrana' : '—'}</td>` : ''}
      </tr>`,
    )
    .join('')

  const contractorRows = [...byContractor.entries()]
    .map(([name, list]) => {
      const due = list.map((d) => d.dueAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0]
      return `<tr><td>${esc(name)}</td><td>${list.map((d) => d.seq).join(', ')}</td><td>${list.length}</td><td>${list.filter((d) => d.priority === 'PILNY').length}</td><td>${due ? formatDatePl(due) : ''}</td></tr>`
    })
    .join('')

  let photosHtml = ''
  if (withPhotos && defects.some((d) => d.photos.length)) {
    const blocks: string[] = []
    for (const d of defects) {
      if (!d.photos.length) continue
      const imgs: string[] = []
      for (const p of d.photos) {
        const src = await asset(p.url)
        if (!src) continue
        imgs.push(`<div class="pr-center"><img src="${src}" alt=""><div class="pr-xs">${p.phase === 'PO' ? 'po naprawie' : 'przed'} · ${formatDatePl(p.createdAt)}</div></div>`)
      }
      blocks.push(`<div class="pr-photo"><div class="pr-small" style="margin-bottom:4px"><b>${d.seq}</b> · ${esc(d.code)} · ${esc(d.title)}${d.unitNumber ? ` · ${esc(unitShortLabel(d.unitNumber))}` : ''}</div><div style="display:flex;flex-wrap:wrap;gap:4px">${imgs.join('')}</div></div>`)
    }
    photosHtml = `<div class="pr-page"><div style="font-size:15px;font-weight:700">Załącznik nr 2 — dokumentacja fotograficzna</div><div class="pr-photos">${blocks.join('')}</div></div>`
  }

  return `<div class="pr">
  <div class="pr-head">
    <div>
      <div class="pr-title">${esc(kindTitle)}</div>
      <div style="font-size:13px">${r.stage && !r.scopeName.startsWith(r.stage) ? `${esc(r.stage)} · ` : ''}${esc(r.scopeName)}</div>
    </div>
    <div style="text-align:right">
      <div class="pr-mono pr-b" style="font-size:13px">${esc(r.number)}</div>
      <div>${formatDatePl(r.finishedAt || r.startedAt)}</div>
    </div>
  </div>

  <table style="margin-top:14px">
    <tbody>
      <tr><th style="width:32%">Inwestycja</th><td>${esc(r.investment.name)}${r.investment.address ? `, ${esc(r.investment.address)}` : ''}</td></tr>
      <tr><th>Inwestor</th><td>${esc(investorName)}${investorAddress ? `, ${esc(investorAddress)}` : ''}, NIP ${PROTOCOL_PARTIES.investor.nip}</td></tr>
      <tr><th>Generalny wykonawca (zamawiający roboty)</th><td>${esc(gcName)}${gcAddress ? `, ${esc(gcAddress)}` : ''}, NIP ${PROTOCOL_PARTIES.generalContractor.nip}</td></tr>
      <tr><th>Wykonawca robót</th><td>${r.subcontractor ? `${esc(r.subcontractor.name)}${r.subcontractor.address ? `, ${esc(r.subcontractor.address)}` : ''}${r.subcontractor.nip ? `, NIP ${esc(r.subcontractor.nip)}` : ''}` : '—'}</td></tr>
      ${isRe && r.parent ? `<tr><th>Dotyczy protokołu</th><td>${esc(r.parent.number)} z dnia ${formatDatePl(r.parent.finishedAt || r.parent.startedAt)} — sprawdzenie usunięcia usterek</td></tr>` : ''}
      <tr><th>Przedmiot odbioru</th><td>${esc(r.stage || INSPECTION_KIND_LABELS[r.kind as InspectionKind])} — ${esc([r.building, r.staircase ? `klatka ${r.staircase}` : null, r.sheet?.name].filter(Boolean).join(', '))}</td></tr>
      <tr><th>Data i miejsce</th><td>${formatDateTimePl(r.startedAt)}${r.finishedAt ? ` – ${formatDateTimePl(r.finishedAt)}` : ''}, ${esc(r.investment.address || r.investment.name)}</td></tr>
      <tr><th>Prowadzący odbiór</th><td>${esc(r.inspectorName || '—')} (przedstawiciel generalnego wykonawcy)</td></tr>
    </tbody>
  </table>

  <div class="pr-sec">1. Komisja / osoby obecne</div>
  <table class="pr-mt">
    <thead><tr><th style="width:8mm">Lp.</th><th>Imię i nazwisko</th><th>Firma</th><th>Rola</th><th style="width:24mm">Obecność</th></tr></thead>
    <tbody>${attendeesRows}</tbody>
  </table>
  ${absent.length ? `<p class="pr-mt">Mimo zawiadomienia nie stawił(a/i) się: ${esc(absent.map((a) => `${a.name}${a.company ? ` (${a.company})` : ''}`).join(', '))}. Odbiór przeprowadzono w obecności ${present.length} osób.</p>` : ''}

  <div class="pr-sec">2. Ustalenia</div>
  <table class="pr-mt">
    <tbody>
      <tr><th style="width:32%">Wynik odbioru</th><td class="pr-b">${r.result ? esc(resultLabel(r.kind, r.result)) : 'odbiór w toku — wynik nie został jeszcze ustalony'}</td></tr>
      ${isRe ? `<tr><th>Usterki objęte sprawdzeniem</th><td>${defects.length} z protokołu ${esc(r.parent?.number || '')}; w tym odbiorze odebrano ${[...verified.values()].filter((v) => v === 'ODEBRANA').length}, nie odebrano ${[...verified.values()].filter((v) => v === 'NIE_ODEBRANA').length}</td></tr><tr><th>Stan po tym odbiorze</th><td>odebrane łącznie ${defects.filter((d) => d.status === 'ODEBRANA').length}, nadal do poprawy ${defects.filter((d) => d.status === 'DO_POPRAWY').length}, zgłoszone jako poprawione (do sprawdzenia) ${defects.filter((d) => d.status === 'POPRAWIONA').length}, sporne ${defects.filter((d) => d.status === 'SPORNA').length}</td></tr>` : `<tr><th>Liczba stwierdzonych usterek</th><td>${defects.length}, w tym pilnych ${defects.filter((d) => d.priority === 'PILNY').length}; otwartych ${open.length}, odebranych ${defects.filter((d) => d.status === 'ODEBRANA').length}</td></tr>`}
      <tr><th>Termin usunięcia usterek</th><td>${dueAt ? formatDatePl(dueAt) : 'wg terminów przy poszczególnych pozycjach w załączniku'}</td></tr>
      <tr><th>Uwagi</th><td style="white-space:pre-wrap">${esc(r.notes || '—')}</td></tr>
    </tbody>
  </table>
  <p style="margin-top:8px">${isRe ? `Komisja sprawdziła usunięcie usterek stwierdzonych w protokole ${esc(r.parent?.number || '')}. Usterki oznaczone jako odebrane uznaje się za usunięte. Usterki pozostające w statusie „do poprawy" wykonawca robót usunie w podanych terminach i ponownie zgłosi do odbioru. Załącznik nr 1 (rzut ze stanem usterek, legenda i lista wad z wynikiem sprawdzenia) stanowi integralną część protokołu.` : `Wykonawca robót zobowiązuje się usunąć usterki wymienione w załączniku w podanych terminach i zgłosić je do ponownego odbioru. Stwierdzone usterki nieistotne nie wstrzymują odbioru; ich usunięcie zostanie potwierdzone protokołem ponownego odbioru. Załącznik nr 1 (rzut z zaznaczeniem usterek, legenda i szczegółowa lista wad) stanowi integralną część protokołu.`}</p>

  <div class="pr-sig">${signerBlocks.join('')}</div>
  ${present.some((a) => a.signatureUrl) ? `<p class="pr-note">Podpisy złożone odręcznie na urządzeniu mobilnym generalnego wykonawcy w dniu odbioru; czas złożenia, konto użytkownika i urządzenie zapisane w rejestrze systemu CRM MARAF (forma dokumentowa, art. 77² Kodeksu cywilnego).</p>` : ''}

  <div class="pr-page">
    <div style="font-size:13px;font-weight:700">Załącznik nr 1 do protokołu ${esc(r.number)} — rzut z zaznaczeniem usterek (${esc(r.sheet?.name || '')})</div>
    <div class="pr-xs">Numer w kółku = numer usterki (stały). ${mono ? 'Obwódki czarno-białe.' : 'Kolor obwódki: czerwony do poprawy, pomarańczowy zgłoszona jako poprawiona, zielony odebrana, fioletowy sporna.'}${rotate ? ' Rysunek obrócony o 90° — obróć kartkę.' : ''}</div>
    ${
      sheet && sheetSrc
        ? `<div class="pr-plan" style="${planStyleOuter}"><svg viewBox="0 0 ${sheet.width} ${sheet.height}" role="img" aria-label="Rzut z pinezkami usterek" style="${planStyleSvg}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect x="0" y="0" width="${sheet.width}" height="${sheet.height}" fill="#fff" stroke="#999" stroke-width="2"/><image href="${sheetSrc}" xlink:href="${sheetSrc}" x="0" y="0" width="${sheet.width}" height="${sheet.height}"/>${pins}</svg></div>`
        : '<p class="pr-xs" style="margin-top:8px">Brak arkusza rzutu dla tego odbioru.</p>'
    }
  </div>

  <div class="pr-page">
    <div class="pr-b">Legenda usterek (${defects.length}) — ${esc(r.number)}</div>
    <table class="pr-mt pr-small">
      <thead><tr><th style="width:8mm">Nr</th><th>Kod</th><th>Lokal / pom.</th><th>Usterka</th><th>Branża</th><th>Wykonawca</th><th style="width:20mm">Termin</th><th style="width:16mm">Prior.</th><th style="width:24mm">Status</th>${isRe ? '<th style="width:22mm">Ten odbiór</th>' : ''}</tr></thead>
      <tbody>${legendRows}</tbody>
    </table>
    <div class="pr-sec">Zestawienie wg wykonawców</div>
    <table class="pr-mt pr-small">
      <thead><tr><th>Wykonawca</th><th>Usterki (nr)</th><th style="width:16mm">Razem</th><th style="width:16mm">Pilne</th><th style="width:22mm">Najbliższy termin</th></tr></thead>
      <tbody>${contractorRows}</tbody>
    </table>
    ${photosHtml}
  </div>
</div>`
}

export async function buildProtocolHtml(inspectionId: string, opts: ProtocolOptions): Promise<{ html: string; data: ProtocolData } | null> {
  const data = await loadProtocolData(inspectionId)
  if (!data) return null
  const html = await renderProtocolHtml(data, opts)
  return { html, data }
}

export function protocolFilename(number: string, scopeName: string): string {
  const base = `${number}-${scopeName}`
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => ({ ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z', Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z' })[c] || c)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `protokol-${base}.pdf`
}
