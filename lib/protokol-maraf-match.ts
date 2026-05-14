/**
 * Dopasowanie pozycji protokołu przerobowego wykonawcy → obmiar inżynierski Maraf.
 *
 * KONTEKST
 *   Protokół wykonawcy (ProtocolItem → ContractWorkItem) ma pozycje OPISOWE
 *   pogrupowane w sekcje (FUNDAMENTY, PARTER, I Piętro...):
 *     "Zaszalowanie i zabetonowanie ław fundamentowych" [m3]
 *   Obmiar Maraf (WorkItem) ma elementy konstrukcyjne pogrupowane w kategorie
 *   (arkusze: Fundamenty, Piony 0, Belki nad 0...) z elementType ("Ławy fund.")
 *   i kondygnacją ("Kondygnacja 0"). Jednostki: volumeM3 / areaM2.
 *
 * STRATEGIA (próbna, read-only, liczona na żywo — patrz docs/przeroby-decyzje.md)
 *   KONSERWATYWNA: mapujemy tylko PEWNE dopasowania. Wszystko niepewne lub
 *   bez odpowiednika w obmiarze (stal zbrojeniowa, chudy beton, dźwig, daszki,
 *   roboty ziemne, izolacje) → status MANUAL z jawnym wyjaśnieniem dlaczego.
 *   Lepiej pokazać mniej i pewnie, niż dużo i błędnie.
 *
 * KONWERSJA JEDNOSTEK
 *   Maraf liczy ściany w m³ (volumeM3), wykonawca rozlicza je w m².
 *   Przelicznik: m³ ÷ grubość = m². Grubość przyjęta na sztywno 0,18 m
 *   (jak default w module Konrad↔Maraf — lib/przedmiar-konrad-import.ts).
 *   Takie pozycje dostają status CONVERTED + notkę z przelicznikiem.
 *
 * STATUSY
 *   AUTO      — dopasowane, jednostka Maraf zgodna z jednostką protokołu
 *   CONVERTED — dopasowane, ale jednostka przeliczona (m³ ściany → m²)
 *   APPROX    — dopasowane, ale nazwa w obmiarze nie jest 1:1 (trzpienie/rdzenie,
 *               wieńce) — wartość orientacyjna, do weryfikacji
 *   MANUAL    — brak pewnego dopasowania → porównaj ręcznie (note wyjaśnia powód)
 */

// Grubość ściany do przeliczenia m³ → m². Przybliżenie — patrz nagłówek.
export const WALL_THICKNESS_M = 0.18

// Minimalny kształt WorkItem potrzebny do dopasowania (z relacją category.name spłaszczoną).
export type MarafWorkItemLite = {
  categoryName: string
  floor: string | null // "Kondygnacja 0", "Kondygnacja 1", ...
  elementType: string | null // "Ławy fund.", "Ściany 0", ...
  areaM2: number | null
  volumeM3: number | null
}

export type MarafMatchStatus = 'AUTO' | 'CONVERTED' | 'APPROX' | 'MANUAL'

export type MarafMatch = {
  status: MarafMatchStatus
  value: number | null // wartość w jednostce protokołu (po ew. konwersji)
  unit: string | null // jednostka protokołu (m3 / m2 / ...)
  rawValue: number | null // surowa suma z obmiaru Maraf przed konwersją
  rawUnit: 'm3' | 'm2' | null
  sourceCount: number // ile WorkItem zsumowano
  note: string // wyjaśnienie: skąd wartość / dlaczego ręcznie
}

// =====================================================================
// Sekcja protokołu → kondygnacja Maraf
// =====================================================================
// FUNDAMENTY i PARTER obie odnoszą się do "Kondygnacja 0" w obmiarze Maraf,
// ale dotyczą innych kategorii (Fundamenty vs Piony 0 / Strop nad 0 / Belki nad 0).
// Pole `level` rozróżnia regułę: 'fundament' działa tylko dla sekcji FUNDAMENTY,
// 'ground' tylko dla PARTER, 'upper' dla pięter.

type SectionLevel = 'fundament' | 'ground' | 'upper'

type SectionMeta = { marafFloor: string; level: SectionLevel }

