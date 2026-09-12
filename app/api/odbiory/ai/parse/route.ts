import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { prisma } from '@/lib/prisma'
import { isAnthropicConfigured } from '@/lib/ad-copy'
import { DEFECT_PRIORITIES, TRADES, TRADE_LABELS } from '@/lib/odbiory/constants'
import { json, jsonError, requireUser } from '@/lib/odbiory/server'
import type { AiDefectSuggestion } from '@/lib/odbiory/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/odbiory/ai/parse — { text, inspectionId }
 * Porządkuje podyktowany / wpisany opis usterki w pola: nazwa, opis, branża, typ ze
 * słownika, pomieszczenie, wykonawca, priorytet, termin. TYLKO PROPOZYCJA — użytkownik
 * zatwierdza w edytorze. AI nigdy nie zmienia statusu usterki ani nie ocenia zgodności robót.
 * Model: claude-opus-5, structured outputs (JSON schema), niski effort (prosta ekstrakcja).
 */
const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Krótka nazwa usterki (do 80 znaków), np. "Brak kąta przy otworze drzwiowym"' },
    description: { type: ['string', 'null'], description: 'Uporządkowany opis usterki (miejsce, co jest nie tak). Bez wykonawcy i terminu — one mają własne pola.' },
    trade: { type: ['string', 'null'], enum: [...TRADES, null], description: 'Branża' },
    typeCode: { type: ['integer', 'null'], description: 'Kod typu ze słownika, jeśli pasuje; inaczej null' },
    room: { type: ['string', 'null'], description: 'Pomieszczenie, np. salon, łazienka, klatka schodowa; null gdy nie podano' },
    subcontractorName: { type: ['string', 'null'], description: 'DOKŁADNA nazwa wykonawcy z listy, jeśli tekst na niego wskazuje; inaczej null' },
    priority: { type: ['string', 'null'], enum: [...DEFECT_PRIORITIES, null], description: 'PILNY gdy tekst mówi o pilności/zagrożeniu; NISKI gdy kosmetyczne; NORMALNY dla "średnia ważność"; null gdy brak wskazówki' },
    dueDate: { type: ['string', 'null'], description: 'Termin usunięcia jako YYYY-MM-DD, wyliczony z tekstu ("do piątku", "do końca tygodnia", "3 dni"); null gdy brak' },
    confidence: { type: 'string', enum: ['niska', 'srednia', 'wysoka'] },
  },
  required: ['title', 'description', 'trade', 'typeCode', 'room', 'subcontractorName', 'priority', 'dueDate', 'confidence'],
  additionalProperties: false,
} as const

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return jsonError('Unauthorized', 401)
  if (!isAnthropicConfigured()) return jsonError('AI nie jest skonfigurowane (brak ANTHROPIC_API_KEY na serwerze)', 503)
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError('Nieprawidłowe dane')
  }
  const text = String(body.text || '').trim().slice(0, 2000)
  if (!text) return jsonError('Brak tekstu do uporządkowania')

  const inspection = body.inspectionId
    ? await prisma.inspection.findUnique({ where: { id: String(body.inspectionId) }, select: { stage: true, scopeName: true, subcontractor: { select: { name: true } } } })
    : null
  const [types, subs] = await Promise.all([
    prisma.defectType.findMany({ where: { active: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, trade: true } }),
    prisma.subcontractor.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  const today = new Date()
  const todayPl = today.toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Warsaw' })
  const todayIso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(today)

  const system =
    `Jesteś asystentem inspektora na budowie mieszkaniowej (deweloper MARAF). Porządkujesz podyktowane lub wpisane opisy usterek w pola formularza. ` +
    `Odpowiadasz wyłącznie strukturą JSON zgodną ze schematem. Nie oceniasz, czy usterka została usunięta, i nie stwierdzasz zgodności robót — to decyzja człowieka.\n\n` +
    `Dziś jest ${todayPl} (${todayIso}), strefa Europe/Warsaw. Terminy względne ("do piątku", "za 3 dni", "do końca tygodnia") przelicz na datę YYYY-MM-DD nie wcześniejszą niż jutro.\n\n` +
    `Branże: ${TRADES.map((t) => `${t} = ${TRADE_LABELS[t]}`).join('; ')}.\n\n` +
    `Słownik typów usterek (kod: nazwa [branża]):\n${types.map((t) => `${t.code}: ${t.name} [${t.trade}]`).join('\n') || '(pusty)'}\n\n` +
    `Wykonawcy (użyj DOKŁADNEJ nazwy z listy albo null):\n${subs.map((s) => s.name).join('\n') || '(brak)'}\n\n` +
    (inspection ? `Kontekst odbioru: ${inspection.scopeName}${inspection.stage ? `, zakres: ${inspection.stage}` : ''}${inspection.subcontractor ? `, wykonawca odbieranych robót: ${inspection.subcontractor.name}` : ''}. Jeśli tekst mówi "wykonawca" bez nazwy albo "do poprawy przez wykonawcę", wskaż wykonawcę odbieranych robót.\n\n` : '') +
    `Zasady: title krótkie i konkretne po polsku; description bez nazwiska wykonawcy i bez terminu; nazwisko/firma z tekstu dopasuj do listy wykonawców po fragmencie (np. "Banaszczyk" → "Firma Banaszczyk"); gdy nic nie pasuje — null. typeCode tylko gdy typ ze słownika naprawdę odpowiada usterce.`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const response = await client.messages.parse(
      {
        model: 'claude-opus-5',
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: `Tekst inspektora: """${text}"""` }],
        output_config: { format: jsonSchemaOutputFormat(SCHEMA), effort: 'low' },
      },
      { timeout: 45_000 },
    )
    if (response.stop_reason === 'refusal') return jsonError('AI odmówiło przetworzenia tego tekstu', 422)
    const out = response.parsed_output
    if (!out) return jsonError('AI nie zwróciło poprawnej struktury', 502)

    const type = out.typeCode != null ? types.find((t) => t.code === out.typeCode) || null : null
    const subByName = out.subcontractorName ? subs.find((s) => s.name.toLowerCase() === out.subcontractorName!.toLowerCase()) || subs.find((s) => s.name.toLowerCase().includes(out.subcontractorName!.toLowerCase()) || out.subcontractorName!.toLowerCase().includes(s.name.toLowerCase())) || null : null
    let dueAt: string | null = null
    if (out.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(out.dueDate)) {
      const d = new Date(`${out.dueDate}T12:00:00`)
      if (!Number.isNaN(d.getTime())) dueAt = d.toISOString()
    }
    const suggestion: AiDefectSuggestion = {
      title: (out.title || '').trim().slice(0, 120),
      description: out.description ? out.description.trim().slice(0, 1000) : null,
      trade: out.trade || type?.trade || null,
      typeId: type?.id || null,
      typeName: type?.name || null,
      room: out.room ? out.room.trim().toLowerCase().slice(0, 80) : null,
      subcontractorId: subByName?.id || null,
      subcontractorName: subByName?.name || null,
      priority: out.priority || null,
      dueAt,
      confidence: out.confidence,
    }
    return json(suggestion)
  } catch (e: any) {
    if (e instanceof Anthropic.AuthenticationError) return jsonError('Nieprawidłowy klucz Anthropic API', 503)
    if (e instanceof Anthropic.RateLimitError) return jsonError('Limit zapytań AI — spróbuj za chwilę', 429)
    if (e instanceof Anthropic.APIConnectionError) return jsonError('Brak połączenia z usługą AI', 503)
    if (e instanceof Anthropic.APIError) return jsonError(`Błąd usługi AI (${e.status})`, 502)
    console.error('[odbiory] ai/parse', e)
    return jsonError('AI nie odpowiedziało', 502)
  }
}
