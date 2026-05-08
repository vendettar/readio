import { describe, expect, it } from 'vitest'
import { getValidExternalHttpUrl } from '../urlSafety'

describe('urlSafety', () => {
  it('accepts normal public http and https urls', () => {
    expect(getValidExternalHttpUrl('https://example.com/episode')).toBe(
      'https://example.com/episode'
    )
    expect(getValidExternalHttpUrl('http://example.com/transcript.vtt')).toBe(
      'http://example.com/transcript.vtt'
    )
  })

  it('rejects non-http schemes and local/private destinations', () => {
    const blocked = [
      'javascript:alert(1)',
      'https://localhost:3000/admin',
      'https://podcast.localhost/internal',
      'https://printer.local/status',
      'http://127.0.0.1:8080',
      'http://10.0.0.5',
      'http://172.16.4.20',
      'http://192.168.1.8',
      'http://169.254.169.254/latest/meta-data',
      'http://0.0.0.0:3000',
      'http://[::1]:8080',
      'http://[fe80::1]',
      'http://[fd12:3456:789a::1]',
      'http://[::ffff:127.0.0.1]',
    ]

    for (const candidate of blocked) {
      expect(getValidExternalHttpUrl(candidate)).toBeNull()
    }
  })
})
