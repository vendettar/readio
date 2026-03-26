/**
 * MP3 Frame Boundary Detection and Splitting (Instruction 125)
 * Essential for splitting large files (>25MB) for Groq API limits.
 */

import type { ASRCue } from './types'

/**
 * Split an MP3 Blob into smaller chunks at frame boundaries.
 */
export async function splitMp3Blob(blob: Blob, maxChunkSize: number): Promise<Blob[]> {
  return splitMp3BlobWithTargetSizes(blob, [maxChunkSize])
}

const FRAME_BOUNDARY_SEARCH_WINDOW_BYTES = 32 * 1024
const FRAME_END_TOLERANCE_BYTES = 2
const MP3_HEADER_BYTES = 4
const MIN_NON_FINAL_CHUNK_BYTES = 256 * 1024
const MIN_NON_FINAL_CHUNK_RATIO = 0.7

type MpegVersion = 'mpeg1' | 'mpeg2' | 'mpeg25'
type MpegLayer = 'layer1' | 'layer2' | 'layer3'

interface Mp3FrameHeader {
  version: MpegVersion
  layer: MpegLayer
  bitrateKbps: number
  sampleRateHz: number
  padding: 0 | 1
  frameLength: number
}

const BITRATE_TABLE: Record<MpegVersion, Record<MpegLayer, readonly number[]>> = {
  mpeg1: {
    layer1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
    layer2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
    layer3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  },
  mpeg2: {
    layer1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
    layer2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    layer3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  },
  mpeg25: {
    layer1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
    layer2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    layer3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  },
}

const SAMPLE_RATE_TABLE: Record<MpegVersion, readonly number[]> = {
  mpeg1: [44100, 48000, 32000],
  mpeg2: [22050, 24000, 16000],
  mpeg25: [11025, 12000, 8000],
}

function parseMpegVersion(bits: number): MpegVersion | null {
  if (bits === 0b11) return 'mpeg1'
  if (bits === 0b10) return 'mpeg2'
  if (bits === 0b00) return 'mpeg25'
  return null
}

function parseMpegLayer(bits: number): MpegLayer | null {
  if (bits === 0b11) return 'layer1'
  if (bits === 0b10) return 'layer2'
  if (bits === 0b01) return 'layer3'
  return null
}

function computeMp3FrameLength(header: {
  version: MpegVersion
  layer: MpegLayer
  bitrateKbps: number
  sampleRateHz: number
  padding: 0 | 1
}): number {
  const bitrateBps = header.bitrateKbps * 1000
  if (header.layer === 'layer1') {
    return Math.floor(((12 * bitrateBps) / header.sampleRateHz + header.padding) * 4)
  }
  if (header.layer === 'layer3' && header.version !== 'mpeg1') {
    return Math.floor((72 * bitrateBps) / header.sampleRateHz + header.padding)
  }
  return Math.floor((144 * bitrateBps) / header.sampleRateHz + header.padding)
}

/**
 * Strict MPEG frame header parser.
 * Returns null for invalid/reserved header combinations.
 */
export function parseMp3FrameHeader(view: Uint8Array, offset: number): Mp3FrameHeader | null {
  if (offset < 0 || offset + MP3_HEADER_BYTES > view.length) return null

  const b0 = view[offset]
  const b1 = view[offset + 1]
  const b2 = view[offset + 2]

  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null

  const version = parseMpegVersion((b1 >> 3) & 0b11)
  const layer = parseMpegLayer((b1 >> 1) & 0b11)
  if (!version || !layer) return null

  const bitrateIndex = (b2 >> 4) & 0b1111
  const sampleRateIndex = (b2 >> 2) & 0b11
  const padding = ((b2 >> 1) & 0b1) as 0 | 1

  if (sampleRateIndex === 0b11) return null

  const bitrateKbps = BITRATE_TABLE[version][layer][bitrateIndex]
  const sampleRateHz = SAMPLE_RATE_TABLE[version][sampleRateIndex]
  if (!bitrateKbps || !sampleRateHz) return null

  const frameLength = computeMp3FrameLength({
    version,
    layer,
    bitrateKbps,
    sampleRateHz,
    padding,
  })
  if (!Number.isFinite(frameLength) || frameLength <= 0) return null

  return {
    version,
    layer,
    bitrateKbps,
    sampleRateHz,
    padding,
    frameLength,
  }
}

