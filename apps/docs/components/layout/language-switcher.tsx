'use client'

import { buttonVariants } from 'fumadocs-ui/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover'
import { useI18n } from 'fumadocs-ui/contexts/i18n'
import { Languages } from 'lucide-react'

function cn(...inputs: unknown[]) {
  return inputs.filter(Boolean).join(' ')
}

export function LanguageSwitcher() {
  const { locale, locales, onChange, text } = useI18n()

  if (!locales || locales.length <= 1) return null

  const current = locales.find((l) => l.locale === locale)

  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ color: 'ghost' }), 'w-full justify-start gap-2 px-2')}
        aria-label={text.chooseLanguage}
      >
        <Languages className="size-4" />
        <span className="text-sm font-medium">{current?.name ?? 'Language'}</span>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col p-1 min-w-[120px]">
        {locales.map((item) => (
          <button
            key={item.locale}
            type="button"
            className={cn(
              'rounded-md p-2 text-start text-sm transition-colors',
              item.locale === locale
                ? 'bg-fd-primary/10 text-fd-primary'
                : 'hover:bg-fd-accent hover:text-fd-accent-foreground'
            )}
            onClick={() => onChange?.(item.locale)}
          >
            {item.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
