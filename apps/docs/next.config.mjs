import { createMDX } from 'fumadocs-mdx/next'

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
        destination: '/en/llms.mdx/docs/:path*',
      },
      {
        source: '/:lang/docs/:path*.mdx',
        destination: '/:lang/llms.mdx/docs/:path*',
      },
    ]
  },
}

export default withMDX(config)
