import { Book, Copy, Search, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { DictEntry, SelectionState } from '../../lib/selection'
import { Button } from '../ui/button'

interface ContextMenuProps {
  state: SelectionState
  onCopy: () => void
  onSearch: () => void
  onLookup: () => void
  onClose: () => void
}

export function ContextMenu({ state, onCopy, onSearch, onLookup, onClose }: ContextMenuProps) {
  const { t } = useTranslation()

  if (!state.showMenu) return null

  const isEligibleForLookup =
    state.menuMode === 'word' &&
    /^[A-Za-z][A-Za-z0-9]*(?:[''-][A-Za-z0-9]+)*$/.test(state.selectedText) &&
    state.selectedText.length <= 64

  return (
    <>
      <div className="fixed inset-0 z-modal" onClick={onClose} />
      <div
        className="fixed z-modal min-w-36 p-0 bg-popover text-popover-foreground border rounded-lg shadow-xl flex flex-col gap-0 animate-in fade-in zoom-in-95 duration-100 -translate-x-1/2 -translate-y-full -translate-y-2 overflow-hidden"
        style={{
          left: state.menuPosition.x,
          top: state.menuPosition.y,
        }}
      >
        <Button variant="ghost" className="justify-start px-3 py-2 h-auto text-sm" onClick={onCopy}>
          <Copy size={16} className="opacity-70 mr-2" />
          {t('copyLine')}
        </Button>
        <Button
          variant="ghost"
          className="justify-start px-3 py-2 h-auto text-sm"
          onClick={onSearch}
        >
          <Search size={16} className="opacity-70 mr-2" />
          {t('searchWeb')}
        </Button>
        {isEligibleForLookup && (
          <Button
            variant="ghost"
            className="justify-start px-3 py-2 h-auto text-sm font-medium text-primary"
            onClick={onLookup}
          >
            <Book size={16} className="opacity-70 mr-2" />
            {t('lookUp')}
          </Button>
        )}
      </div>
    </>
  )
}

interface LookupPopoverProps {
  state: SelectionState
  onClose: () => void
}

export function LookupPopover({ state, onClose }: LookupPopoverProps) {
  const { t } = useTranslation()
  if (!state.showLookup) return null

  // Position calculation
  const margin = 10
  let left = state.lookupPosition.x
  let top = state.lookupPosition.y

  // Ensure within viewport
  const popoverWidth = 320
  const popoverHeight = 300

  if (left + popoverWidth > window.innerWidth - margin) {
    left = window.innerWidth - popoverWidth - margin
  }
  if (left < margin) left = margin

  if (top + popoverHeight / 2 > window.innerHeight - margin) {
    top = window.innerHeight - popoverHeight / 2 - margin
  }
  if (top - popoverHeight / 2 < margin) {
    top = popoverHeight / 2 + margin
  }

  return (
    <>
      <div
        className="fixed inset-0 z-modal bg-foreground/20 animate-in fade-in"
        onClick={onClose}
      />
      <div
        className="fixed z-modal w-80 max-h-96 bg-popover text-popover-foreground border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 -translate-y-1/2"
        style={{
          left,
          top,
        }}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div className="text-lg font-bold tracking-tight">{state.lookupWord}</div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {state.lookupLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
              {t('loading')}
            </div>
          )}
          {state.lookupErrorKey && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20">
              {t(state.lookupErrorKey)}
            </div>
          )}
          {state.lookupResult && <DictContent entry={state.lookupResult} />}
        </div>
      </div>
    </>
  )
}

function DictContent({ entry }: { entry: DictEntry }) {
  return (
    <div className="space-y-4">
      {entry.phonetic && (
        <div className="text-sm font-serif italic text-muted-foreground">{entry.phonetic}</div>
      )}
      {entry.meanings.map((meaning, idx: number) => (
        <div key={idx} className="space-y-2">
          <div className="text-xs font-black uppercase tracking-widest text-primary/60">
            {meaning.partOfSpeech}
          </div>
          <ol className="space-y-3">
            {meaning.definitions.map((def, defIdx: number) => (
              <li key={defIdx} className="text-sm space-y-1">
                <div className="leading-relaxed">{def.definition}</div>
                {def.example && (
                  <div className="text-xs italic text-muted-foreground bg-muted/30 p-2 rounded-md border-l-2 border-primary/20">
                    "{def.example}"
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

interface WordHoverOverlayProps {
  rects: DOMRect[]
  isPressed?: boolean
}

export function WordHoverOverlay({ rects, isPressed }: WordHoverOverlayProps) {
  if (rects.length === 0) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-overlay">
      {rects.map((rect, idx) => (
        <div
          key={idx}
          className={`absolute rounded bg-primary/20 transition-all duration-75 ${isPressed ? 'bg-primary/40' : ''} left-[var(--x)] top-[var(--y)] w-[var(--w)] h-[var(--h)]`}
          style={
            {
              '--x': `${rect.left - 2}px`,
              '--y': `${rect.top - 2}px`,
              '--w': `${rect.width + 4}px`,
              '--h': `${rect.height + 4}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
