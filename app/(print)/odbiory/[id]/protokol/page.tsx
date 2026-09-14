import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  ATTENDEE_ROLE_LABELS,
  DEFECT_STATUS_LABELS,
  DEFECT_STATUS_RING,
  DEFECT_PRIORITY_LABELS,
  INSPECTION_KIND_LABELS,
  INSPECTION_RESULT_LABELS,
  PROTOCOL_PARTIES,
  TRADE_LABELS,
  type AttendeeRole,
  type DefectStatus,
  type InspectionKind,
  type InspectionResult,
} from '@/lib/odbiory/constants'
import { formatDatePl, formatDateTimePl, unitShortLabel } from '@/lib/odbiory/codes'

// Wymiary strony A4 w mm (@page margin 12 mm → obszar 186 × 273)
const PAGE_W = 186
const PAGE_H = 273
const ATTACHMENT_HEADER_MM = 16 // tytuł + opis nad rzutem

/**
 * /odbiory/[id]/protokol — widok do druku (route group (print), białe tło, bez chrome).
 * Strona 1: formalny protokół (strony: inwestor, generalny wykonawca, wykonawca robót;
 * obecni; wynik; podsumowanie; podpisy). Strona 2: załącznik — rzut obrócony o 90°, na całą
 * stronę (czytelność wymiarów), pinezki obracają się razem z rysunkiem. Dalej legenda,
 * zestawienie wg wykonawców, opcjonalnie zdjęcia.
 * ?zdjecia=1 dołącza zdjęcia; ?kolor=0 pinezki czarno-białe.
 */
