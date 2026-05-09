import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DownloadedBadge } from '../Player/PlayerDownloadAction'

interface PlayerSurfaceArtworkProps {
  isDesktop: boolean
  isVisible: boolean
  activeEpisodeId: string
  coverArtUrl: string | Blob | null
  effectiveCoverArtUrl: string | null
  audioTitle: string
  audioUrl: string | null
}

export function PlayerSurfaceArtwork({
  isDesktop,
  isVisible,
  activeEpisodeId,
  coverArtUrl,
  effectiveCoverArtUrl,
  audioTitle,
  audioUrl,
}: PlayerSurfaceArtworkProps) {
  const { t } = useTranslation()

  if (isDesktop) {
    return (
      <div className="w-96 hidden xl:flex flex-col items-center justify-center p-12 bg-muted/30 border-e border-border/50">
        <div className="relative mb-10">
          <div className="absolute inset-2 shadow-2xl shadow-black/20 rounded-2xl pointer-events-none" />
          <motion.div
            layoutId={isDesktop ? `artwork-${activeEpisodeId}-player` : undefined}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            animate={isVisible ? undefined : false}
            className={cn(
              'relative w-80 h-80 rounded-2xl overflow-hidden bg-white transition-shadow duration-500',
              'ring-1 ring-inset ring-foreground/10',
              !coverArtUrl && 'bg-card'
            )}
          >
            {coverArtUrl ? (
              <>
                <img
                  src={effectiveCoverArtUrl || undefined}
                  alt="Art"
                  className="absolute inset-0 w-full h-full max-w-none block object-cover"
                />
                <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-foreground/10 pointer-events-none" />
              </>
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground/30">
                <span className="text-4xl font-serif">Readio</span>
              </div>
            )}
          </motion.div>
        </div>
        <div className="text-center space-y-3 max-w-xs flex flex-col items-center">
          <div className="flex items-center gap-2 justify-center w-full">
            <h2 className="text-3xl font-bold text-foreground tracking-tight leading-tight truncate">
              {audioTitle || t('untitled')}
            </h2>
            <DownloadedBadge audioUrl={audioUrl} className="flex-shrink-0" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="xl:hidden p-8 pb-0 text-center mb-8">
      <div className="relative mb-6">
        <div className="absolute inset-1 shadow-lg shadow-black/10 rounded-xl pointer-events-none" />
        <motion.div
          layoutId={!isDesktop ? `artwork-${activeEpisodeId}-player` : undefined}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          animate={isVisible ? undefined : false}
          className={cn(
            'relative w-48 h-48 mx-auto rounded-xl overflow-hidden bg-white ring-1 ring-inset ring-foreground/10',
            !coverArtUrl && 'bg-muted'
          )}
        >
          {coverArtUrl && (
            <>
              <img
                src={effectiveCoverArtUrl || undefined}
                className="absolute inset-0 w-full h-full max-w-none block object-cover"
                alt=""
              />
              <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-foreground/10 pointer-events-none" />
            </>
          )}
        </motion.div>
      </div>
      <div className="flex items-center gap-2 justify-center mb-1">
        <h2 className="text-2xl font-bold text-foreground truncate max-w-[85%]">
          {audioTitle || t('untitled')}
        </h2>
        <DownloadedBadge audioUrl={audioUrl} className="flex-shrink-0" />
      </div>
    </div>
  )
}
