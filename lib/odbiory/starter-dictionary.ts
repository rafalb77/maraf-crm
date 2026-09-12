// Słownik startowy usterek (legenda) — do jednorazowego wgrania z /odbiory/slownik.
// Kody stałe; użytkownik dopisuje własne pozycje. Źródła: listy kontrolne firm
// odbiorowych i normy (patrz propozycja modułu, §8).
export const STARTER_DEFECT_TYPES: { code: number; name: string; trade: string; defaultDays: number | null; defaultPriority?: string }[] = [
  // stan surowy / konstrukcja / mury
  { code: 1, name: 'Brak kąta przy otworze (drzwi / okno)', trade: 'MURY', defaultDays: 7 },
  { code: 2, name: 'Odchylenie ściany od pionu ponad 3 mm/m', trade: 'MURY', defaultDays: 7 },
  { code: 3, name: 'Ściana krzywa / odchylenie od płaszczyzny', trade: 'MURY', defaultDays: 7 },
  { code: 4, name: 'Otwór o złym wymiarze lub w złym miejscu', trade: 'MURY', defaultDays: 7, defaultPriority: 'PILNY' },
  { code: 5, name: 'Brak nadproża lub nadproże źle oparte', trade: 'KONSTRUKCJA', defaultDays: 7, defaultPriority: 'PILNY' },
  { code: 6, name: 'Niedomurowanie / szczelina przy stropie', trade: 'MURY', defaultDays: 7 },
  { code: 7, name: 'Spoiny niewypełnione / mur nieprzewiązany', trade: 'MURY', defaultDays: 7 },
  { code: 8, name: 'Rysa / pęknięcie ściany', trade: 'MURY', defaultDays: 7 },
  { code: 9, name: 'Ubytek betonu, raki, odsłonięte zbrojenie', trade: 'KONSTRUKCJA', defaultDays: 7, defaultPriority: 'PILNY' },
  { code: 10, name: 'Strop / wieniec: nierówność, przeciek, wyciek mleczka', trade: 'KONSTRUKCJA', defaultDays: 7 },
  { code: 11, name: 'Brak lub uszkodzenie izolacji (przeciwwilgociowej / termicznej)', trade: 'KONSTRUKCJA', defaultDays: 7 },
  { code: 12, name: 'Brak przepustu / otworu instalacyjnego wg projektu', trade: 'MURY', defaultDays: 7 },
  { code: 13, name: 'Niezgodność z projektem (inne)', trade: 'OGOLNE', defaultDays: 7 },
  // tynki
  { code: 14, name: 'Odchylenie tynku od płaszczyzny (ponad 5 mm / 2 m)', trade: 'TYNKI', defaultDays: 7 },
  { code: 15, name: 'Brak kąta prostego w narożu (ponad 4 mm / 1 m)', trade: 'TYNKI', defaultDays: 7 },
  { code: 16, name: 'Pęknięcie tynku (naroża otworów, styki)', trade: 'TYNKI', defaultDays: 7 },
  { code: 17, name: 'Ubytek / odprysk tynku', trade: 'TYNKI', defaultDays: 7 },
  { code: 18, name: 'Brak narożnika ochronnego', trade: 'TYNKI', defaultDays: 7 },
  { code: 19, name: 'Zawilgocenie / ślady zalania', trade: 'TYNKI', defaultDays: 7 },
  // posadzki
  { code: 20, name: 'Nierówność wylewki (ponad 5 mm / 2 m)', trade: 'POSADZKI', defaultDays: 7 },
  { code: 21, name: 'Pęknięcie wylewki', trade: 'POSADZKI', defaultDays: 7 },
  { code: 22, name: 'Brak dylatacji obwodowej', trade: 'POSADZKI', defaultDays: 7 },
  { code: 23, name: 'Głuche pole / odspojenie posadzki', trade: 'POSADZKI', defaultDays: 7 },
  // okna i drzwi
  { code: 24, name: 'Rysa / uszkodzenie szyby', trade: 'OKNA', defaultDays: 14 },
  { code: 25, name: 'Ościeżnica odchylona od pionu / skrzywiona', trade: 'OKNA', defaultDays: 7 },
  { code: 26, name: 'Nieszczelność okna, uszczelka, brak regulacji', trade: 'OKNA', defaultDays: 7 },
  { code: 27, name: 'Brak taśm paroszczelnych / obróbki okna', trade: 'OKNA', defaultDays: 7 },
  { code: 28, name: 'Parapet luźny, krzywy lub bez spadku', trade: 'OKNA', defaultDays: 7 },
  { code: 29, name: 'Drzwi: ocieranie, luz, uszkodzenie skrzydła', trade: 'DRZWI', defaultDays: 7 },
  // elektryka
  { code: 30, name: 'Brak gniazda / łącznika / puszki wg projektu', trade: 'ELEKTRYKA', defaultDays: 7 },
  { code: 31, name: 'Puszka luźna, krzywa lub na złej wysokości', trade: 'ELEKTRYKA', defaultDays: 7 },
  { code: 32, name: 'Brak zasilania / obwód niezgodny z projektem', trade: 'ELEKTRYKA', defaultDays: 7, defaultPriority: 'PILNY' },
  { code: 33, name: 'Rozdzielnica bez opisów / zabezpieczenia niezgodne', trade: 'ELEKTRYKA', defaultDays: 7 },
  // sanitarna / wentylacja
  { code: 34, name: 'Przeciek na zaworze / podejściu', trade: 'SANITARNA', defaultDays: 3, defaultPriority: 'PILNY' },
  { code: 35, name: 'Podejście wod-kan w złym miejscu / brak podejścia', trade: 'SANITARNA', defaultDays: 7 },
  { code: 36, name: 'Grzejnik: brak głowicy, mocowanie, odpowietrzenie', trade: 'SANITARNA', defaultDays: 7 },
  { code: 37, name: 'Wentylacja: brak ciągu / ciąg wsteczny / brak kratki', trade: 'WENTYLACJA', defaultDays: 7 },
  // balkony / wykończenie / porządkowe
  { code: 38, name: 'Balkon: brak spadku, obróbka, odpływ', trade: 'BALKONY', defaultDays: 7 },
  { code: 39, name: 'Balustrada za niska / luźna', trade: 'BALKONY', defaultDays: 7, defaultPriority: 'PILNY' },
  { code: 40, name: 'Prace niedokończone', trade: 'OGOLNE', defaultDays: 7 },
  { code: 41, name: 'Nieposprzątane / gruz / brud', trade: 'OGOLNE', defaultDays: 3 },
]