export default async function ProtokolPage({ params, searchParams }: { params: { id: string }; searchParams?: Record<string, string | undefined> }) {
  const withPhotos = searchParams?.zdjecia === '1'
  const mono = searchParams?.kolor === '0'
  const r = await prisma.inspection.findUnique({
    where: { id: params.id },
    include: {
      sheet: true,
      subcontractor: true,
      attendees: { orderBy: { sortOrder: 'asc' } },
      defects: { where: { status: { not: 'ANULOWANA' } }, include: { photos: { orderBy: { createdAt: 'asc' } }, subcontractor: { select: { name: true } } }, orderBy: { seq: 'asc' } },
      investment: true,
    },
  })
  if (!r) notFound()
  const settings = await prisma.settings.findMany({ where: { key: { in: ['companyName', 'companyAddress', 'odbiory.gcName', 'odbiory.gcAddress', 'odbiory.investorName', 'odbiory.investorAddress'] } } })
  const setting = (k: string) => settings.find((s) => s.key === k)?.value || ''
  const investorName = setting('odbiory.investorName') || setting('companyName') || PROTOCOL_PARTIES.investor.name
  const investorAddress = setting('odbiory.investorAddress') || setting('companyAddress')
  const gcName = setting('odbiory.gcName') || PROTOCOL_PARTIES.generalContractor.name
  const gcAddress = setting('odbiory.gcAddress')

  const present = r.attendees.filter((a) => a.present)
  const absent = r.attendees.filter((a) => !a.present)
  const open = r.defects.filter((d) => d.status === 'DO_POPRAWY' || d.status === 'POPRAWIONA' || d.status === 'SPORNA')
  const byContractor = new Map<string, typeof r.defects>()
  for (const d of r.defects) {
    const k = d.subcontractor?.name || 'Nieprzypisane'
    byContractor.set(k, [...(byContractor.get(k) || []), d])
  }
  const dueDates = r.defects.map((d) => d.dueAt).filter((d): d is Date => !!d)
  const dueAt = r.fixDueAt || (dueDates.length ? new Date(Math.max(...dueDates.map((d) => d.getTime()))) : null)
  const ring = (status: string) => (mono ? '#111' : DEFECT_STATUS_RING[status as DefectStatus] || '#dc2626')

  // Rzut: obrót o 90° na stronę pionową (długi bok rysunku wzdłuż wysokości strony)
  const sheet = r.sheet
  const aspect = sheet ? sheet.width / sheet.height : 1.5
  const rotate = aspect >= 1.15
  const availH = PAGE_H - ATTACHMENT_HEADER_MM
  const planLong = rotate ? Math.min(availH, PAGE_W * aspect) : Math.min(PAGE_W, availH * aspect)
  const planShort = planLong / aspect
  const pinR = sheet ? Math.max(9, Math.round(sheet.width / 90)) : 12
  const isRoboty = r.kind === 'ROBOTY'
  const signers = present.length
    ? present
    : [
        { id: 'gw', name: r.inspectorName || 'Prowadzący odbiór', company: gcName, role: 'PRZEDSTAWICIEL_GW' },
        { id: 'sub', name: r.subcontractor?.name || 'Wykonawca robót', company: '', role: 'WYKONAWCA' },
      ]

  return (
    <div className="mx-auto max-w-[190mm] p-6 text-[12px] leading-snug text-black print:p-0" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { .no-print { display: none } .page-break { page-break-before: always } .avoid-break { page-break-inside: avoid } } table { border-collapse: collapse; width: 100% } th, td { border: 1px solid #999; padding: 4px 6px; vertical-align: top } th { background: #eee; text-align: left; font-weight: 700 }`}</style>

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-md border border-gray-300 bg-gray-50 p-2 text-[13px]">
        <span>Widok do druku — „Drukuj → Zapisz jako PDF”. Rzut jest obrócony na całą stronę A4.</span>
        <a href={`/odbiory/${r.id}/protokol?${withPhotos ? '' : 'zdjecia=1'}${mono ? (withPhotos ? 'kolor=0' : '&kolor=0') : ''}`} className="rounded border border-gray-400 bg-white px-2 py-1">{withPhotos ? 'Bez zdjęć' : 'Ze zdjęciami'}</a>
        <a href={`/odbiory/${r.id}/protokol?${withPhotos ? 'zdjecia=1&' : ''}kolor=${mono ? '1' : '0'}`} className="rounded border border-gray-400 bg-white px-2 py-1">{mono ? 'Pinezki kolorowe' : 'Pinezki czarno-białe'}</a>
        <a href={`/odbiory/${r.id}`} className="ml-auto text-blue-700 underline">Wróć do karty</a>
      </div>

      {/* ===== PROTOKÓŁ ===== */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[18px] font-bold uppercase tracking-wide">
            {isRoboty ? 'Protokół odbioru robót' : `Protokół ${INSPECTION_KIND_LABELS[r.kind as InspectionKind]?.toLowerCase().replace('odbiór ', 'odbioru ') || 'odbioru'}`}
          </div>
          <div className="text-[13px]">{r.stage ? `${r.stage} · ` : ''}{r.scopeName}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[13px] font-bold">{r.number}</div>
          <div>{formatDatePl(r.finishedAt || r.startedAt)}</div>
        </div>
      </div>

      <table className="mt-4">
        <tbody>
          <tr><th className="w-[32%]">Inwestycja</th><td>{r.investment.name}{r.investment.address ? `, ${r.investment.address}` : ''}</td></tr>
          <tr><th>Inwestor</th><td>{investorName}{investorAddress ? `, ${investorAddress}` : ''}, NIP {PROTOCOL_PARTIES.investor.nip}</td></tr>
          <tr><th>Generalny wykonawca (zamawiający roboty)</th><td>{gcName}{gcAddress ? `, ${gcAddress}` : ''}, NIP {PROTOCOL_PARTIES.generalContractor.nip}</td></tr>
          <tr><th>Wykonawca robót</th><td>{r.subcontractor ? `${r.subcontractor.name}${r.subcontractor.address ? `, ${r.subcontractor.address}` : ''}${r.subcontractor.nip ? `, NIP ${r.subcontractor.nip}` : ''}` : '—'}</td></tr>
          <tr><th>Przedmiot odbioru</th><td>{r.stage || INSPECTION_KIND_LABELS[r.kind as InspectionKind]} — {[r.building, r.staircase ? `klatka ${r.staircase}` : null, r.sheet?.name].filter(Boolean).join(', ')}</td></tr>
          <tr><th>Data i miejsce</th><td>{formatDateTimePl(r.startedAt)}{r.finishedAt ? ` – ${formatDateTimePl(r.finishedAt)}` : ''}, {r.investment.address || r.investment.name}</td></tr>
          <tr><th>Prowadzący odbiór</th><td>{r.inspectorName || '—'} (przedstawiciel generalnego wykonawcy)</td></tr>
        </tbody>
      </table>

      <div className="mt-4 font-bold">1. Komisja / osoby obecne</div>
      <table className="mt-1">
        <thead><tr><th className="w-8">Lp.</th><th>Imię i nazwisko</th><th>Firma</th><th>Rola</th><th className="w-24">Obecność</th></tr></thead>
        <tbody>
          {r.attendees.map((a, i) => (
            <tr key={a.id}><td>{i + 1}</td><td>{a.name}</td><td>{a.company || ''}</td><td>{ATTENDEE_ROLE_LABELS[a.role as AttendeeRole] || a.role}</td><td className={a.present ? '' : 'font-bold'}>{a.present ? 'obecny' : 'nie stawił się'}</td></tr>
          ))}
          {r.attendees.length === 0 && <tr><td colSpan={5} className="text-gray-500">Nie wpisano obecnych.</td></tr>}
        </tbody>
      </table>
      {absent.length > 0 && <p className="mt-1">Mimo zawiadomienia nie stawił(a/i) się: {absent.map((a) => `${a.name}${a.company ? ` (${a.company})` : ''}`).join(', ')}. Odbiór przeprowadzono w obecności {present.length} osób.</p>}

      <div className="mt-4 font-bold">2. Ustalenia</div>
      <table className="mt-1">
        <tbody>
          <tr><th className="w-[32%]">Wynik odbioru</th><td className="font-bold">{r.result ? INSPECTION_RESULT_LABELS[r.result as InspectionResult] : 'odbiór w toku — wynik nie został jeszcze ustalony'}</td></tr>
          <tr><th>Liczba stwierdzonych usterek</th><td>{r.defects.length}, w tym pilnych {r.defects.filter((d) => d.priority === 'PILNY').length}; otwartych {open.length}, odebranych {r.defects.filter((d) => d.status === 'ODEBRANA').length}</td></tr>
          <tr><th>Termin usunięcia usterek</th><td>{dueAt ? formatDatePl(dueAt) : 'wg terminów przy poszczególnych pozycjach w załączniku'}</td></tr>
          <tr><th>Uwagi</th><td style={{ whiteSpace: 'pre-wrap' }}>{r.notes || '—'}</td></tr>
        </tbody>
      </table>
      <p className="mt-2">Wykonawca robót zobowiązuje się usunąć usterki wymienione w załączniku w podanych terminach i zgłosić je do ponownego odbioru. Stwierdzone usterki nieistotne nie wstrzymują odbioru; ich usunięcie zostanie potwierdzone protokołem ponownego odbioru. Załącznik nr 1 (rzut z zaznaczeniem usterek, legenda i szczegółowa lista wad) stanowi integralną część protokołu.</p>

      <div className="mt-8 grid grid-cols-2 gap-8">
        {signers.slice(0, 6).map((a) => (
          <div key={a.id} className="pt-8 text-center">
            <div className="border-t border-black pt-1">{a.name}{a.company ? `, ${a.company}` : ''}</div>
            <div className="text-[10px] text-gray-600">{ATTENDEE_ROLE_LABELS[a.role as AttendeeRole] || 'podpis'}</div>
          </div>
        ))}
      </div>

      {/* ===== ZAŁĄCZNIK: RZUT NA CAŁĄ STRONĘ ===== */}
      <div className="page-break">
        <div className="text-[13px] font-bold">Załącznik nr 1 do protokołu {r.number} — rzut z zaznaczeniem usterek ({r.sheet?.name || ''})</div>
        <div className="text-[10px] text-gray-700">
          Numer w kółku = numer usterki (stały). {mono ? 'Obwódki czarno-białe.' : 'Kolor obwódki: czerwony do poprawy, pomarańczowy zgłoszona jako poprawiona, zielony odebrana, fioletowy sporna.'}
          {rotate ? ' Rysunek obrócony o 90° — obróć kartkę.' : ''}
        </div>
        {sheet ? (
          <div className="mx-auto mt-1 overflow-hidden" style={rotate ? { width: `${planShort}mm`, height: `${planLong}mm` } : { width: `${planLong}mm`, height: `${planShort}mm` }}>
            <svg
              viewBox={`0 0 ${sheet.width} ${sheet.height}`}
              role="img"
              aria-label="Rzut z pinezkami usterek"
              style={
                rotate
                  ? { width: `${planLong}mm`, height: `${planShort}mm`, transformOrigin: '0 0', transform: `translate(${planShort}mm, 0) rotate(90deg)`, display: 'block' }
                  : { width: `${planLong}mm`, height: `${planShort}mm`, display: 'block' }
              }
            >
              <rect x={0} y={0} width={sheet.width} height={sheet.height} fill="#fff" stroke="#999" strokeWidth={2} />
              <image href={sheet.imageUrl} x={0} y={0} width={sheet.width} height={sheet.height} />
              {r.defects.map((d) => (
                <g key={d.id}>
                  <circle cx={d.x} cy={d.y} r={pinR} fill="#fff" stroke={ring(d.status)} strokeWidth={Math.max(2, pinR / 4)} />
                  <text x={d.x} y={d.y + pinR * 0.38} textAnchor="middle" fontSize={pinR * 1.05} fontWeight={700} fontFamily="Arial, sans-serif" fill="#111">{d.seq}</text>
                </g>
              ))}
            </svg>
          </div>
        ) : (
          <p className="mt-2 text-gray-500">Brak arkusza rzutu dla tego odbioru.</p>
        )}
      </div>

      {/* ===== LEGENDA ===== */}
      <div className="page-break">
        <div className="font-bold">Legenda usterek ({r.defects.length}) — {r.number}</div>
        <table className="mt-1 text-[11px]">
          <thead><tr><th className="w-8">Nr</th><th>Kod</th><th>Lokal / pom.</th><th>Usterka</th><th>Branża</th><th>Wykonawca</th><th className="w-20">Termin</th><th className="w-16">Prior.</th><th className="w-24">Status</th></tr></thead>
          <tbody>
            {r.defects.map((d) => (
              <tr key={d.id} className="avoid-break">
                <td className="text-center font-bold">{d.seq}</td>
                <td className="font-mono">{d.code}</td>
                <td>{d.unitNumber ? unitShortLabel(d.unitNumber) : 'część wspólna'}{d.room ? ` / ${d.room}` : ''}</td>
                <td><b>{d.title}</b>{d.description ? <div>{d.description}</div> : null}</td>
                <td>{d.trade ? TRADE_LABELS[d.trade as keyof typeof TRADE_LABELS] || d.trade : ''}</td>
                <td>{d.subcontractor?.name || ''}</td>
                <td>{d.dueAt ? formatDatePl(d.dueAt) : ''}</td>
                <td>{DEFECT_PRIORITY_LABELS[d.priority as keyof typeof DEFECT_PRIORITY_LABELS] || d.priority}</td>
                <td>{DEFECT_STATUS_LABELS[d.status as DefectStatus] || d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 font-bold">Zestawienie wg wykonawców</div>
        <table className="mt-1 text-[11px]">
          <thead><tr><th>Wykonawca</th><th>Usterki (nr)</th><th className="w-16">Razem</th><th className="w-16">Pilne</th><th className="w-20">Najbliższy termin</th></tr></thead>
          <tbody>
            {[...byContractor.entries()].map(([name, list]) => {
              const due = list.map((d) => d.dueAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0]
              return (
                <tr key={name}><td>{name}</td><td>{list.map((d) => d.seq).join(', ')}</td><td>{list.length}</td><td>{list.filter((d) => d.priority === 'PILNY').length}</td><td>{due ? formatDatePl(due) : ''}</td></tr>
              )
            })}
          </tbody>
        </table>

        {withPhotos && r.defects.some((d) => d.photos.length) && (
          <div className="page-break mt-6">
            <div className="text-[15px] font-bold">Załącznik nr 2 — dokumentacja fotograficzna</div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {r.defects.filter((d) => d.photos.length).map((d) => (
                <div key={d.id} className="avoid-break border border-gray-300 p-2">
                  <div className="mb-1 text-[11px]"><b>{d.seq}</b> · {d.code} · {d.title}{d.unitNumber ? ` · ${unitShortLabel(d.unitNumber)}` : ''}</div>
                  <div className="flex flex-wrap gap-1">
                    {d.photos.map((p) => (
                      <div key={p.id} className="text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="" className="h-[42mm] w-auto max-w-[80mm] object-contain" />
                        <div className="text-[9px] text-gray-600">{p.phase === 'PO' ? 'po naprawie' : 'przed'} · {formatDatePl(p.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
