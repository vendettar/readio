import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { baseOptions } from '@/lib/layout.shared'
import { source } from '@/lib/source'

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return (
    <DocsLayout
      tree={source.getPageTree(lang)}
      {...baseOptions()}
      sidebar={{
        banner: (
          <div className="flex flex-col gap-2 p-2">
            <LanguageSwitcher />
          </div>
        ),
      }}
      containerProps={{
        id: 'nd-docs-layout',
        style: {
          maxWidth: 'none',
          margin: 0,
          // Force the grid columns to be fixed for the sidebar
          gridTemplateColumns: 'var(--fd-sidebar-width) minmax(0, 1fr) var(--fd-toc-width, 0px)',
          width: '100%',
        } as React.CSSProperties,
      }}
    >
      {children}
    </DocsLayout>
  )
}