function resolveSection(section: string | null): SectionMeta | null {
  if (!section) return null
  const s = section.trim().toUpperCase()
  if (s.includes('FUNDAMENT')) return { marafFloor: 'Kondygnacja 0', level: 'fundament' }
  if (s.includes('PARTER')) return { marafFloor: 'Kondygnacja 0', level: 'ground' }
  // "I Piętro", "II PIĘTRO", "III piętro", "IV Piętro"
  const roman = s.match(/\b(I{1,3}|IV|V)\b/)
  if (roman && s.includes('PI')) {
    const map: Record<string, string> = {
      I: 'Kondygnacja 1',
      II: 'Kondygnacja 2',
      III: 'Kondygnacja 3',
      IV: 'Kondygnacja 4',
      V: 'Kondygnacja 5',
    }
    const floor = map[roman[1]]
    if (floor) return { marafFloor: floor, level: 'upper' }
  }
  return null
}

// =====================================================================
// Reguły dopasowania
// =====================================================================
// Reguła pasuje gdy: level się zgadza + WSZYSTKIE `keywords` są w nazwie
// pozycji + ŻADEN z `excludeKeywords` nie występuje.
// Kolejność w tablicy = priorytet (pierwsza pasująca wygrywa).

type MatchRule = {
  level: SectionLevel | SectionLevel[]
  keywords: string[]
  excludeKeywords?: string[]
  categoryName: string | string[]
  elementType?: string | string[] // jeśli pominięte — wszystkie elementy kategorii
  useFloor: boolean // czy filtrować WorkItem po kondygnacji (true dla nadziemia)
  agg: 'volumeSum' | 'areaSum'
  baseStatus: 'AUTO' | 'APPROX'
  label: string // krótki opis dopasowania do notki w UI
}

const RULES: MatchRule[] = [
  // --- FUNDAMENTY ---
  {
    level: 'fundament',
    keywords: ['ław'],
    categoryName: 'Fundamenty',
    elementType: ['Ławy fund.', 'Ławy fund. (schodkowe)'],
    useFloor: false,
    agg: 'volumeSum',
    baseStatus: 'AUTO',
    label: 'Fundamenty / Ławy fund.',
  },
  {
    level: 'fundament',
    keywords: ['stóp'],
    categoryName: 'Fundamenty',
    elementType: 'Stopy fund.',
    useFloor: false,
    agg: 'volumeSum',
    baseStatus: 'AUTO',
    label: 'Fundamenty / Stopy fund.',
  },
  {
    level: 'fundament',
    keywords: ['płyt'],
    categoryName: 'Fundamenty',
    elementType: 'Płyty fund.',
    useFloor: false,
    agg: 'volumeSum',
    baseStatus: 'AUTO',
    label: 'Fundamenty / Płyty fund.',
  },
  {
    level: 'fundament',
    keywords: ['ścian'],
    excludeKeywords: ['styropian', 'wyklej'],
    categoryName: 'Piony 0',
    elementType: 'Ścianki fund.',
    useFloor: false,
    agg: 'volumeSum',
    baseStatus: 'AUTO',
    label: 'Piony 0 / Ścianki fund.',
  },
  // --- PARTER ---
  {
    level: 'ground',
    keywords: ['ścian'],
    excludeKeywords: ['murowanie'],
    categoryName: 'Piony 0',
    elementType: 'Ściany 0',
    useFloor: false,
    agg: 'volumeSum',
    baseStatus: 'AUTO',
    label: 'Piony 0 / Ściany 0',
  },
  {
    level: 'ground',
    keywords: ['słup'],
    excludeKeywords: ['okrągł'],
    categoryName: 'Piony 0',
    elementType: 'Słupy 0',
    useFloor: false,
    agg: 'volumeSum',
    baseStatus: 'AUTO',
    label: 'Piony 0 / Słupy 0',
  },
  {
    level: 'ground',
    keywords: ['trzpien'],
    categoryName: 'Piony 0',
    elementType: 'Trzpienie 0',
    useFloor: false,
    agg: 'volumeSum',
    baseStatus: 'APPROX',
    label: 'Piony 0 / Trzpienie 0',
  },
  {
    level: 'ground',
    keywords: ['strop'],
    categoryName: 'Strop nad 0',
    elementType: 'Płyta stropowa',
    useFloor: false,
    agg: 'areaSum',
    baseStatus: 'AUTO',
    label: 'Strop nad 0 / Płyta stropowa',
  },
  {
    level: 'ground',
    keywords: ['belek'],
    categoryName: 'Belki nad 0',
    useFloor: false,
    agg: 'volumeSum',
    baseStatus: 'APPROX',
    label: 'Belki nad 0 (wszystkie elementy)',
  },
  {
    level: 'ground',
    keywords: ['balkon'],
    categoryName: 'Strop nad 0',
    elementType: ['Balkony niższe', 'Balkony wyższe'],
    useFloor: false,
    agg: 'areaSum',
    baseStatus: 'AUTO',
    label: 'Strop nad 0 / Balkony',
  },
  // --- PIĘTRA (nadziemie) ---
  {
    level: 'upper',
    keywords: ['ścian'],
    excludeKeywords: ['wełn', 'dylatacyjn'],
    categoryName: 'Piony nadziemia',
    elementType: 'Ściany nadziemia',
    useFloor: true,
    agg: 'volumeSum',
    baseStatus: 'AUTO',
    label: 'Piony nadziemia / Ściany nadziemia',
  },
  {
    level: 'upper',
    keywords: ['rdzeni'],
    categoryName: 'Piony nadziemia',
    elementType: 'Trzpienie nadziemia',
    useFloor: true,
    agg: 'volumeSum',
    baseStatus: 'APPROX',
    label: 'Piony nadziemia / Trzpienie nadziemia (rdzenie ≈ trzpienie)',
  },
  {
    level: 'upper',
    keywords: ['trzpien'],
    categoryName: 'Piony nadziemia',
    elementType: 'Trzpienie nadziemia',
    useFloor: true,
    agg: 'volumeSum',
    baseStatus: 'APPROX',
    label: 'Piony nadziemia / Trzpienie nadziemia',
  },
  {
    level: 'upper',
    keywords: ['belek'],
    categoryName: 'Belki nadziemia',
    elementType: 'Belki nadziemia',
    useFloor: true,
    agg: 'volumeSum',
    baseStatus: 'APPROX',
    label: 'Belki nadziemia / Belki nadziemia',
  },
  {
    level: 'upper',
    keywords: ['wieńc'],
    categoryName: 'Belki nadziemia',
    elementType: 'Wieńce nadziemia',
    useFloor: true,
    agg: 'volumeSum',
    baseStatus: 'APPROX',
    label: 'Belki nadziemia / Wieńce nadziemia',
  },
  {
    level: 'upper',
    keywords: ['strop'],
    categoryName: 'Stropy nadziemia',
    elementType: 'Płyta stropowa',
    useFloor: true,
    agg: 'areaSum',
    baseStatus: 'AUTO',
    label: 'Stropy nadziemia / Płyta stropowa',
  },
  {
    level: 'upper',
    keywords: ['balkon'],
    categoryName: 'Stropy nadziemia',
    elementType: 'Balkony',
    useFloor: true,
    agg: 'areaSum',
    baseStatus: 'AUTO',
    label: 'Stropy nadziemia / Balkony',
  },
]

