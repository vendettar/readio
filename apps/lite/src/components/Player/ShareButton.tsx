import { Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../lib/toast'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

interface ShareButtonProps {
  title: string
  url: string
}

export function ShareButton({ title, url }: ShareButtonProps) {
  const { t } = useTranslation()

  const handleShare = async () => {
    const shareUrl = url || window.location.href
    const shareData = { title, url: shareUrl }
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData)
        toast.successKey('player.shareSuccess')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.errorKey('player.shareError')
        }
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl)
        toast.successKey('copySuccess')
      } catch (_err) {
        toast.errorKey('copyFail')
      }
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={handleShare} aria-label={t('player.share')}>
          <Share2 size={20} strokeWidth={1.5} />
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={5}>{t('player.share')}</TooltipContent>
    </Tooltip>
  )
}
