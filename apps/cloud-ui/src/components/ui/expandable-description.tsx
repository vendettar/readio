import { useId, useMemo } from 'react'
import { linkifyHtml, sanitizeHtml, stripHtml } from '../../lib/htmlUtils'
import { cn } from '../../lib/utils'
import { Button } from './button'

export interface ExpandableDescriptionProps {
  content: string
  mode: 'plain' | 'html'
  collapsedLines?: 2 | 3 | 4
  expanded: boolean
  onExpandedChange: (next: boolean) => void
  showMoreLabel: string
  showLessLabel: string
  maxWidthClassName?: string
  isExpandable?: boolean
}

const DESCRIPTION_TRUNCATE_THRESHOLD = 200
const COLLAPSED_LINE_CLASS: Record<2 | 3 | 4, string> = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
}

export function ExpandableDescription({
  content,
  mode,
  collapsedLines = 3,
  expanded,
  onExpandedChange,
  showMoreLabel,
  showLessLabel,
  maxWidthClassName,
  isExpandable = true,
}: ExpandableDescriptionProps) {
  const contentId = useId()
  const safeContent = content ?? ''

  const plainText = useMemo(
    () =>
      mode === 'plain'
        ? stripHtml(safeContent, { preserveLineBreaks: true })
        : stripHtml(safeContent),
    [safeContent, mode]
  )
  const sanitizedHtml = useMemo(
    () => (mode === 'html' ? linkifyHtml(sanitizeHtml(safeContent)) : null),
    [safeContent, mode]
  )
  if (!safeContent) return null

  const shouldTruncate = isExpandable && plainText.length > DESCRIPTION_TRUNCATE_THRESHOLD

  const bodyClassName = cn(
    mode === 'plain'
      ? 'text-xs text-foreground/90 dark:text-white/70 leading-relaxed whitespace-pre-wrap font-light'
      : 'max-w-none whitespace-pre-line',
    isExpandable && !expanded && shouldTruncate && COLLAPSED_LINE_CLASS[collapsedLines]
  )

  return (
    <div className={cn('relative group', maxWidthClassName)}>
      {mode === 'plain' ? (
        <div
          id={contentId}
          className={bodyClassName}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized and linkified
          dangerouslySetInnerHTML={{ __html: linkifyHtml(plainText) }}
        />
      ) : (
        <div className="prose-isolate">
          <div
            id={contentId}
            className={bodyClassName}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized before render
            dangerouslySetInnerHTML={{ __html: sanitizedHtml ?? '' }}
          />
        </div>
      )}

      {isExpandable && !expanded && shouldTruncate && (
        <div className="absolute bottom-0 end-0 flex items-end">
          <div className="w-16 h-5 bg-gradient-to-e from-transparent via-background/80 to-background" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onExpandedChange(true)}
            aria-expanded={expanded}
            aria-controls={contentId}
            className="text-xs text-primary hover:underline font-bold h-auto p-0 bg-background pe-0.5 tracking-tight uppercase hover:bg-transparent"
          >
            {showMoreLabel}
          </Button>
        </div>
      )}

      {isExpandable && expanded && shouldTruncate && (
        <Button
          variant="link"
          onClick={() => onExpandedChange(false)}
          aria-expanded={expanded}
          aria-controls={contentId}
          className="text-xs text-primary h-auto p-0 mt-1"
        >
          {showLessLabel}
        </Button>
      )}
    </div>
  )
}
