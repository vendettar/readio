import {
  baseEnglishTranslations,
  type Language,
  languageNativeNames,
  localeLoaders,
} from '../src/lib/translations'

type TranslationObject = Record<string, unknown>

function getDeepKeys(obj: TranslationObject, prefix = ''): string[] {
  return Object.keys(obj).reduce((res: string[], el) => {
    const val = obj[el]
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      res.push(...getDeepKeys(val as TranslationObject, `${prefix}${el}.`))
    } else {
      res.push(`${prefix}${el}`)
    }
    return res
  }, [])
}

async function loadLocale(lang: Language): Promise<TranslationObject> {
  const locale = await localeLoaders[lang]()
  return locale as TranslationObject
}

const baseLang: Language = 'en'
const baseKeysList = getDeepKeys(baseEnglishTranslations as TranslationObject)
const baseKeys = new Set(baseKeysList)
const allLanguages = Object.keys(languageNativeNames) as Language[]
const otherLangs = allLanguages.filter((lang) => lang !== baseLang)

let hasError = false

console.log(`Checking i18n coverage against '${baseLang}'...`)

for (const lang of otherLangs) {
  const currentLocale = await loadLocale(lang)
  const currentKeys = getDeepKeys(currentLocale)
  const currentKeysSet = new Set(currentKeys)

  const missing = baseKeysList.filter((k) => !currentKeysSet.has(k)).sort()
  if (missing.length > 0) {
    console.error(`❌ Language '${lang}' is missing ${missing.length} keys:`)
    for (const k of missing) {
      console.error(`   - ${k}`)
    }
    hasError = true
  }

  const extra = currentKeys.filter((k) => !baseKeys.has(k)).sort()
  if (extra.length > 0) {
    console.error(`❌ Language '${lang}' has ${extra.length} extra keys (not in '${baseLang}'):`)
    for (const k of extra) {
      console.error(`   - ${k}`)
    }
    hasError = true
  }
}

if (hasError) {
  process.exit(1)
}

console.log('✅ i18n coverage audit passed!')
