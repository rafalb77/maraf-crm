# Moduł Obmiary z rysunków — punkt startowy

**Status**: 🟡 zaplanowany w schemie + zależnościach, ale **brak UI/API/logiki**. Tu opis stanu i pytania projektowe do nowej sesji.

## Co JEST gotowe

### Schema (`prisma/schema.prisma`)

3 modele już zdefiniowane (przejrzane, nie zmieniane od początku projektu):

```
DrawingProject       → np. "Budynek A – Kondygnacja 0"
  ├── name, description, type (ARCHITEKTONICZNY | KONSTRUKCYJNY | INSTALACYJNY)
  └── drawings: Drawing[]

Drawing              → plik DXF/PDF/DWG/IMAGE
  ├── projectId, name, originalName, fileType, filePath, fileSize
  ├── scaleLabel ("1:50"), pixelsPerMeter (kalibracja)
  ├── pageWidth, pageHeight
  ├── status (UPLOADED | READY | ERROR)
  ├── aiAnalyzed (boolean)
  └── elements: DrawingElement[]

DrawingElement       → pojedynczy element wyobmiarowany
  ├── type:  KONSTRUKCYJNY: STROP | PODCIAG | SLUP | WIENIEC | SCIANA_ZB |
  │                          LAW_FUND | STOP_FUND | NADPROZ
  │          ARCHITEKTONICZNY: ELEWACJA | TYNK_ZEW | TYNK_WEW | POSADZKA |
  │                            DACH | OKNO | DRZWI | OCIEPLENIE
  ├── label, floor (PARTER | PIETRO_1 | ...)
  ├── geometry (JSON: [{x,y},...] — punkty w px na canvas)
  ├── lengthM, widthM, heightM, perimeterM, areaM2, volumeM3
  ├── concreteM3, steelKg (szacunki materiałowe wg normy)
  ├── unit (M2 | M3 | MB | SZT | KG | T)
  ├── qty (ilość rozliczeniowa)
  ├── source (MANUAL | AI | DXF_AUTO)
  └── verified (boolean — kierownik zatwierdził)
```

### Zależności (`package.json`)

- **`dxf-parser`** — parsowanie plików DXF (CAD/AutoCAD). W `next.config.js` jest w `experimental.serverComponentsExternalPackages` (nie bundlowane do klienta).
- **`@anthropic-ai/sdk`** — Claude API. `.env.example` ma komentarz „Analiza AI rysunków DXF/PDF" przy `ANTHROPIC_API_KEY`.

### Zmienne środowiskowe

- `ANTHROPIC_API_KEY` (opcjonalne, w `.env.example`) — do analizy AI rysunków
- `ODA_CONVERTER_PATH` (opcjonalne, Windows) — do konwersji DXF/DWG przez ODA File Converter

### Powiązania z innymi modułami

- **Schema NIE łączy** DrawingElement z WorkItem (moduł Przeroby) — brak FK. Czyli obecnie obmiar z rysunku i obmiar inżynierski Marafa to **dwa osobne światy**. To może być świadome (rysunki = beta), ale w przyszłości warto rozważyć integrację: „Obmiar z rysunku → import jako WorkItem do WorkCategory".

## Co NIE JEST gotowe

- ❌ Brak `app/(app)/drawings/` (UI)
- ❌ Brak `app/api/drawings/` (endpointy)
- ❌ Brak `lib/dxf-import.ts` / `lib/drawing-canvas.tsx` / `lib/ai-drawing-analyzer.ts`
- ❌ Brak miejsca uploadu plików (`public/uploads/drawings/` lub bind mount)
- ❌ Brak linka w sidebar do modułu
- ❌ Brak referencji do drawings w żadnym istniejącym pliku (sprawdzono `grep DrawingProject app lib components`)

## Pytania projektowe — **wybierz scope zanim zaczniesz kodować**

Schema jest ambitna (PDF + DXF + DWG + IMAGE, AI, manualne klikanie, automatyczne parsowanie). Realnie pierwsza iteracja powinna mieć **WĄSKI scope**. Pytania do usera:

### 1. Cel biznesowy
- ❓ Czy ten moduł ma **zastąpić** obecny obmiar inżynierski Marafa (xlsx → Przeroby), czy jest osobnym narzędziem?
- ❓ Kto będzie wprowadzał dane — inżynier (sam wykonuje obmiar), kierownik (czy AI), czy admin (jednorazowo)?
- ❓ Jakie typy plików dominują w praktyce? **DXF / PDF / skany**? Każdy ma inny tech-stack (DXF = strukturalny parse, PDF = render + OCR, skan = obraz + AI).

### 2. Funkcjonalność MVP (do wyboru — od najprostszej do najtrudniejszej)

**A. Tylko upload + manualne klikanie na rysunku (kanwa)**
- User uploaduje PDF/JPG/PNG
- Kalibruje skalę (klika 2 punkty, wpisuje metryczną odległość)
- Klika kontur elementu → app oblicza powierzchnię z geometrii
- Zapisuje DrawingElement z `source='MANUAL'`
- **~3 dni roboty**, bez AI, bez parsowania

