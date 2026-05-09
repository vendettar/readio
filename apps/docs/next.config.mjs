import { createMDX } from 'fumadocs-mdx/next'
import { docsDefaultLanguage, getDocsMdxRewriteDestination } from './lib/docsLocale.mjs'

const withMDX = createMDX({
  buildSearchIndex: false,
})

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/docs/:path*.mdx',
        destination: getDocsMdxRewriteDestination(docsDefaultLanguage),
      },
      {
        source: '/:lang/docs/:path*.mdx',
        destination: getDocsMdxRewriteDestination(':lang'),
      },
    ]
  },
}

export default withMDX(config)
