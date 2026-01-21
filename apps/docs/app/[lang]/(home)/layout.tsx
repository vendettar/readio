import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { i18n } from '@/i18n'
import { baseOptions } from '@/lib/layout.shared'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <HomeLayout {...baseOptions()}>{children}</HomeLayout>
}

export function generateStaticParams() {
  return i18n.languages.map((locale: string) => ({ lang: locale }))
}
