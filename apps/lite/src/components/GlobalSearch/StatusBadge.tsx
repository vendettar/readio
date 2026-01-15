// src/components/GlobalSearch/StatusBadge.tsx
import { Bell, Clock, FolderOpen, Heart } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n'
import type { TranslationKey } from '../../libs/translations'

export type BadgeType = 'favorited' | 'played' | 'subscribed' | 'local'

interface StatusBadgeProps {
  type: BadgeType
  className?: string
}

const badgeConfig: Record<
  BadgeType,
  { icon: typeof Heart; labelKey: TranslationKey; className: string }
> = {
  favorited: {
    icon: Heart,
    labelKey: 'badgeFavorited',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  played: {
    icon: Clock,
    labelKey: 'badgePlayed',
    className: 'bg-secondary text-secondary-foreground border-border',
  },
  subscribed: {
    icon: Bell,
    labelKey: 'badgeSubscribed',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  local: {
    icon: FolderOpen,
    labelKey: 'badgeLocal',
    className: 'bg-accent text-accent-foreground border-border',
  },
}

export function StatusBadge({ type, className = '' }: StatusBadgeProps) {
  const { t } = useI18n()
  const config = badgeConfig[type]
  const Icon = config.icon
  const label = t(config.labelKey)

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className} ${className}`}
      title={label}
    >
      <Icon className="h-3 w-3" />
      <span className="hidden sm:inline">{label}</span>
    </span>
  )
}
