// Dekodowanie surowego pliku wyciągu do UTF-8.
//
// ING używa różnych kodowań zależnie od formatu:
//   - camt.053 (XML)         → UTF-8 (deklaracja w prologu XML)
//   - CSV historii (Moje ING) → Windows-1250 (CP1250)
//   - MT940 (SIMP/MARS)       → CP852; BusinessOnLine bywa CP1250
//
// TextDecoder (WHATWG) obsługuje 'utf-8' i 'windows-1250', ale NIE 'cp852'.
// Strategia: XML → UTF-8; w przeciwnym razie UTF-8 jeśli poprawny, inaczej
// Windows-1250. Pliki CP852 dekodujemy jako 1250 — ASCII (IBAN, kwoty, daty,
// numery umów) jest identyczne; różnią się tylko polskie znaki w NAZWACH, a te
// przy dopasowaniu i tak normalizujemy. Ograniczenie udokumentowane.

export function decodeBankFile(buf: Buffer | Uint8Array): string {
  const bytes = buf instanceof Buffer ? buf : Buffer.from(buf)

  // BOM UTF-8
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }

  // XML → zaufaj UTF-8 (ING camt deklaruje UTF-8)
  const asciiHead = latin1Head(bytes, 200).trimStart()
  if (asciiHead.startsWith('<?xml') || asciiHead.startsWith('<Document')) {
    return new TextDecoder('utf-8').decode(bytes)
  }

  // Spróbuj UTF-8 rygorystycznie — jeśli bajty są poprawnym UTF-8, użyj go.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1250').decode(bytes)
  }
}

function latin1Head(bytes: Buffer, n: number): string {
  return Buffer.from(bytes.subarray(0, n)).toString('latin1')
}
