import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  isConfirmedMp3FrameBoundary,
  mergeAsrCues,
  parseMp3FrameHeader,
  splitMp3Blob,
  splitMp3BlobWithTargetSizes,
} from '../mp3Chunker'

// Save original to restore after tests — prevents cross-file prototype pollution
const _originalArrayBuffer = Blob.prototype.arrayBuffer
beforeAll(() => {
  if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.readAsArrayBuffer(this)
      })
    }
  }
})
afterAll(() => {
  Blob.prototype.arrayBuffer = _originalArrayBuffer
})

describe('mp3Chunker.ts MP3 VBR Header Sanitization', () => {
  function createMockVbrMp3(signature: string, totalSize: number): Blob {
    const buffer = new Uint8Array(totalSize)
    // Put an MP3 sync word at the beginning
    buffer[0] = 0xff
    buffer[1] = 0xfb

    // Insert signature a bit later to simulate side info
    const sigBytes = Array.from(signature).map((c) => c.charCodeAt(0))
    buffer.set(sigBytes, 36)

    // Set some fake flag bytes right after the signature
    buffer[40] = 0x00
    buffer[41] = 0x00
    buffer[42] = 0x00
    buffer[43] = 0x0f // 15, indicating frames and bytes are present

    // Put some MP3 sync words later to act as chunking boundaries
    if (totalSize > 200) {
      buffer[150] = 0xff
      buffer[151] = 0xfb
    }

    return new Blob([buffer], { type: 'audio/mpeg' })
  }

  it('wipes Xing header from the first chunk', async () => {
    const blob = createMockVbrMp3('Xing', 800)
    const chunks = await splitMp3Blob(blob, 500)

    expect(chunks.length).toBeGreaterThan(1)

    const chunk1Buffer = await chunks[0].arrayBuffer()
    const chunk1View = new Uint8Array(chunk1Buffer)

    // Should be zeroed out
    expect(String.fromCharCode(...chunk1View.slice(36, 40))).not.toBe('Xing')
    expect(chunk1View[36]).toBe(0x00)
    expect(chunk1View[37]).toBe(0x00)

    // Flags should be zeroed out
    expect(chunk1View[43]).toBe(0x00)

    // Second chunk shouldn't be touched by the sanitizer
    expect(chunks[1].size).toBeGreaterThan(0)
  })

  it('wipes Object Info header from the first chunk', async () => {
    const blob = createMockVbrMp3('Info', 800)
    const chunks = await splitMp3Blob(blob, 500)

    const chunk1View = new Uint8Array(await chunks[0].arrayBuffer())
    expect(String.fromCharCode(...chunk1View.slice(36, 40))).not.toBe('Info')
    expect(chunk1View[36]).toBe(0x00)
  })

  it('wipes VBRI header from the first chunk', async () => {
    const blob = createMockVbrMp3('VBRI', 800)
    const chunks = await splitMp3Blob(blob, 500)

    const chunk1View = new Uint8Array(await chunks[0].arrayBuffer())
    expect(String.fromCharCode(...chunk1View.slice(36, 40))).not.toBe('VBRI')
    expect(chunk1View[36]).toBe(0x00)
  })

  it('leaves file intact if no headers are found', async () => {
    const blob = createMockVbrMp3('RAND', 800)
    const chunks = await splitMp3Blob(blob, 500)

    const chunk1View = new Uint8Array(await chunks[0].arrayBuffer())
    expect(String.fromCharCode(...chunk1View.slice(36, 40))).toBe('RAND')
    // Flag should be untouched
    expect(chunk1View[43]).toBe(0x0f)
  })

  it('wipes header even if file is smaller than max chunk size', async () => {
    const blob = createMockVbrMp3('Xing', 400)
    const chunks = await splitMp3Blob(blob, 1000)

    expect(chunks.length).toBe(1)
    const chunk1View = new Uint8Array(await chunks[0].arrayBuffer())
    expect(String.fromCharCode(...chunk1View.slice(36, 40))).not.toBe('Xing')
    expect(chunk1View[36]).toBe(0x00)
  })

  it('supports progressive target sizes and keeps first-chunk sanitization', async () => {
    const blob = createMockVbrMp3('Xing', 1200)
    const chunks = await splitMp3BlobWithTargetSizes(blob, [250, 500])

    expect(chunks.length).toBeGreaterThan(2)

    const chunk1View = new Uint8Array(await chunks[0].arrayBuffer())
    expect(String.fromCharCode(...chunk1View.slice(36, 40))).not.toBe('Xing')
    expect(chunk1View[36]).toBe(0x00)
  })
})

