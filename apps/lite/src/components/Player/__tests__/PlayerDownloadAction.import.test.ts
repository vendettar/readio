import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('PlayerDownloadAction module', () => {
  it('does not default-import runtimeConfig (browser ESM-safe)', () => {
    const file = resolve(process.cwd(), 'src/components/Player/PlayerDownloadAction.tsx')
    const source = readFileSync(file, 'utf-8')
    expect(source).not.toMatch(
      /import\s+runtimeConfig\s+from\s+['"]\.\.\/\.\.\/lib\/runtimeConfig['"]/
    )
  })
})
