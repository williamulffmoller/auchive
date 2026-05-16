import { readFile, writeFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs'
import { appLocalDataDir } from '@tauri-apps/api/path'

function readU32BE(b: Uint8Array, i: number): number {
  return ((b[i] << 24) | (b[i+1] << 16) | (b[i+2] << 8) | b[i+3]) >>> 0
}

function decodeSyncsafe(b: Uint8Array, i: number): number {
  return ((b[i] & 0x7f) << 21) | ((b[i+1] & 0x7f) << 14) | ((b[i+2] & 0x7f) << 7) | (b[i+3] & 0x7f)
}

function skipNullTerminator(b: Uint8Array, start: number, utf16: boolean): number {
  if (!utf16) {
    for (let i = start; i < b.length; i++) if (b[i] === 0) return i + 1
  } else {
    for (let i = start; i < b.length - 1; i += 2) if (b[i] === 0 && b[i+1] === 0) return i + 2
  }
  return b.length
}

function extractID3Cover(b: Uint8Array): Uint8Array | null {
  if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null
  const v = b[3]
  const tagSize = decodeSyncsafe(b, 6)
  let pos = 10
  if (b[5] & 0x40) {
    // skip extended header
    pos += v === 4 ? decodeSyncsafe(b, 10) : readU32BE(b, 10) + 4
  }
  const end = 10 + tagSize

  while (pos < end - 10) {
    if (b[pos] === 0) break
    let id: string, size: number, dataPos: number
    if (v === 2) {
      id = String.fromCharCode(b[pos], b[pos+1], b[pos+2])
      size = (b[pos+3] << 16) | (b[pos+4] << 8) | b[pos+5]
      dataPos = pos + 6
    } else {
      id = String.fromCharCode(b[pos], b[pos+1], b[pos+2], b[pos+3])
      // Note: ID3v2.4 spec says syncsafe, but many encoders (iTunes) write big-endian
      size = readU32BE(b, pos + 4)
      dataPos = pos + 10
    }
    if (size <= 0 || dataPos + size > b.length) break

    const isAPIC = v === 2 ? id === 'PIC' : id === 'APIC'
    if (isAPIC) {
      let i = dataPos
      const enc = b[i++]
      const utf16 = enc === 1 || enc === 2
      if (v === 2) {
        i += 3 // 3-char format e.g. "JPG"
      } else {
        while (i < b.length && b[i] !== 0) i++ // MIME type
        i++ // null terminator
      }
      i++ // picture type
      i = skipNullTerminator(b, i, utf16) // description
      if (i < dataPos + size) return b.slice(i, dataPos + size)
    }
    pos = dataPos + size
  }
  return null
}

function extractMP4Cover(b: Uint8Array): Uint8Array | null {
  function findChild(data: Uint8Array, start: number, end: number, type: string): [number, number] | null {
    let pos = start
    while (pos <= end - 8) {
      const s = readU32BE(data, pos)
      if (s < 8 || pos + s > end) break
      const t = String.fromCharCode(data[pos+4], data[pos+5], data[pos+6], data[pos+7])
      if (t === type) return [pos + 8, pos + s]
      pos += s
    }
    return null
  }

  const moov = findChild(b, 0, b.length, 'moov')
  if (!moov) return null
  const udta = findChild(b, moov[0], moov[1], 'udta')
  if (!udta) return null
  const metaRaw = findChild(b, udta[0], udta[1], 'meta')
  if (!metaRaw) return null
  const meta: [number, number] = [metaRaw[0] + 4, metaRaw[1]] // version/flags
  const ilst = findChild(b, meta[0], meta[1], 'ilst')
  if (!ilst) return null
  const covr = findChild(b, ilst[0], ilst[1], 'covr')
  if (!covr) return null
  const data = findChild(b, covr[0], covr[1], 'data')
  if (!data) return null
  // data atom: 4 bytes type indicator + 4 bytes locale = 8 bytes before image data
  const imgStart = data[0] + 8
  return imgStart < data[1] ? b.slice(imgStart, data[1]) : null
}

export async function extractAndSaveCoverArt(filePath: string): Promise<string | null> {
  try {
    const bytes = await readFile(filePath)
    const b = new Uint8Array(bytes)
    let imageBytes: Uint8Array | null = null

    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
      imageBytes = extractID3Cover(b)
    } else if (b.length > 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      imageBytes = extractMP4Cover(b)
    }

    if (!imageBytes || imageBytes.length < 4) return null

    const isPng = imageBytes[0] === 0x89 && imageBytes[1] === 0x50
    const ext = isPng ? 'png' : 'jpg'
    const id = crypto.randomUUID()
    const filename = `covers/${id}.${ext}`

    try { await mkdir('covers', { baseDir: BaseDirectory.AppLocalData, recursive: true }) } catch {}
    await writeFile(filename, imageBytes, { baseDir: BaseDirectory.AppLocalData })

    const dir = await appLocalDataDir()
    return dir.endsWith('/') ? `${dir}${filename}` : `${dir}/${filename}`
  } catch {
    return null
  }
}
