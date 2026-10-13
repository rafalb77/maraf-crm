import { redirect } from 'next/navigation'

// Modul "Kaucje gwarancyjne" zostal rozszerzony do "Obciazen kontrahentow"
// (kaucje gw. + koszty budowy + kary + prad, per kontrahent). Stary adres
// przekierowuje, zeby zakladki/linki userow dzialaly dalej.
export default function KaucjeRedirect() {
  redirect('/finanse/obciazenia')
}