// Pozycje które jawnie NIE MAJĄ odpowiednika w obmiarze konstrukcji żelbetowej Maraf.
// Sprawdzane PRZED regułami — dają od razu MANUAL z konkretnym powodem.
type Exclusion = { test: (name: string, unit: string) => boolean; reason: string }

const EXCLUSIONS: Exclusion[] = [
  {
    test: (_n, u) => u === 'T' || u === 'kg',
    reason: 'Maraf nie mierzy stali zbrojeniowej (obmiar to tylko beton/szalunek).',
  },
  {
    test: (n) => n.includes('chud') || n.includes('podkład'),
    reason: 'Chudy beton / podkład — poza obmiarem konstrukcji żelbetowej Maraf.',
  },
  {
    test: (n) => n.includes('zasypani') || n.includes('zasypan'),
    reason: 'Roboty ziemne — poza obmiarem konstrukcji żelbetowej.',
  },
  {
    test: (n) => n.includes('styropian') || n.includes('wyklej') || n.includes('wełn'),
    reason: 'Izolacja / ocieplenie — poza obmiarem żelbetu.',
  },
  {
    test: (n) => n.includes('murowani'),
    reason: 'Murowanie — poza obmiarem żelbetu.',
  },
  {
    test: (n) => n.includes('dźwig') || n.includes('dzwig'),
    reason: 'Praca sprzętu — brak odpowiednika w obmiarze.',
  },
  {
    test: (n) => n.includes('łącznik') || n.includes('lacznik'),
    reason: 'Montaż łączników — brak odpowiednika w obmiarze Maraf.',
  },
  {
    test: (n) => n.includes('daszk'),
    reason: 'Daszki żelbetowe — Maraf nie wyodrębnia ich w obmiarze.',
  },
  {
    test: (_n, u) => u === 'mb',
    reason: 'Jednostka mb — obmiar Maraf operuje m³/m², brak pewnego przelicznika.',
  },
  {
    test: (_n, u) => u === 'stopni',
    reason: 'Schody liczone w stopniach — Maraf ma biegi w m³, brak pewnego przelicznika.',
  },
  {
    test: (_n, u) => u === 'kpl',
    reason: 'Pozycja ryczałtowa (kpl) — brak odpowiednika ilościowego w obmiarze.',
  },
]

