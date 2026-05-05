/**
 * Reguły mapowania pozycji „Podsumowania kondygnacji" kierownika
 * na pozycje obmiaru inżynierskiego (WorkItem).
 *
 * Każda reguła zwraca filtr Prisma + sposób agregacji (V/A/h*szt/szt).
 * Pozycje, których nie da się automatycznie porównać, mają matchMode != AUTO_OK
 * i wymagają ręcznego wprowadzenia wartości przez kierownika.
 */

export type MatchMode =
  | 'AUTO_OK'
  | 'MANUAL_FLOOR_SPLIT'
  | 'MANUAL_DIFF_UNIT'
  | 'MANUAL_OUT_OF_SCOPE'
  | 'MANUAL_NOT_FOUND'
  | 'MANUAL_OVERRIDE'

export type AggMethod = 'volumeSum' | 'areaSum' | 'heightCountSum' | 'countSum'

export type MappingRule = {
  matchMode: MatchMode
  matchReason?: string
  // Filtr — opisany jako lista warunków na WorkItem
  filter?: {
    categoryName?: string | string[]
    elementType?: string | string[]
    floor?: string | string[]
    nameIncludes?: string
    nameExcludes?: string
  }
  agg?: AggMethod
}

export const MATCH_MODE_LABEL: Record<MatchMode, string> = {
  AUTO_OK:             'auto',
  MANUAL_FLOOR_SPLIT:  'ręczne — element wielokondygnacyjny',
  MANUAL_DIFF_UNIT:    'ręczne — inna jednostka',
  MANUAL_OUT_OF_SCOPE: 'ręczne — poza obmiarem ŻB',
  MANUAL_NOT_FOUND:    'ręczne — brak w obmiarze',
  MANUAL_OVERRIDE:     'ręczne — wartość nadpisana',
}

export const MATCH_MODE_DESCRIPTION: Record<MatchMode, string> = {
  AUTO_OK:
    'Pozycja jest porównywana automatycznie z sumą wartości z obmiaru inżynierskiego.',
  MANUAL_FLOOR_SPLIT:
    'Element konstrukcyjny rozpięty jest na kilku kondygnacjach (np. ściana 4-5m od fundamentu do stropu, ciągłe trzpienie). Obmiar inżynierski mierzy całą wysokość, kierownik dzieli per kondygnacja — automatyczne dopasowanie nie jest możliwe.',
  MANUAL_DIFF_UNIT:
    'Pozycja używa jednostki, która nie odpowiada bezpośrednio obmiarowi inżynierskiemu (np. „kpl" klatek schodowych vs „szt" pojedynczych biegów).',
  MANUAL_OUT_OF_SCOPE:
    'Pozycja jest poza zakresem obmiaru konstrukcji żelbetowej (np. murowanie, montaż łączników, prace wykończeniowe). Tego nie znajdziesz w obmiarze ŻB.',
  MANUAL_NOT_FOUND:
    'Pozycja nie jest reprezentowana w obmiarze inżynierskim (np. daszki, elementy wykonawcze niewystępujące w obmiarze).',
  MANUAL_OVERRIDE:
    'Kierownik świadomie nadpisał wartość obliczoną automatycznie.',
}

// Reguły dla parteru (kondygnacja PARTER)
// Klucz = nazwa pozycji w „Podsumowaniu PARTER" kierownika
export const PARTER_RULES: Record<string, MappingRule> = {
  'Zaszalowanie i zabetonowanie ścian parteru': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason:
      'Ściany parteru w obmiarze inżynierskim są mierzone razem z fragmentem fundamentowym (pełna wysokość ~4-5m). Bez dodatkowej dekompozycji rzędnych nie można wydzielić samej części parteru.',
  },
  'Zaszalowanie i zabetonowanie słupów parteru': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason:
      'Słupy w obmiarze inżynierskim obejmują pełną wysokość (od fundamentów do stropu nad parterem). Kierownik liczy tylko część parteru.',
  },
  'Zaszalowanie i zabetonowanie słupów okrągłych': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason:
      'Słupy okrągłe analogicznie jak prostokątne — pełna wysokość w obmiarze inżynierskim.',
  },
  'Zaszalowanie i zazbrojenie trzpieni żelbetowych': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason:
      'Trzpienie żelbetowe spinają kilka kondygnacji jednym ciągłym zbrojeniem. Obmiar inżynierski liczy całość, kierownik tylko fragment parteru.',
  },
  'Zaszalowanie i zazbrojenie belek żelbetowych stropu nad parterem': {
    matchMode: 'AUTO_OK',
    filter: { categoryName: 'Belki nad 0' },
    agg: 'volumeSum',
  },
  'Zaszalowanie i zazbrojenie stropu nad parterem': {
    matchMode: 'AUTO_OK',
    filter: { categoryName: 'Strop nad 0', elementType: 'Płyta stropowa' },
    agg: 'areaSum',
  },
  'Zaszalowanie i zazbrojenie daszków nad parterem': {
    matchMode: 'MANUAL_NOT_FOUND',
    matchReason:
      'Daszki nad parterem nie występują jako odrębne pozycje w obmiarze konstrukcji żelbetowej. Mogą być fragmentem belek/wsporników — wymaga ręcznej weryfikacji.',
  },
  'Zaszalowanie i zazbrojenie balkonów żelbetowych': {
    matchMode: 'MANUAL_FLOOR_SPLIT',
    matchReason:
      'Obmiar inżynierski grupuje wszystkie balkony stropu nad parterem łącznie (suma 135,9 m²). Kierownik liczy tylko balkony przypisane do parteru. Filtrowanie wymaga ręcznej selekcji konkretnych balkonów.',
  },
  'Zaszalowanie i zazbrojenie schodów żelbetowych': {
    matchMode: 'MANUAL_DIFF_UNIT',
    matchReason:
      'Kierownik liczy w „kpl" (komplet = klatka schodowa). Obmiar inżynierski liczy w „szt" pojedynczych biegów (B.SCH-01, B.SCH-02). Konwersja 1:N wymaga ręcznego potwierdzenia ile biegów = 1 kpl klatki.',
  },
  'Wieńce na windzie nad parterem': {
    matchMode: 'AUTO_OK',
    filter: {
      categoryName: 'Szyby windowe',
      elementType: 'Wieniec szybu',
      floor: 'Kondygnacja 0',
    },
    agg: 'volumeSum',
  },
  'Murowanie ścian parteru': {
    matchMode: 'MANUAL_OUT_OF_SCOPE',
    matchReason:
      'Murowanie ścian to prace murarskie — poza zakresem obmiaru konstrukcji żelbetowej. Po imporcie obmiaru murarskiego (osobny zakres) możliwe będzie automatyczne porównanie.',
  },
  'Montaż łączników balkonowych': {
    matchMode: 'MANUAL_OUT_OF_SCOPE',
    matchReason:
      'Łączniki balkonowe (np. ISOKORB) to element prefabrykowany montowany podczas robót żelbetowych, ale nieobecny w obmiarze konstrukcji. Liczy się go w mb na podstawie projektu.',
  },
}

