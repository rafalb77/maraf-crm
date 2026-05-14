// Minimalny enkoder ZIP (metoda STORE — bez kompresji) + CRC32.
// Zero zaleznosci — pliki PNG sa juz skompresowane, wiec STORE nie traci na rozmiarze,
// a unikamy dodawania biblioteki (jszip) i komplikacji z worktree/node_modules.
//
// Format ZIP: local file header + dane (per plik) → central directory → EOCD.

let CRC_TABLE: Uint32Array | null = null

function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[n] = c >>> 0
  }
  CRC_TABLE = t
  return t
}

function crc32(buf: Buffer): number {
  const t = crcTable()
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

export type ZipEntry = { name: string; data: Buffer }

/**
 * Buduje archiwum ZIP (STORE) z listy plikow. Zwraca Buffer gotowy do wyslania.
 */
export function createZip(files: ZipEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8')
    const crc = crc32(f.data)
    const size = f.data.length

    // Local file header (30 bajtow + nazwa)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0) // signature
    lh.writeUInt16LE(20, 4) // version needed
    lh.writeUInt16LE(0, 6) // flags
    lh.writeUInt16LE(0, 8) // method = STORE
    lh.writeUInt16LE(0, 10) // mod time
    lh.writeUInt16LE(0, 12) // mod date
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(size, 18) // compressed size
    lh.writeUInt32LE(size, 22) // uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28) // extra field length
    localParts.push(lh, nameBuf, f.data)

    // Central directory entry (46 bajtow + nazwa)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0) // signature
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6) // version needed
    cd.writeUInt16LE(0, 8) // flags
    cd.writeUInt16LE(0, 10) // method
    cd.writeUInt16LE(0, 12) // mod time
    cd.writeUInt16LE(0, 14) // mod date
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(size, 20) // compressed size
    cd.writeUInt32LE(size, 24) // uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30) // extra field length
    cd.writeUInt16LE(0, 32) // comment length
    cd.writeUInt16LE(0, 34) // disk number start
    cd.writeUInt16LE(0, 36) // internal attrs
    cd.writeUInt32LE(0, 38) // external attrs
    cd.writeUInt32LE(offset, 42) // local header offset
    centralParts.push(cd, nameBuf)

    offset += lh.length + nameBuf.length + f.data.length
  }

  const centralBuf = Buffer.concat(centralParts)

  // End of central directory record (22 bajty)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // signature
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // disk with central dir
  eocd.writeUInt16LE(files.length, 8) // entries on this disk
  eocd.writeUInt16LE(files.length, 10) // total entries
  eocd.writeUInt32LE(centralBuf.length, 12) // central dir size
  eocd.writeUInt32LE(offset, 16) // central dir offset
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localParts, centralBuf, eocd])
}
