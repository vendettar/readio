import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('EpisodeDetailDownloadButton module', () => {
  it('does not default-import runtimeConfig (browser ESM-safe)', () => {
    const file = resolve(
      process.cwd(),
      'src/routeComponents/podcast/EpisodeDetailDownloadButton.tsx'
    )
    const source = readFileSync(file, 'utf-8')
    expect(source).not.toMatch(/import\s+runtimeConfig\s+from\s+['"]@\/lib\/runtimeConfig['"]/)
  })
})