export const I_PIETRO_RULES: Record<string, MappingRule> = {
  'Zaszalowanie i zabetonowanie ścian I Piętra': {
    matchMode: 'AUTO_OK',
    filter: { categoryName: 'Piony nadziemia', elementType: 'Ściany nadziemia', floor: 'Kondygnacja 1' },
    agg: 'volumeSum',
  },
  'Zaszalowanie i zabetonowanie Rdzeni I Piętra': {
    matchMode: 'AUTO_OK',
    filter: { categoryName: 'Piony nadziemia', elementType: 'Trzpienie nadziemia', floor: 'Kondygnacja 1' },
    agg: 'volumeSum',
  },
  'Zaszalowanie i zazbrojenie belek żelbetowych stropu nad I Piętrem': {
    matchMode: 'AUTO_OK',
    filter: { categoryName: 'Belki nadziemia', elementType: 'Belki nadziemia', floor: 'Kondygnacja 1' },
    agg: 'volumeSum',
  },
  'Zaszalowanie i zazbrojenie wieńcy żelbetowych': {
    matchMode: 'AUTO_OK',
    filter: { categoryName: 'Belki nadziemia', elementType: 'Wieńce nadziemia', floor: 'Kondygnacja 1' },
    agg: 'volumeSum',
  },
  'Zaszalowanie i zazbrojenie stropu nad parterem': {
    matchMode: 'AUTO_OK',
    matchReason:
      'W pliku kierownika literówka — pozycja faktycznie dotyczy stropu nad I piętrem (zgodne wartości m² i m³).',
    filter: { categoryName: 'Stropy nadziemia', elementType: 'Płyta stropowa', floor: 'Kondygnacja 1' },
    agg: 'areaSum',
  },
  'Zaszalowanie i zazbrojenie stropu nad I Piętrem': {
    matchMode: 'AUTO_OK',
    filter: { categoryName: 'Stropy nadziemia', elementType: 'Płyta stropowa', floor: 'Kondygnacja 1' },
    agg: 'areaSum',
  },
  'Zaszalowanie i zazbrojenie balkonów żelbetowych': {
    matchMode: 'AUTO_OK',
    filter: { categoryName: 'Stropy nadziemia', elementType: 'Balkony', floor: 'Kondygnacja 1' },
    agg: 'areaSum',
  },
  'Zaszalowanie i zazbrojenie schodów żelbetowych': {
    matchMode: 'MANUAL_DIFF_UNIT',
    matchReason:
      'Kierownik liczy w „kpl" (klatka schodowa). Obmiar inżynierski liczy w „szt" pojedynczych biegów. Konwersja 1:N wymaga ręcznego potwierdzenia.',
  },
  'Wieńce na windzie nad I Piętrem': {
    matchMode: 'AUTO_OK',
    filter: { categoryName: 'Szyby windowe', elementType: 'Wieniec szybu', floor: 'Kondygnacja 1' },
    agg: 'volumeSum',
  },
  'Murowanie ścian I Piętra': {
    matchMode: 'MANUAL_OUT_OF_SCOPE',
    matchReason: 'Prace murarskie — poza zakresem obmiaru konstrukcji żelbetowej.',
  },
}

export const FLOOR_RULES: Record<string, Record<string, MappingRule>> = {
  PARTER: PARTER_RULES,
  I_PIETRO: I_PIETRO_RULES,
}
