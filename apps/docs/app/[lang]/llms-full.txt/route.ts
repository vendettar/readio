import { getDocsPages, getLLMText } from '@/lib/source'

export const revalidate = false

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const scan = getDocsPages(lang).map(getLLMText)
  const scanned = await Promise.all(scan)

  return new Response(scanned.join('\n\n'))
}
