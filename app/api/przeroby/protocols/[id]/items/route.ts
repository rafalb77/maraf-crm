import { NextResponse } from 'next/server'

// Endpoint wyłączony — model protokołu został przebudowany na pozycje umowne.
// Nowy zapis pozycji wprowadzimy w osobnym kroku (kreator / edytor protokołu).
export async function PUT() {
  return NextResponse.json(
    { error: 'Endpoint w przebudowie — protokoły bazują teraz na pozycjach umownych' },
    { status: 410 },
  )
}
