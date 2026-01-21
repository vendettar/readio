import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Readio Docs',
      transparentMode: 'top',
    },
    i18n: true,
  }
}