**B. Parser DXF (automatyczny)**
- Upload DXF
- `dxf-parser` czyta linie, polilinie, hatche
- Auto-tworzy DrawingElement na podstawie warstw nazwanych (warstwa „SCIANY_ZB" → SCIANA_ZB elements)
- User weryfikuje, koryguje (`verified=true`)
- **~5-7 dni** + zależne od jakości plików DXF (struktura warstw, jednostek)

**C. AI analiza PDF/IMAGE (Claude Vision)**
- Upload skanu lub PDF (render do bitmapy)
- Claude API z prompt'em „znajdź ściany żelbetowe na tym rysunku, podaj wymiary w px"
- Auto-tworzy DrawingElement z `source='AI'`, `verified=false`
- User weryfikuje przed użyciem
- **~5-10 dni**, plus koszt API (Claude Vision ~$0.01/rysunek), plus jakość będzie zmienna

**D. Pełna integracja z Przerobami**
- DrawingElement → eksport do WorkItem
- Mapowanie: `type='SCIANA_ZB' floor='PARTER'` → WorkCategory='Piony 0' WorkItem
- Obmiar z rysunku zastępuje obmiar xlsx Marafa
- **Plus 3-5 dni** ponad A/B/C

### 3. Stacking technologiczny — decyzje

- **Renderowanie PDF**: `pdf.js` (Mozilla, klient-side, popularny) lub `pdf2pic`/`pdfimages` (server-side). pdf.js łatwiej zintegrować z kanwą do klikania.
- **Kanwa do klikania**: `<canvas>` natywny, `Konva.js`, `Fabric.js`. Konva ma dobre handlowe API dla polygon edit + drag.
- **Konwersja DWG → DXF**: ODA File Converter (Windows binary, jest w env.example). Plus alternatywne: `libredwg` na Linux, ale lub konwersja klient-side.
- **Upload plików**: schema mówi `filePath` (string). Trzeba zdecydować — local filesystem (`public/uploads/drawings/`, Coolify bind mount) czy S3-compat (Backblaze B2, Cloudflare R2)? Lokalny prostszy, S3 lepszy długoterminowo.

## Rekomendacja od Claude (do akceptacji w nowej sesji)

**MVP = wariant A** (upload + manualne klikanie):
1. Strona `/drawings` — lista projektów + button „Dodaj projekt"
2. Strona `/drawings/[projectId]` — lista rysunków + upload
3. Strona `/drawings/[projectId]/[drawingId]` — **canvas z PDF/IMAGE renderem + klikanie**
   - Tryb kalibracji (2 punkty → metryczna odległość → pixelsPerMeter)
   - Tryb obmiaru (polygon click → DrawingElement)
   - Lista elementów po prawej z edycją/usuwaniem
4. Endpoint `POST /api/drawings/upload` — przyjmuje plik, zapisuje do `public/uploads/drawings/` (lub uploads na bind mount Coolify), tworzy Drawing record
5. Endpoint `POST /api/drawings/[id]/elements` — CRUD DrawingElement
6. **Po MVP**: rozważyć B (DXF parser) jeśli sensowny dla Maraf

**Czego NIE robić w MVP**:
- AI analiza (Claude Vision) — koszt + jakość niejasna, dorobić jak A działa
- DWG (potrzebuje konwertera ODA) — najpierw obsłuż DXF + PDF
- Eksport do WorkItem (Przeroby) — najpierw mieć ELEMENT-y, potem łączyć

## Jak rozpocząć w nowej sesji

```
"Zacznijmy moduł obmiarów z rysunków. Przeczytaj
docs/obmiary-rozpoczecie.md i odpowiedz mi na 3 pytania
projektowe — niech wybiorę scope MVP."
```

Lub jeśli akceptujesz rekomendację:

```
"Robimy wariant A z docs/obmiary-rozpoczecie.md. Zacznij od UI listy
projektów + endpointu uploadu. Plus dodaj link w sidebarze."
```

Wtedy Claude:
1. Przeczyta CLAUDE.md (auto) + dokument ten
2. Zna pełen kontekst — schema, deps, MVP scope
3. Robi UI + API krok po kroku z preview/test po każdym

## Pliki do stworzenia (przy wariancie A)

| Plik | Co robi |
|---|---|
| `app/(app)/drawings/page.tsx` | Lista projektów + button „Nowy projekt" |
| `app/(app)/drawings/[projectId]/page.tsx` | Lista rysunków w projekcie + upload |
| `app/(app)/drawings/[projectId]/[drawingId]/page.tsx` | Canvas editor (server wrapper) |
| `components/drawings/DrawingCanvas.tsx` | Klient — PDF/IMG render + click-to-measure |
| `components/drawings/ElementsList.tsx` | Lista DrawingElement po prawej + edycja |
| `app/api/drawings/projects/route.ts` | CRUD DrawingProject |
| `app/api/drawings/upload/route.ts` | Upload PDF/JPG/PNG → DrawingProject+Drawing |
| `app/api/drawings/[id]/elements/route.ts` | CRUD DrawingElement |
| `lib/drawing-geometry.ts` | Pure functions: polygon area, scale conversion |

Plus link w `components/layout/Sidebar.tsx` (sekcja Przeroby? lub osobna „Obmiary"?).
