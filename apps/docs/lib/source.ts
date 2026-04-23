import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { type InferPageType, loader, type Page } from 'fumadocs-core/source'
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons'
import type { TOCItemType } from 'fumadocs-core/toc'
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server'
import type { MDXContent } from 'mdx/types'
import browserCollections from '../.source/browser'
import { i18n } from '../i18n'

type RawDocModule = {
  default: MDXContent
  toc: TOCItemType[]
  structuredData?: unknown
  frontmatter?: Record<string, unknown>
  _markdown?: string
  _mdast?: string
} & Record<string, unknown>

type ServerDocPageData = {
  title?: string
  description?: string
  full?: boolean
  body: MDXContent
  toc: TOCItemType[]
  getText: (type: 'raw' | 'processed') => Promise<string>
  getMDAST: () => Promise<unknown>
} & Record<string, unknown>

type ServerMetaData = Record<string, unknown>

const docsRoot = path.join(process.cwd(), 'content/docs')

async function collectMetaFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return collectMetaFiles(absolutePath)
      }
      if (/^meta(\.[a-z-]+)?\.json$/i.test(entry.name)) {
        return [absolutePath]
      }
      return []
    })
  )
  return nested.flat()
}

async function buildMetaEntries() {
  const absolutePaths = await collectMetaFiles(docsRoot)
  return Promise.all(
    absolutePaths.map(async (absolutePath) => {
      const relativePath = path.relative(docsRoot, absolutePath).replaceAll(path.sep, '/')
      const data = JSON.parse(await readFile(absolutePath, 'utf8')) as ServerMetaData
      return {
        ...data,
        info: {
          path: relativePath,
          fullPath: absolutePath,
        },
      }
    })
  )
}

async function buildPageEntries() {
  return Promise.all(
    Object.entries(browserCollections.docs.raw).map(async ([relativePath, load]) => {
      const entry = (await load()) as RawDocModule
      const absolutePath = path.join(docsRoot, relativePath)
      return {
        ...entry.frontmatter,
        body: entry.default,
        toc: entry.toc,
        structuredData: entry.structuredData,
        _exports: entry,
        info: {
          path: relativePath,
          fullPath: absolutePath,
        },
        async getText(type: 'raw' | 'processed') {
          if (type === 'raw') {
            return readFile(absolutePath, 'utf8')
          }
          if (typeof entry._markdown !== 'string') {
            throw new Error(
              "getText('processed') requires includeProcessedMarkdown to be enabled in the docs collection config."
            )
          }
          return entry._markdown
        },
        async getMDAST() {
          if (!entry._mdast) {
            throw new Error(
              'getMDAST() requires includeMDAST to be enabled in the docs collection config.'
            )
          }
          return JSON.parse(entry._mdast)
        },
      }
    })
  )
}

const pageEntries = await buildPageEntries()
const metaEntries = await buildMetaEntries()
const docsSource = toFumadocsSource(pageEntries, metaEntries)

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: '/docs',
  source: docsSource as never,
  plugins: [lucideIconsPlugin()],
  i18n: i18n,
})

type SourcePage = InferPageType<typeof source>

type DocsPageData = SourcePage['data'] & ServerDocPageData

export type DocsPage = Omit<SourcePage, 'data'> & Page<DocsPageData>

export function asDocsPage(page: SourcePage | undefined): DocsPage | undefined {
  return page as DocsPage | undefined
}

export function getDocsPages(language?: string): DocsPage[] {
  return source.getPages(language) as DocsPage[]
}

export function getPageImage(page: DocsPage) {
  const segments = [...page.slugs, 'image.png']
  const localePrefix = page.locale ? `/${page.locale}` : ''

  return {
    segments,
    url: `${localePrefix}/og/docs/${segments.join('/')}`,
  }
}

export async function getLLMText(page: DocsPage) {
  const processed = await page.data.getText('processed')

  return `# ${page.data.title}

${processed}`
}
