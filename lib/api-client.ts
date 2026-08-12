// Pomocnicze dla fetch() z komponentów klienckich (zapisy do /api/*).

/**
 * Wykrywa wygasłą sesję (middleware zwraca 401 po 8h od zalogowania) przy
 * zapisie z formularza. Pokazuje instrukcję ratującą niezapisane zmiany:
 * re-login w NOWEJ karcie przeglądarki odświeża cookie dla całej przeglądarki,
 * więc po powrocie wystarczy kliknąć Zapisz ponownie. Celowo BEZ redirectu —
 * przekierowanie zniszczyłoby stan formularza i pracę usera.
 *
 * Zwraca true gdy sesja wygasła — wywołujący powinien przerwać obsługę błędu
 * (komunikat już pokazany) i zostawić formularz otwarty.
 */
export function isSessionExpired(res: Response): boolean {
  if (res.status !== 401) return false
  alert(
    'UWAGA: ta zmiana NIE została zapisana — sesja wygasła (limit 8 godzin od zalogowania).\n\n' +
      'Zaloguj się ponownie w NOWEJ karcie przeglądarki, wróć tutaj i ponów ostatnią ' +
      'zmianę. Nie zamykaj tej karty — niezapisane dane w formularzach nie przepadną.',
  )
  return true
}

export const SESSION_EXPIRED_HINT = 'Sesja wygasła — zaloguj się w nowej karcie i ponów zmianę.'
