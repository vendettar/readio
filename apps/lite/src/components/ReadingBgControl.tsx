import { useTranslation } from 'react-i18next'
import { type ReadingBg, useThemeStore } from '../store/themeStore'
import { Button } from './ui/button'
import { Label } from './ui/label'

export function ReadingBgControl() {
  const { readingBg, setReadingBg } = useThemeStore()
  const { t } = useTranslation()

  const readingBgs = [
    { id: 'default', label: t('readingBgDefault'), bg: 'bg-background' },
    { id: 'sepia', label: t('readingBgSepia'), bg: 'bg-amber-100' },
    { id: 'paper', label: t('readingBgPaper'), bg: 'bg-zinc-100' },
    { id: 'dim', label: t('readingBgDim'), bg: 'bg-zinc-800' },
    { id: 'dark', label: t('readingBgDark'), bg: 'bg-zinc-950' },
    { id: 'slate', label: t('readingBgSlate'), bg: 'bg-slate-950' },
  ] as const

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">{t('readingBgTitle')}</Label>
      <div className="grid grid-cols-2 gap-2">
        {readingBgs.map((b) => (
          <Button
            key={b.id}
            variant={readingBg === b.id ? 'default' : 'outline'}
            className="h-9 text-xs flex items-center justify-start gap-2"
            onClick={() => setReadingBg(b.id as ReadingBg)}
          >
            <div className={`w-3 h-3 rounded-full border ${b.bg}`} />
            {b.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('readingBgHint')}</p>
    </div>
  )
}
