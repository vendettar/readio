import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const sourcePath = join(currentDir, './source.ts')
const generatedServerPath = join(currentDir, '../.source/server.ts')

test('source adapter uses generated docs collection as the single authority', () => {
  const sourceCode = readFileSync(sourcePath, 'utf8')

  assert.match(
    sourceCode,
    /import\s+\{\s*docs\s+as\s+generatedDocs\s*\}\s+from\s+'\.\.\/\.source\/server'/
  )
  assert.match(sourceCode, /const docsSource = generatedDocs\.toFumadocsSource\(\)/)
  assert.doesNotMatch(sourceCode, /\bcollectMetaFiles\b/)
  assert.doesNotMatch(sourceCode, /\bbuildMetaEntries\b/)
  assert.doesNotMatch(sourceCode, /\bbuildPageEntries\b/)
  assert.doesNotMatch(sourceCode, /\bbrowserCollections\b/)
  assert.doesNotMatch(sourceCode, /node:fs\/promises/)
  assert.doesNotMatch(sourceCode, /getMDAST/)
})

test('generated docs collection keeps non-meta collection assets reachable by source', () => {
  const generatedServerCode = readFileSync(generatedServerPath, 'utf8')

  assert.match(generatedServerCode, /general\/api\/podcastindex\/podcastindex_api\.json/)
})

test('LLM export still uses processed markdown from docs pages', () => {
  const sourceCode = readFileSync(sourcePath, 'utf8')

  assert.match(sourceCode, /page\.data\.getText\('processed'\)/)
})
