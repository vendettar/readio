import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { baseOptions } from '@/lib/layout.shared'

import { i18n } from '@/i18n'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <HomeLayout {...baseOptions()}>{children}</HomeLayout>
}

export function generateStaticParams() {
  return i18n.languages.map((locale: string) => ({ lang: locale }))
}
