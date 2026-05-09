import { type InferPageType, loader, type Page } from 'fumadocs-core/source'
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons'
import type { TOCItemType } from 'fumadocs-core/toc'
import type { MDXContent } from 'mdx/types'
import { docs as generatedDocs } from '../.source/server'
import { i18n } from '../i18n'

type ServerDocPageData = {
  title?: string
  description?: string
  full?: boolean
  body: MDXContent
  toc: TOCItemType[]
  getText: (type: 'raw' | 'processed') => Promise<string>
} & Record<string, unknown>

const docsSource = generatedDocs.toFumadocsSource()

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: '/docs',
  source: docsSource as never,
  plugins: [lucideIconsPlugin()],
  i18n,
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
