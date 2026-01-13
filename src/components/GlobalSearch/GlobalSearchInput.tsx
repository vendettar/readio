import { useNavigate } from '@tanstack/react-router'
import { Search, X } from 'lucide-react'
import { useRef } from 'react'
import { useEventListener } from '../../hooks/useEventListener'
import { useI18n } from '../../hooks/useI18n'
import { useSearchStore } from '../../store/searchStore'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

export function GlobalSearchInput() {
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { t } = useI18n()
  const { query, setQuery, openOverlay, closeOverlay, clearSearch } = useSearchStore()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      closeOverlay()
      navigate({ to: '/search', search: { q: query } })
    } else if (e.key === 'Escape') {
      closeOverlay()
      inputRef.current?.blur()
    }
  }

  const handleFocus = () => {
    if (query.length > 0) {
      openOverlay()
    }
  }

  const handleClear = () => {
    clearSearch()
    inputRef.current?.focus()
  }

  // Global keyboard shortcut: Cmd/Ctrl + K to focus search
  useEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      inputRef.current?.focus()
    }
  })

  return (
    <div className="relative px-4 pb-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          id="global-search-input"
          name="q"
          type="text"
          placeholder={t('searchPlaceholderGlobal')}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          className="pl-9 pr-9 bg-muted/50 border-border focus:bg-background focus-visible:ring-2 focus-visible:ring-primary transition-colors"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            aria-label={t('searchClearAria')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
