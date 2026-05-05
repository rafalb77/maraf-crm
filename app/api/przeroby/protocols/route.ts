import { NextResponse } from 'next/server'

// Endpoint w przebudowie — tworzenie protokołów wymaga teraz wyboru umowy
// (SubContract) i wpisania ilości w pozycjach umownych (ContractWorkItem).
// Nowy kreator pojawi się w osobnym kroku.
export async function POST() {
  return NextResponse.json(
    { error: 'Endpoint w przebudowie — tworzenie nowych protokołów chwilowo wyłączone' },
    { status: 410 },
  )
}