/**
 * Candidate boundary is valid only when next frame also validates,
 * unless candidate frame reaches file end tolerance.
 */
export function isConfirmedMp3FrameBoundary(view: Uint8Array, offset: number): boolean {
  const frame = parseMp3FrameHeader(view, offset)
  if (!frame) return false

  const nextOffset = offset + frame.frameLength
  if (nextOffset >= view.length - FRAME_END_TOLERANCE_BYTES) return true
  return parseMp3FrameHeader(view, nextOffset) !== null
}

function resolveMinimumChunkBytes(targetSize: number): number {
  return Math.max(Math.floor(targetSize * MIN_NON_FINAL_CHUNK_RATIO), MIN_NON_FINAL_CHUNK_BYTES)
}

/**
 * Split an MP3 Blob using progressive per-chunk byte targets.
 * After targets are exhausted, the last target size is reused until the file is consumed.
 */
export async function splitMp3BlobWithTargetSizes(
  blob: Blob,
  targetChunkSizes: number[]
): Promise<Blob[]> {
  if (targetChunkSizes.length === 0) {
    throw new Error('targetChunkSizes must contain at least one size')
  }

  const normalizedTargets = targetChunkSizes.map((size) => {
    if (!Number.isFinite(size) || size < 1) {
      throw new Error('targetChunkSizes must contain only strictly positive finite values')
    }
    return Math.max(1, Math.floor(size))
  })

  const arrayBuffer = await blob.arrayBuffer()
  const view = new Uint8Array(arrayBuffer)
  if (view.length === 0) {
    return [new Blob([], { type: blob.type })]
  }

  const chunks: Blob[] = []
  let offset = 0
  let targetIndex = 0

  while (offset < view.length) {
    const targetSize = normalizedTargets[Math.min(targetIndex, normalizedTargets.length - 1)]
    const preferredEnd = offset + targetSize
    const chunkEnd =
      preferredEnd >= view.length
        ? view.length
        : resolveChunkEndOffset(view, offset, preferredEnd, targetSize)

    if (chunks.length === 0) {
      chunks.push(buildSanitizedFirstChunkBlob(arrayBuffer, offset, chunkEnd, blob.type))
    } else {
      chunks.push(blob.slice(offset, chunkEnd))
    }

    offset = chunkEnd
    targetIndex += 1
  }

  return chunks
}

function resolveChunkEndOffset(
  view: Uint8Array,
  offset: number,
  preferredEnd: number,
  targetSize: number
): number {
  const minChunkBytes = resolveMinimumChunkBytes(targetSize)
  const frameBoundary = findNearestConfirmedFrameBoundary(view, offset, preferredEnd, minChunkBytes)
  if (frameBoundary !== -1 && frameBoundary > offset) {
    return frameBoundary
  }
  // If no trustworthy boundary exists near target, preserve target split and avoid over-fragmentation.
  return Math.min(preferredEnd, view.length)
}

function findNearestConfirmedFrameBoundary(
  view: Uint8Array,
  chunkStart: number,
  targetEnd: number,
  minChunkBytes: number
): number {
  const searchStart = Math.max(chunkStart + 1, targetEnd - FRAME_BOUNDARY_SEARCH_WINDOW_BYTES)
  const searchEnd = Math.min(
    view.length - MP3_HEADER_BYTES,
    targetEnd + FRAME_BOUNDARY_SEARCH_WINDOW_BYTES
  )

  let bestOffset = -1
  let bestDistance = Number.POSITIVE_INFINITY

  for (let candidate = searchStart; candidate <= searchEnd; candidate++) {
    if (!isConfirmedMp3FrameBoundary(view, candidate)) continue

    const chunkSize = candidate - chunkStart
    if (chunkSize < minChunkBytes) continue

    const distance = Math.abs(candidate - targetEnd)
    if (distance < bestDistance || (distance === bestDistance && candidate > bestOffset)) {
      bestDistance = distance
      bestOffset = candidate
    }
  }

  return bestOffset
}