// =====================================================================
// Helpers
// =====================================================================

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function asArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// =====================================================================
// Główna funkcja dopasowania
// =====================================================================

export function matchProtocolItemToMaraf(
  itemName: string,
  section: string | null,
  protocolUnit: string,
  workItems: MarafWorkItemLite[],
): MarafMatch {
  const name = normalize(itemName)
  const unit = (protocolUnit || '').trim()
  const empty: MarafMatch = {
    status: 'MANUAL',
    value: null,
    unit: null,
    rawValue: null,
    rawUnit: null,
    sourceCount: 0,
    note: '',
  }

  // 1. Wykluczenia — pozycje bez odpowiednika w obmiarze
  for (const ex of EXCLUSIONS) {
    if (ex.test(name, unit)) {
      return { ...empty, note: ex.reason }
    }
  }

  // 2. Kondygnacja z sekcji
  const sec = resolveSection(section)
  if (!sec) {
    return { ...empty, note: `Nie rozpoznano kondygnacji z sekcji „${section ?? '—'}".` }
  }

  // 3. Znajdź pasującą regułę
  const rule = RULES.find((r) => {
    const levels = asArray(r.level)
    if (!levels.includes(sec.level)) return false
    if (!r.keywords.every((k) => name.includes(k))) return false
    if (r.excludeKeywords && r.excludeKeywords.some((k) => name.includes(k))) return false
    return true
  })
  if (!rule) {
    return { ...empty, note: 'Brak reguły dopasowania — porównaj ręcznie z obmiarem.' }
  }

  // 4. Filtruj WorkItem
  const cats = asArray(rule.categoryName)
  const elems = rule.elementType ? asArray(rule.elementType) : null
  const matched = workItems.filter((wi) => {
    if (!cats.includes(wi.categoryName)) return false
    if (elems && (!wi.elementType || !elems.includes(wi.elementType))) return false
    if (rule.useFloor && wi.floor !== sec.marafFloor) return false
    return true
  })

  if (matched.length === 0) {
    return {
      ...empty,
      note: `Reguła „${rule.label}" nie znalazła pozycji w obmiarze Maraf — sprawdź czy obmiar jest zaimportowany.`,
    }
  }

  // 5. Agregacja
  const rawValue = round2(
    matched.reduce((s, wi) => s + (rule.agg === 'volumeSum' ? wi.volumeM3 || 0 : wi.areaM2 || 0), 0),
  )
  const rawUnit: 'm3' | 'm2' = rule.agg === 'volumeSum' ? 'm3' : 'm2'

  // 6. Konwersja jednostki jeśli trzeba
  // Maraf m³ + protokół m² → przelicz przez grubość ściany.
  if (rawUnit === 'm3' && unit === 'm2') {
    const converted = round2(rawValue / WALL_THICKNESS_M)
    return {
      status: 'CONVERTED',
      value: converted,
      unit: 'm2',
      rawValue,
      rawUnit,
      sourceCount: matched.length,
      note: `${rule.label} · ${rawValue} m³ ÷ ${WALL_THICKNESS_M} m grubości ≈ ${converted} m² (${matched.length} elem.)`,
    }
  }

  // Jednostka zgodna (m3↔m3 lub m2↔m2)
  if ((rawUnit === 'm3' && unit === 'm3') || (rawUnit === 'm2' && unit === 'm2')) {
    return {
      status: rule.baseStatus,
      value: rawValue,
      unit,
      rawValue,
      rawUnit,
      sourceCount: matched.length,
      note:
        rule.baseStatus === 'APPROX'
          ? `${rule.label} · ${matched.length} elem. — dopasowanie przybliżone, zweryfikuj`
          : `${rule.label} · ${matched.length} elem.`,
    }
  }

  // Jednostka niezgodna i brak znanej konwersji
  return {
    ...empty,
    rawValue,
    rawUnit,
    sourceCount: matched.length,
    note: `Obmiar Maraf w ${rawUnit}, protokół w ${unit || '—'} — brak pewnego przelicznika, porównaj ręcznie.`,
  }
}
