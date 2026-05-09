export const docsDefaultLanguage = 'en'

export const docsLanguages = ['en', 'zh']

export const docsLocaleLabels = {
  en: 'English',
  zh: '中文',
}

export const docsSearchLocaleMap = {
  en: { language: 'english' },
  zh: { language: 'english' },
}

export const docsProxyMatcher = ['/((?!api|_next/static|_next/image|.*\\..*).*)']

export function getDocsLocaleOptions() {
  return docsLanguages.map((locale) => ({
    locale,
    name: docsLocaleLabels[locale],
  }))
}

export function getDocsMdxRewriteDestination(locale = docsDefaultLanguage) {
  return `/${locale}/llms.mdx/docs/:path*`
}