function buildSanitizedFirstChunkBlob(
  arrayBuffer: ArrayBuffer,
  start: number,
  end: number,
  mimeType: string
): Blob {
  const chunkView = wipeVbrHeaders(new Uint8Array(arrayBuffer, start, end - start))
  const bufferSlice = chunkView.buffer.slice(
    chunkView.byteOffset,
    chunkView.byteOffset + chunkView.byteLength
  ) as ArrayBuffer
  return new Blob([bufferSlice], { type: mimeType })
}

/**
 * Wipes VBR headers (Xing, Info, VBRI) from the first few frames of an MP3 buffer.
 * This prevents ASR APIs (like Groq) from reading the original file's total duration
 * and allocating/billing for 45 minutes when we only send a 10-minute slice.
 */
function wipeVbrHeaders(view: Uint8Array): Uint8Array {
  // We don't want to mutate the entire source buffer if we are just slicing,
  // but since we are extracting the first chunk, we create a copy to mutate.
  const copy = new Uint8Array(view)

  // Identify if there is an ID3v2 tag at the start and skip it
  let searchStart = 0
  if (copy.length >= 10 && copy[0] === 0x49 && copy[1] === 0x44 && copy[2] === 0x33) {
    // ID3v2 size uses 7 bits per byte (bytes 6-9)
    const id3Size = (copy[6] << 21) | (copy[7] << 14) | (copy[8] << 7) | copy[9]
    // The total tag size includes the 10-byte header
    searchStart = 10 + id3Size
  }

  // Cap searchStart safely
  searchStart = Math.min(searchStart, copy.length)

  // VBR headers (Xing/Info/VBRI) only appear in the first few frames after the ID3 tag.
  // Cap the search to 4KB after the tag to avoid scanning the entire 10MB chunk.
  const searchEnd = Math.min(searchStart + 4096, copy.length - 4)

  // Search for Xing/Info/VBRI within the capped range
  for (let i = searchStart; i < searchEnd; i++) {
    // Check for 'Xing' (0x58 0x69 0x6E 0x67) or 'Info' (0x49 0x6E 0x66 0x6F)
    if (
      (copy[i] === 0x58 && copy[i + 1] === 0x69 && copy[i + 2] === 0x6e && copy[i + 3] === 0x67) ||
      (copy[i] === 0x49 && copy[i + 1] === 0x6e && copy[i + 2] === 0x66 && copy[i + 3] === 0x6f)
    ) {
      // Wipe the signature
      copy[i] = 0x00
      copy[i + 1] = 0x00
      copy[i + 2] = 0x00
      copy[i + 3] = 0x00

      // The flags field is 4 bytes right after the signature.
      // Wiping flags (setting to 0) tells the decoder that frames/bytes fields are not present.
      if (i + 7 < copy.length) {
        copy[i + 4] = 0x00
        copy[i + 5] = 0x00
        copy[i + 6] = 0x00
        copy[i + 7] = 0x00
      }
      break // Usually only one VBR header per file
    }

    // Check for 'VBRI' (0x56 0x42 0x52 0x49)
    if (copy[i] === 0x56 && copy[i + 1] === 0x42 && copy[i + 2] === 0x52 && copy[i + 3] === 0x49) {
      copy[i] = 0x00
      copy[i + 1] = 0x00
      copy[i + 2] = 0x00
      copy[i + 3] = 0x00
      break
    }
  }

  return copy
}

/**
 * Merge multiple ASR results with time offsets.
 */
export function mergeAsrCues(cuesList: ASRCue[][], durations: number[]): ASRCue[] {
  const merged: ASRCue[] = []
  let currentTimeOffset = 0

  for (let i = 0; i < cuesList.length; i++) {
    const cues = cuesList[i]
    const duration = durations[i]

    for (const cue of cues) {
      merged.push({
        ...cue,
        start: cue.start + currentTimeOffset,
        end: cue.end + currentTimeOffset,
        words: cue.words?.map((w) => ({
          ...w,
          start: w.start + currentTimeOffset,
          end: w.end + currentTimeOffset,
        })),
      })
    }
    currentTimeOffset += duration
  }

  return merged
}