describe('mp3Chunker.ts strict MP3 frame validation', () => {
  function createMpeg1Layer3Header(options?: {
    bitrateIndex?: number
    sampleRateIndex?: number
    padding?: number
  }): Uint8Array {
    const bitrateIndex = options?.bitrateIndex ?? 0b1001 // 128 kbps
    const sampleRateIndex = options?.sampleRateIndex ?? 0b00 // 44100 Hz
    const padding = options?.padding ?? 0
    return new Uint8Array([
      0xff,
      0xfb, // MPEG1 + Layer III + no CRC
      (bitrateIndex << 4) | (sampleRateIndex << 2) | (padding << 1),
      0x00,
    ])
  }

  function createFrameSequence(frameCount: number): Uint8Array {
    const header = createMpeg1Layer3Header()
    const frameLength = 417
    const bytes = new Uint8Array(frameCount * frameLength)

    for (let i = 0; i < frameCount; i++) {
      const frameOffset = i * frameLength
      bytes.set(header, frameOffset)

      // Add false sync-looking noise inside frame payload.
      if (frameOffset + 200 < bytes.length) {
        bytes[frameOffset + 200] = 0xff
        bytes[frameOffset + 201] = 0xe0
      }
      if (frameOffset + 260 < bytes.length) {
        bytes[frameOffset + 260] = 0xff
        bytes[frameOffset + 261] = 0xfb
      }
    }

    return bytes
  }

  it('parses a valid MPEG1 Layer III frame header', () => {
    const view = new Uint8Array(500)
    view.set(createMpeg1Layer3Header(), 0)

    const parsed = parseMp3FrameHeader(view, 0)
    expect(parsed).not.toBeNull()
    expect(parsed?.bitrateKbps).toBe(128)
    expect(parsed?.sampleRateHz).toBe(44100)
    expect(parsed?.frameLength).toBe(417)
  })

  it('rejects invalid bitrate and invalid sample-rate header combinations', () => {
    const invalidBitrate = new Uint8Array(500)
    invalidBitrate.set(createMpeg1Layer3Header({ bitrateIndex: 0b0000 }), 0)
    expect(parseMp3FrameHeader(invalidBitrate, 0)).toBeNull()

    const invalidSampleRate = new Uint8Array(500)
    invalidSampleRate.set(createMpeg1Layer3Header({ sampleRateIndex: 0b11 }), 0)
    expect(parseMp3FrameHeader(invalidSampleRate, 0)).toBeNull()
  })

  it('requires two-frame confirmation for split boundary validation', () => {
    const header = createMpeg1Layer3Header()
    const frameLength = 417

    const validTwoFrame = new Uint8Array(frameLength * 2 + 16)
    validTwoFrame.set(header, 0)
    validTwoFrame.set(header, frameLength)
    expect(isConfirmedMp3FrameBoundary(validTwoFrame, 0)).toBe(true)

    const singleFrameOnly = new Uint8Array(frameLength * 2 + 16)
    singleFrameOnly.set(header, 0)
    expect(isConfirmedMp3FrameBoundary(singleFrameOnly, 0)).toBe(false)
  })

  it('avoids tiny over-fragmented chunks in noisy MP3-like buffers', async () => {
    const bytes = createFrameSequence(5000)
    const stableBytes = new Uint8Array(new ArrayBuffer(bytes.byteLength))
    stableBytes.set(bytes)
    const blob = new Blob([stableBytes], { type: 'audio/mpeg' })
    const targetSize = 300 * 1024

    const chunks = await splitMp3BlobWithTargetSizes(blob, [targetSize])
    const expectedChunkCount = Math.ceil(blob.size / targetSize)
    expect(chunks.length).toBeLessThanOrEqual(expectedChunkCount + 1)

    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.size).toBeGreaterThanOrEqual(256 * 1024)
    }
  })
})

describe('mergeAsrCues', () => {
  it('merges cues correctly with time offsets', () => {
    const cuesList = [
      [{ start: 0, end: 5, text: 'Hello', words: [{ start: 0, end: 5, word: 'Hello' }] }],
      [{ start: 0, end: 2, text: 'World', words: [{ start: 0, end: 2, word: 'World' }] }],
    ]
    const durations = [10, 5]

    const merged = mergeAsrCues(cuesList, durations)
    expect(merged).toHaveLength(2)
    expect(merged[0].start).toBe(0)
    expect(merged[0].end).toBe(5)
    expect(merged[1].start).toBe(10) // 0 + 10
    expect(merged[1].end).toBe(12) // 2 + 10
    expect(merged[1].words?.[0].start).toBe(10)
  })
})
