import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { baseOptions } from '@/lib/layout.shared'
import { source } from '@/lib/source'

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
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
