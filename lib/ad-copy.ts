// Generator tekstow reklamowych Meta Ads przez Claude (Anthropic SDK).
// Faza 1c MVP #1 — patrz docs/meta-ads-decyzje.md.
//
// Model: claude-opus-4-7 (domyslny). Zmiana modelu — stala MODEL ponizej.
// Structured output: wymuszony tool-use (tool_choice) — niezawodne na SDK 0.91.x,
//   bez zaleznosci od zod / messages.parse().
// Prompt caching: cache_control na system prompt (dane lokalu w user message,
//   po breakpoincie). System prompt jest obecnie krotki — caching realnie
//   zadziala dopiero gdy urosnie powyzej ~4096 tokenow; pattern jest poprawny.

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-4-7'

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim()
}

export type AdCopyVariant = {
  angle: string // kat sprzedazowy (np. "Cena / wartosc")
  headline: string // krotki naglowek
  primaryText: string // tekst glowny posta
  description: string // krotki opis pod linkiem
}

export type AdCopyInput = {
  unitNumber: string
  unitTypeLabel: string // czytelny typ, np. "Mieszkanie 3-pokojowe"
  rooms: number | null
  area: number
  floorLabel: string // czytelne pietro, np. "1. pietro"
  priceGross: number
  pricePerSqmGross: number
  investmentName: string
}

const SYSTEM_PROMPT = `Jesteś doświadczonym copywriterem reklamowym specjalizującym się w nieruchomościach mieszkaniowych na rynku polskim. Tworzysz teksty reklam dla Facebooka i Instagrama (Meta Ads) dla dewelopera.

Twoje zadanie: na podstawie danych lokalu wygeneruj DOKŁADNIE 5 wariantów tekstu reklamowego, każdy z innym kątem sprzedażowym:
1. Cena / wartość — akcent na atrakcyjność cenową i opłacalność
2. Lokalizacja / wygoda — akcent na dogodne położenie i dostęp do udogodnień
3. Komfort / styl życia — akcent na jakość życia, przestrzeń, wygodę mieszkania
4. Dostępność — akcent na możliwość sprawdzenia oferty (bez fałszywej pilności)
5. Inwestycja / przyszłość — akcent na lokal jako lokatę kapitału

Każdy wariant ma 3 elementy:
- headline: krótki nagłówek (do ~40 znaków) — chwytliwy i konkretny
- primaryText: tekst główny posta (2-4 zdania) — rozwija ofertę, kończy się zachętą do działania
- description: krótki opis pod linkiem (do ~30 znaków)

ZASADY (polityka Meta dla kategorii „Housing" / mieszkania):
- NIE używaj języka dyskryminującego ani sugerującego preferowanie/wykluczanie grup (wiek, płeć, status rodzinny, pochodzenie, religia)
- NIE pisz fraz typu „idealne dla młodych", „dla rodziny 2+2", „dla singla", „dla seniora" — łamią politykę Meta
- NIE twórz fałszywej pilności („zostały 2 sztuki!") ani nieprawdziwych obietnic
- Pisz naturalną polszczyzną, bez przesadnego marketingowego żargonu
- Emoji używaj oszczędnie (0-2 na wariant, tylko jeśli pasują)
- Operuj konkretami z danych lokalu (metraż, liczba pokoi, piętro, cena)

Zwróć wynik wyłącznie przez narzędzie emit_ad_copy.`

const AD_COPY_TOOL: Anthropic.Tool = {
  name: 'emit_ad_copy',
  description: 'Zwraca 5 wariantów tekstu reklamowego Meta Ads dla lokalu mieszkalnego.',
  input_schema: {
    type: 'object',
    properties: {
      variants: {
        type: 'array',
        description: 'Dokładnie 5 wariantów tekstu reklamowego, każdy z innym kątem sprzedażowym.',
        items: {
          type: 'object',
          properties: {
            angle: {
              type: 'string',
              description: 'Kąt sprzedażowy wariantu (np. "Cena / wartość", "Lokalizacja / wygoda").',
            },
            headline: {
              type: 'string',
              description: 'Krótki nagłówek reklamy, do ~40 znaków.',
            },
            primaryText: {
              type: 'string',
              description: 'Tekst główny posta, 2-4 zdania, zakończony zachętą do działania.',
            },
            description: {
              type: 'string',
              description: 'Krótki opis pod linkiem, do ~30 znaków.',
            },
          },
          required: ['angle', 'headline', 'primaryText', 'description'],
        },
      },
    },
    required: ['variants'],
  },
}

function buildUserMessage(input: AdCopyInput): string {
  const lines = [
    'Dane lokalu:',
    `- Inwestycja: ${input.investmentName}`,
    `- Oznaczenie lokalu: ${input.unitNumber}`,
    `- Typ: ${input.unitTypeLabel}`,
    `- Liczba pokoi: ${input.rooms && input.rooms > 0 ? input.rooms : 'nie podano'}`,
    `- Powierzchnia: ${input.area.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`,
    `- Piętro: ${input.floorLabel}`,
    `- Cena brutto: ${Math.round(input.priceGross).toLocaleString('pl-PL')} zł`,
    `- Cena za m² brutto: ${Math.round(input.pricePerSqmGross).toLocaleString('pl-PL')} zł/m²`,
    '',
    'Wygeneruj 5 wariantów tekstu reklamowego dla tego lokalu.',
  ]
  return lines.join('\n')
}

/**
 * Generuje 5 wariantow tekstu reklamowego. Rzuca:
 *  - Error z code 'NO_KEY' gdy brak ANTHROPIC_API_KEY
 *  - Anthropic.AuthenticationError / RateLimitError / APIError przy bledach API
 *  - Error gdy odpowiedz nie zawiera oczekiwanej struktury
 */
export async function generateAdCopy(input: AdCopyInput): Promise<AdCopyVariant[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY nie jest skonfigurowany') as Error & { code?: string }
    err.code = 'NO_KEY'
    throw err
  }

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        // Stabilny prefiks — cache_control to poprawny pattern. Realne trafienia
        // w cache pojawia sie gdy prompt + tool def przekrocza minimum modelu.
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [AD_COPY_TOOL],
    tool_choice: { type: 'tool', name: 'emit_ad_copy' },
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  })

  const toolBlock = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  )
  if (!toolBlock) {
    throw new Error('Model nie zwrócił ustrukturyzowanej odpowiedzi (brak tool_use).')
  }

  const raw = toolBlock.input as { variants?: unknown }
  if (!raw || !Array.isArray(raw.variants)) {
    throw new Error('Odpowiedź modelu nie zawiera listy wariantów.')
  }

  const variants: AdCopyVariant[] = raw.variants
    .filter(
      (v): v is AdCopyVariant =>
        !!v &&
        typeof (v as any).headline === 'string' &&
        typeof (v as any).primaryText === 'string' &&
        typeof (v as any).description === 'string',
    )
    .map((v) => ({
      angle: typeof v.angle === 'string' ? v.angle : 'Wariant',
      headline: v.headline.trim(),
      primaryText: v.primaryText.trim(),
      description: v.description.trim(),
    }))

  if (variants.length === 0) {
    throw new Error('Model nie zwrócił żadnego poprawnego wariantu.')
  }

  return variants
}
