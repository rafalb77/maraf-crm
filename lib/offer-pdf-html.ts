// Server-side rendering HTML oferty do PDF.
// Reuses te same dane co widok /oferty/[id]/druk, ale jako pure string HTML
// (bez Next.js Image, bez React DOM) zeby Puppeteer mogl zrenderowac
// niezaleznie od auth/network.
//
// Obrazki sa embedded jako base64 data URLs.

import { promises as fs } from 'fs'
import path from 'path'

async function imageToDataUrl(filename: string): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), 'public', filename)
    const buffer = await fs.readFile(filePath)
    const ext = path.extname(filename).slice(1).toLowerCase()
    const mime = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mime};base64,${buffer.toString('base64')}`
  } catch (e) {
    console.warn('[offer-pdf-html] missing image:', filename)
    return ''
  }
}

const TYPE_LABELS: Record<string, string> = {
  MIESZKALNY: 'Mieszkanie',
  USLUGOWY: 'Usługowy',
  PARKING: 'Miejsce postojowe',
  GARAZ: 'Garaż',
  KOMORKA: 'Komórka',
}

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function escapeHtml(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const NAVY = '#2C3E54'
const GOLD = '#C9A37A'
const GOLD_DARK = '#8B6F47'

export type OfferForPdf = {
  number: string | null
  title: string | null
  createdAt: Date
  validUntil: Date | null
  notes: string | null
  subtotalNet: number
  subtotalGross: number
  totalDiscountNet: number
  totalDiscountGross: number
  totalNet: number
  totalGross: number
  client: {
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
  } | null
  items: Array<{
    id: string
    label: string
    unitType: string
    area: number
    priceGross: number
    finalGross: number
    discountValue: number
    discountType: string
  }>
}

export async function getOfferPdfHtml(
  offer: OfferForPdf,
  settingsMap: Record<string, string>,
): Promise<string> {
  const logoMaraf = await imageToDataUrl('logo-icon-light.png')
  const logoNova = await imageToDataUrl('logo-novastaffa.png')

  const itemsHtml = offer.items
    .map(
      (it, idx) => `
        <tr style="border-bottom: 1px solid #E2DCD0;">
          <td style="padding: 8px; color: #6b7280;">${idx + 1}.</td>
          <td style="padding: 8px;">${escapeHtml(TYPE_LABELS[it.unitType] || it.unitType)}</td>
          <td style="padding: 8px; font-family: ui-monospace, monospace; font-weight: 500;">${escapeHtml(it.label)}</td>
          <td style="padding: 8px; text-align: right; font-variant-numeric: tabular-nums;">${it.area > 0 ? `${it.area.toFixed(2)} m²` : '—'}</td>
          <td style="padding: 8px; text-align: right; font-variant-numeric: tabular-nums;">${fmt(it.priceGross)}</td>
          <td style="padding: 8px; text-align: right; font-variant-numeric: tabular-nums; color: #BE185D;">
            ${it.discountValue > 0
              ? (it.discountType === 'PCT' ? `−${it.discountValue}%` : `−${fmt(it.discountValue)}`)
              : '—'}
          </td>
          <td style="padding: 8px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; border-left: 2px solid ${GOLD}; color: ${NAVY};">
            ${fmt(it.finalGross)}
          </td>
        </tr>`,
    )
    .join('')

  const bullets = [
    'Sąsiedztwo <strong>Lasu Krogulec</strong> — spacery, jogging, świeże powietrze',
    'Windy w <strong>każdej klatce</strong> + plac zabaw',
    'Loggie lub balkony w <strong>każdym mieszkaniu</strong>',
    'Możliwość montażu <strong>stacji ładowania EV</strong> na parkingach zewnętrznych',
    'ŁKA, autobus i rower miejski w <strong>300 m</strong>',
    '<strong>Zielone dachy</strong> z roślinnością ekstensywną',
    'Mieszkania <strong>1–4 pokojowe</strong> z przemyślanymi metrażami',
    '<strong>Doświadczony deweloper</strong> — Maraf Development',
  ]
  const bulletsHtml = bullets
    .map(
      (b) => `<div style="display: flex; gap: 8px; align-items: flex-start;">
        <span style="color: ${GOLD_DARK}; font-weight: 700;">·</span>
        <span>${b}</span>
      </div>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Oferta ${escapeHtml(offer.number || '')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: ${NAVY};
      background: white;
      font-size: 11px;
      line-height: 1.5;
    }
    .doc { max-width: 186mm; margin: 0 auto; padding: 0; }
    .gold-line { background: linear-gradient(90deg, ${GOLD} 0%, ${GOLD_DARK} 50%, ${GOLD} 100%); height: 2px; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <div class="doc">

    <!-- HEADER -->
    <header style="display: flex; align-items: center; justify-content: space-between; gap: 24px;">
      <div style="width: 220px; height: 64px; display: flex; align-items: center;">
        ${logoMaraf ? `<img src="${logoMaraf}" alt="MARAF Development" style="max-width: 100%; max-height: 100%; object-fit: contain; object-position: left;" />` : '<div style="font-weight: 700; color: ' + NAVY + '; font-size: 14px;">MARAF Development</div>'}
      </div>
      <div style="width: 90px; height: 90px; display: flex; align-items: center; justify-content: flex-end;">
        ${logoNova ? `<img src="${logoNova}" alt="Nova Staffa" style="max-width: 100%; max-height: 100%; object-fit: contain; object-position: right;" />` : ''}
      </div>
    </header>
    <div class="gold-line" style="margin-top: 16px;"></div>

    <!-- META -->
    <section style="margin-top: 20px;">
      <div style="display: flex; align-items: flex-end; justify-content: space-between;">
        <div>
          <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: ${GOLD_DARK};">Oferta indywidualna</p>
          <h1 style="font-size: 28px; font-weight: 700; margin-top: 4px; line-height: 1; color: ${NAVY};">${escapeHtml(offer.number || 'OFERTA')}</h1>
          ${offer.title ? `<p style="font-size: 13px; margin-top: 8px; color: #6b7280;">${escapeHtml(offer.title)}</p>` : ''}
        </div>
        <div style="text-align: right; font-size: 11px; color: #6b7280;">
          <p>Data wystawienia: <strong>${new Date(offer.createdAt).toLocaleDateString('pl-PL')}</strong></p>
          ${offer.validUntil ? `<p style="margin-top: 2px;">Ważna do: <strong style="color: ${GOLD_DARK};">${new Date(offer.validUntil).toLocaleDateString('pl-PL')}</strong></p>` : ''}
        </div>
      </div>
    </section>

    <!-- CLIENT -->
    ${
      offer.client
        ? `<section style="margin-top: 20px; padding: 16px; background: #F7F5F1; border-left: 3px solid ${GOLD}; border-radius: 6px;">
            <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 4px;">Adresat</p>
            <p style="font-size: 14px; font-weight: 600; color: ${NAVY};">${escapeHtml(offer.client.firstName)} ${escapeHtml(offer.client.lastName)}</p>
            <div style="display: flex; gap: 16px; font-size: 11px; color: #6b7280; margin-top: 4px;">
              ${offer.client.email ? `<span>✉ ${escapeHtml(offer.client.email)}</span>` : ''}
              ${offer.client.phone ? `<span>☎ ${escapeHtml(offer.client.phone)}</span>` : ''}
            </div>
          </section>`
        : ''
    }

    <!-- INWESTYCJA -->
    <section style="margin-top: 24px;">
      <h2 style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 8px; color: ${GOLD_DARK};">Inwestycja</h2>
      <h3 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: ${NAVY};">
        Nova Staffa <span style="font-size: 14px; font-weight: 400; color: #6b7280;">— Zgierz</span>
      </h3>
      <p style="font-size: 12px; line-height: 1.6; color: #4b5563; margin-bottom: 12px;">
        Nowoczesny kompleks mieszkaniowy łączący zalety natury z wygodą miasta.
        Bezpośrednie sąsiedztwo <strong>Lasu Krogulec</strong> w zacisznej części Zgierza,
        z doskonałą komunikacją do <strong>centrum Zgierza i Łodzi</strong>.
      </p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 11px; color: #4b5563;">
        ${bulletsHtml}
      </div>
    </section>

    <div class="gold-line" style="margin: 24px 0;"></div>

    <!-- TABLE -->
    <section>
      <h2 style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 12px; color: ${GOLD_DARK};">Propozycja ofertowa</h2>
      <table style="font-size: 11px;">
        <thead>
          <tr style="background: ${NAVY}; color: white;">
            <th style="text-align: left; padding: 8px; font-weight: 500; width: 5%;">Lp.</th>
            <th style="text-align: left; padding: 8px; font-weight: 500; width: 15%;">Typ</th>
            <th style="text-align: left; padding: 8px; font-weight: 500; width: 14%;">Numer</th>
            <th style="text-align: right; padding: 8px; font-weight: 500; width: 11%;">Pow.</th>
            <th style="text-align: right; padding: 8px; font-weight: 500; width: 17%;">Cena brutto</th>
            <th style="text-align: right; padding: 8px; font-weight: 500; width: 12%;">Rabat</th>
            <th style="text-align: right; padding: 8px; font-weight: 600; width: 26%; border-left: 2px solid ${GOLD};">Po rabacie brutto</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="background: #F1EEE7;">
            <td colspan="4" style="padding: 8px; text-align: right; font-weight: 600; color: ${NAVY};">RAZEM</td>
            <td style="padding: 8px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600;">${fmt(offer.subtotalGross)}</td>
            <td style="padding: 8px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: #BE185D;">
              ${offer.totalDiscountGross > 0 ? `−${fmt(offer.totalDiscountGross)}` : '—'}
            </td>
            <td style="padding: 8px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; border-left: 2px solid ${GOLD}; color: ${NAVY};">
              ${fmt(offer.totalGross)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>

    <!-- HIGHLIGHTS -->
    <section style="margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
      <div style="padding: 12px; background: #F7F5F1; border: 1px solid #E2DCD0; border-radius: 4px;">
        <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af;">Suma brutto przed rabatem</p>
        <p style="font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; color: ${NAVY};">${fmt(offer.subtotalGross)} zł</p>
      </div>
      <div style="padding: 12px; background: #FFF1F2; border: 1px solid #FECDD3; border-radius: 4px;">
        <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9F1239;">Łączny rabat brutto</p>
        <p style="font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; color: #9F1239;">
          ${offer.totalDiscountGross > 0 ? `−${fmt(offer.totalDiscountGross)}` : '0,00'} zł
        </p>
      </div>
      <div style="padding: 12px; background: ${NAVY}; color: white; border-radius: 4px;">
        <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: ${GOLD};">Do zapłaty (brutto)</p>
        <p style="font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px;">${fmt(offer.totalGross)} zł</p>
      </div>
    </section>

    ${
      offer.notes
        ? `<section style="margin-top: 20px; padding: 16px; background: #F7F5F1; border: 1px solid #E2DCD0; border-radius: 6px;">
            <h3 style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 8px;">Warunki / uwagi</h3>
            <p style="font-size: 11px; white-space: pre-wrap; color: #4b5563;">${escapeHtml(offer.notes)}</p>
          </section>`
        : ''
    }

    ${
      settingsMap.bankAccount
        ? `<section style="margin-top: 20px;">
            <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af;">Numer konta bankowego</p>
            <p style="font-size: 11px; font-family: ui-monospace, monospace; margin-top: 2px; color: ${NAVY};">${escapeHtml(settingsMap.bankAccount)}</p>
          </section>`
        : ''
    }

    <!-- FOOTER -->
    <footer style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #E2DCD0; font-size: 10px; color: #9ca3af;">
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <p style="font-weight: 600; color: ${NAVY};">${escapeHtml(settingsMap.companyName || 'MARAF Development')}</p>
          <p>Biuro: ul. Struga 23, 95-100 Zgierz</p>
          <p>www.novastaffa.pl · biuro@novastaffa.pl</p>
        </div>
        <div style="text-align: right;">
          <p>Oferta wystawiona przez system CRM Maraf</p>
          <p>${new Date().toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</p>
        </div>
      </div>
      ${
        settingsMap.emailSignature
          ? `<div style="margin-top: 12px; color: #6b7280; white-space: pre-wrap;">${escapeHtml(settingsMap.emailSignature)}</div>`
          : ''
      }
    </footer>

  </div>
</body>
</html>`
}
