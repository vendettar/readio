export interface ZipFileEntry {
  name: string
  bytes: Uint8Array
}

const UTF8_FILENAME_FLAG = 0x0800

export interface SimpleZipOptions {
  useCurrentTimestamp?: boolean
}

export async function blobToZipBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer()
    return new Uint8Array(buffer)
  }

  if (typeof Response !== 'undefined') {
    try {
      const buffer = await new Response(blob as unknown as BodyInit).arrayBuffer()
      return new Uint8Array(buffer)
    } catch {
      // Fall through to FileReader fallback.
    }
  }

  if (typeof FileReader === 'undefined') {
    throw new Error('Blob reader is unavailable')
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const normalizedBlob =
      blob instanceof Blob
        ? blob
        : new Blob([blob as unknown as BlobPart], {
            type: (blob as unknown as { type?: string }).type,
          })
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob bytes'))
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result))
        return
      }
      reject(new Error('Expected ArrayBuffer result when reading blob bytes'))
    }
    reader.readAsArrayBuffer(normalizedBlob)
  })
}

export function buildSimpleZip(files: ZipFileEntry[], options?: SimpleZipOptions): Blob {
  const parts: Uint8Array[] = []
  const centralDir: Uint8Array[] = []
  let offset = 0
  const { dosDate, dosTime } = options?.useCurrentTimestamp ? getDosTimestamp() : ZERO_DOS_TIMESTAMP

  for (const file of files) {
    const nameBytes = encodeZipText(file.name)
    const crc = crc32(file.bytes)

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lhView = new DataView(localHeader.buffer)
    lhView.setUint32(0, 0x04034b50, true)
    lhView.setUint16(4, 20, true)
    lhView.setUint16(6, UTF8_FILENAME_FLAG, true)
    lhView.setUint16(8, 0, true)
    lhView.setUint16(10, dosTime, true)
    lhView.setUint16(12, dosDate, true)
    lhView.setUint32(14, crc, true)
    lhView.setUint32(18, file.bytes.length, true)
    lhView.setUint32(22, file.bytes.length, true)
    lhView.setUint16(26, nameBytes.length, true)
    lhView.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)

    parts.push(localHeader, file.bytes)

    const cdEntry = new Uint8Array(46 + nameBytes.length)
    const cdView = new DataView(cdEntry.buffer)
    cdView.setUint32(0, 0x02014b50, true)
    cdView.setUint16(4, 20, true)
    cdView.setUint16(6, 20, true)
    cdView.setUint16(8, UTF8_FILENAME_FLAG, true)
    cdView.setUint16(10, 0, true)
    cdView.setUint16(12, dosTime, true)
    cdView.setUint16(14, dosDate, true)
    cdView.setUint32(16, crc, true)
    cdView.setUint32(20, file.bytes.length, true)
    cdView.setUint32(24, file.bytes.length, true)
    cdView.setUint16(28, nameBytes.length, true)
    cdView.setUint16(30, 0, true)
    cdView.setUint16(32, 0, true)
    cdView.setUint16(34, 0, true)
    cdView.setUint16(36, 0, true)
    cdView.setUint32(38, 0, true)
    cdView.setUint32(42, offset, true)
    cdEntry.set(nameBytes, 46)

    centralDir.push(cdEntry)
    offset += localHeader.length + file.bytes.length
  }

  const cdOffset = offset
  let cdSize = 0
  for (const cd of centralDir) {
    cdSize += cd.length
    parts.push(cd)
  }

  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)
  eocdView.setUint16(4, 0, true)
  eocdView.setUint16(6, 0, true)
  eocdView.setUint16(8, files.length, true)
  eocdView.setUint16(10, files.length, true)
  eocdView.setUint32(12, cdSize, true)
  eocdView.setUint32(16, cdOffset, true)
  eocdView.setUint16(20, 0, true)
  parts.push(eocd)

  return new Blob(parts as BlobPart[], { type: 'application/zip' })
}

function encodeZipText(content: string): Uint8Array {
  return new TextEncoder().encode(content)
}

const ZERO_DOS_TIMESTAMP = {
  dosDate: 0,
  dosTime: 0,
} as const

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index]
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function getDosTimestamp(): { dosDate: number; dosTime: number } {
  const now = new Date()
  const year = Math.max(1980, now.getFullYear())
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  return { dosDate, dosTime }
}
