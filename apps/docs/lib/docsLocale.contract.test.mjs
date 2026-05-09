import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  docsDefaultLanguage,
  docsLanguages,
  docsLocaleLabels,
  docsProxyMatcher,
  docsSearchLocaleMap,
  getDocsLocaleOptions,
  getDocsMdxRewriteDestination,
} from './docsLocale.mjs'

test('docs locale contract stays aligned across consumers', () => {
  assert.equal(docsDefaultLanguage, 'en')
  assert.deepEqual(docsLanguages, ['en', 'zh'])
  assert.deepEqual(docsLocaleLabels, {
    en: 'English',
    zh: '中文',
  })
  assert.deepEqual(getDocsLocaleOptions(), [
    { locale: 'en', name: 'English' },
    { locale: 'zh', name: '中文' },
  ])
  assert.deepEqual(docsSearchLocaleMap, {
    en: { language: 'english' },
    zh: { language: 'english' },
  })
  assert.equal(getDocsMdxRewriteDestination(), '/en/llms.mdx/docs/:path*')
  assert.equal(getDocsMdxRewriteDestination('zh'), '/zh/llms.mdx/docs/:path*')
})

test('docs proxy matcher excludes dotted static and special assets', () => {
  assert.deepEqual(docsProxyMatcher, ['/((?!api|_next/static|_next/image|.*\\..*).*)'])
})

test('proxy config keeps matcher as a static literal for Next route config', () => {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const proxySource = readFileSync(join(currentDir, '../proxy.ts'), 'utf8')

  assert.match(
    proxySource,
    /matcher:\s*\['\/\(\(\?!api\|_next\/static\|_next\/image\|\.\*\\\\\.\.\*\)\.\*\)'\]/
  )
})
