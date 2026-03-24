import { RootProvider } from 'fumadocs-ui/provider/next'
import '../global.css'

function normalizeSiteUrl(siteUrl: string): string {
  return /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`
}

const configuredSiteUrl =
  process.env.NEXT_PUBLIC_DOCS_SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL
const metadataBaseUrl = normalizeSiteUrl(configuredSiteUrl ?? 'https://readio.app')

export const metadata = {
  metadataBase: new URL(metadataBaseUrl),
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return (
    <html lang={lang} className="font-sans" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          i18n={{
            locale: lang,
            locales: [
              { name: 'English', locale: 'en' },
              { name: '中文', locale: 'zh' },
            ],
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
