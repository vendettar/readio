import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { generate as DefaultImage } from 'fumadocs-ui/og'
import { notFound } from 'next/navigation'
import { ImageResponse } from 'next/og'
import { asDocsPage, getDocsPages, getPageImage, source } from '@/lib/source'

export const revalidate = false

const ogFontPath = path.join(process.cwd(), 'public/fonts/ArialUnicode.ttf')
const ogFontDataPromise = readFile(ogFontPath)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: string; slug: string[] }> }
) {
  const { lang, slug } = await params
  const page = asDocsPage(source.getPage(slug.slice(0, -1), lang))
  if (!page) notFound()
  const ogFontData = await ogFontDataPromise

  return new ImageResponse(
    <DefaultImage title={page.data.title} description={page.data.description} site="Readio Docs" />,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Arial Unicode',
          data: ogFontData,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Arial Unicode',
          data: ogFontData,
          style: 'normal',
          weight: 600,
        },
        {
          name: 'Arial Unicode',
          data: ogFontData,
          style: 'normal',
          weight: 800,
        },
      ],
    }
  )
}

export function generateStaticParams() {
  return getDocsPages().map((page) => ({
    lang: page.locale,
    slug: getPageImage(page).segments,
  }))
}
