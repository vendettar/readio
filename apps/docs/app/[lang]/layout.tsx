import { RootProvider } from 'fumadocs-ui/provider/next'
import '../global.css'
import { Inter } from 'next/font/google'
import { i18n } from '../../i18n'

const inter = Inter({
  subsets: ['latin'],
})

export const metadata = {
  metadataBase: new URL('http://localhost:3000'),
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
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider i18n={{
          locale: lang,
          locales: [
            { name: 'English', locale: 'en' },
            { name: '中文', locale: 'zh' }
          ]
        }}>
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
