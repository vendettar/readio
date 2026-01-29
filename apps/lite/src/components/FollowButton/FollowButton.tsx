// src/components/FollowButton/FollowButton.tsx
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'

interface FollowButtonProps {
  isPlaying: boolean
  isVisible: boolean
  onClick: () => void
}

export function FollowButton({ isPlaying, isVisible, onClick }: FollowButtonProps) {
  const { t } = useTranslation()
  if (!isVisible) return null

  return (
    <Button
      variant="ghost"
      className={cn('follow-current-btn visible', isPlaying && 'playing')}
      onClick={onClick}
    >
      <svg className="wave-icon" viewBox="0 0 64 24" width="48" height="18" fill="currentColor">
        <title>{t('ariaFollow')}</title>
        <rect className="wave-bar bar1" x="2" y="11" width="3" height="10" rx="1.5" />
        <rect className="wave-bar bar2" x="7" y="6" width="3" height="15" rx="1.5" />
        <rect className="wave-bar bar3" x="12" y="9" width="3" height="12" rx="1.5" />
        <rect className="wave-bar bar4" x="17" y="12" width="3" height="9" rx="1.5" />
        <rect className="wave-bar bar5" x="22" y="8" width="3" height="13" rx="1.5" />
        <rect className="wave-bar bar6" x="27" y="5" width="3" height="16" rx="1.5" />
        <rect className="wave-bar bar7" x="32" y="10" width="3" height="11" rx="1.5" />
        <rect className="wave-bar bar8" x="37" y="13" width="3" height="8" rx="1.5" />
        <rect className="wave-bar bar9" x="42" y="7" width="3" height="14" rx="1.5" />
        <rect className="wave-bar bar10" x="47" y="11" width="3" height="10" rx="1.5" />
        <rect className="wave-bar bar11" x="52" y="6" width="3" height="15" rx="1.5" />
        <rect className="wave-bar bar12" x="57" y="9" width="3" height="12" rx="1.5" />
      </svg>
    </Button>
  )
}
