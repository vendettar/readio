import { Buffer } from 'buffer'
import { parseBlob } from 'music-metadata'
import { log, warn } from '../lib/logger'

// Polyfill Buffer for music-metadata in Worker environment
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer
}

// ============================================================================
// Artwork Normalization Utilities (Worker Compatible)
// ============================================================================

/** JPEG magic bytes and markers */
const JPEG = {
  SOI: [0xff, 0xd8] as const, // Start of Image
  EOI: [0xff, 0xd9] as const, // End of Image
} as const

// type CanvasSource = ImageBitmap

/**
 * Checks if the blob is a JPEG based on MIME type.
 */
function isJpegBlob(blob: Blob): boolean {
  return blob.type === 'image/jpeg' || blob.type === 'image/jpg'
}

function getTagValueField(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined
  return (value as Record<string, unknown>)[key]
}

function getUint8ArrayFromUnknown(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
  }
  return undefined
}

/**
 * Fixes malformed JPEG by appending EOI marker if missing.
 */
async function fixJpegEoi(blob: Blob): Promise<Blob> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  if (
    bytes.length >= 2 &&
    bytes[bytes.length - 2] === JPEG.EOI[0] &&
    bytes[bytes.length - 1] === JPEG.EOI[1]
  ) {
    return blob
  }

  // Append EOI marker
  const fixed = new Uint8Array(bytes.length + 2)
  fixed.set(bytes)
  fixed.set(JPEG.EOI, bytes.length)

  return new Blob([fixed], { type: 'image/jpeg' })
}

/*
async function decodeImageBlob(blob: Blob): Promise<CanvasSource> {
  return await createImageBitmap(blob)
}
*/

// ============================================================================
// Worker Handling
// ============================================================================

export interface ParseResult {
  title?: string
  artist?: string
  album?: string
  duration?: number
  artworkBlob?: Blob // Normalized artwork
}

self.onmessage = async (e: MessageEvent<File>) => {
  const file = e.data
  log('[MetadataWorker] Starting parse for:', file.name, 'Size:', file.size, 'Type:', file.type)
  try {
    const metadata = await parseBlob(file, {
      skipCovers: false,
      includeChapters: false,
    })

    log('[MetadataWorker] Parse success. Common:', {
      title: metadata.common.title,
      album: metadata.common.album,
      pictureCount: metadata.common.picture?.length || 0,
    })

    const result: ParseResult = {
      title: metadata.common.title,
      artist: metadata.common.artist,
      album: metadata.common.album,
    }

    if (metadata.format.duration && Number.isFinite(metadata.format.duration)) {
      result.duration = Math.round(metadata.format.duration)
    }

    // --- Enhanced Artwork Extraction ---
    let bestPic: { data: Uint8Array; format: string; type?: string; size: number } | null = null

    // 1. Try unified common.picture first (most reliable)
    const commonPics = metadata.common.picture || []
    if (commonPics.length > 0) {
      const frontCovers = commonPics.filter(
        (p) => p.type === 'Cover (front)' || p.type === 'Front Cover'
      )
      const candidates = frontCovers.length > 0 ? frontCovers : commonPics
      const winner = candidates.reduce(
        (max, curr) => (curr.data.length > max.data.length ? curr : max),
        candidates[0]
      )

      bestPic = {
        data: winner.data,
        format: winner.format,
        type: winner.type,
        size: winner.data.length,
      }
    }
    // 2. Fallback to manual native tag digging (useful for some edge cases or formats music-metadata missed)
    else if (metadata.native) {
      for (const version of Object.keys(metadata.native)) {
        const tags = metadata.native[version]
        if (!Array.isArray(tags)) continue

        for (const tag of tags) {
          // ID3 (APIC/PIC), MP4 (covr), FLAC (PICTURE)
          if (['APIC', 'PIC', 'covr', 'METADATA_BLOCK_PICTURE'].includes(tag.id)) {
            let data: Uint8Array | undefined
            let format = 'image/jpeg' // Default
            let type: string | undefined

            if (tag.value && typeof tag.value === 'object') {
              const dataValue = getTagValueField(tag.value, 'data')
              data = getUint8ArrayFromUnknown(dataValue)
              const formatValue = getTagValueField(tag.value, 'format')
              if (typeof formatValue === 'string' && formatValue.trim()) {
                format = formatValue
              }
              const typeValue = getTagValueField(tag.value, 'type')
              if (typeof typeValue === 'string' && typeValue.trim()) {
                type = typeValue
              }
            } else if (tag.value instanceof Uint8Array) {
              data = tag.value
            }

            if (data && data.length > 0) {
              if (!bestPic || data.length > bestPic.size) {
                bestPic = { data, format, type, size: data.length }
              }
            }
          }
        }
      }
    }

    if (bestPic) {
      // Normalize MIME type (some parsers return 'jpg' or 'JPEG' instead of 'image/jpeg')
      let mimeType = bestPic.format.toLowerCase()
      if (!mimeType.includes('/')) {
        if (mimeType === 'jpg' || mimeType === 'jpeg') mimeType = 'image/jpeg'
        else if (mimeType === 'png') mimeType = 'image/png'
        else if (mimeType === 'webp') mimeType = 'image/webp'
        else mimeType = `image/${mimeType}`
      }

      const blobBytes = new Uint8Array(bestPic.data.byteLength)
      blobBytes.set(bestPic.data)
      const initialBlob = new Blob([blobBytes], { type: mimeType })

      // Apply JPEG EOI repair if needed
      if (isJpegBlob(initialBlob)) {
        try {
          result.artworkBlob = await fixJpegEoi(initialBlob)
        } catch (e) {
          warn('[MetadataWorker] JPEG repair failed, using original:', e)
          result.artworkBlob = initialBlob
        }
      } else {
        result.artworkBlob = initialBlob
      }
    }

    self.postMessage({ success: true, data: result })
  } catch (error) {
    self.postMessage({ success: false, error: (error as Error).message })
  }
}
